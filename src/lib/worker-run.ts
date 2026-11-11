import { setTimeout as sleep } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apifyEnabled, apifyGoogle, braveWeb, googleEnabled, ProviderError, readerEnabled, retryDelay, searchEnabled, searchKey, searchPlaces, type WebResult } from "./providers";
import { enrichmentPayload, readSite } from "./enrichment";
import { researchLead } from "./research";
import { apifyAds, apifyProfile, socialLead } from "./social";
import { domain } from "./domain";
import { apifyMaps, placeToLead } from "./maps";
/**
 * Robô que esvazia a fila (pesquisas no Maps e leituras de site). Roda na Vercel (rota /api/worker, cron e após o clique)
 * e no terminal (npm run worker). As filas usam lease no banco, então várias execuções ao mesmo tempo não pegam o mesmo item.
 */
let db:SupabaseClient;
let stopping=false;
export const stopWorker=()=>{stopping=true;};
type Job={id:string;lease_token:string;city:string;region:string;districts:string;segment:string;desired:number;attempt:number;page_token:string|null;result_count:number;scan_finished:boolean};
async function finish(job:Job,state:string,error:string|null=null,delay=0){
  const result=await db.rpc("finish_research",{p_job:job.id,p_lease:job.lease_token,p_state:state,p_error:error,p_delay:delay});
  if(result.error)console.error("Falha ao concluir job; a recuperação por lease continuará.",result.error.code);
}
// Apify: uma execução do Google Maps Scraper e as empresas vão direto para a carteira (store_maps_leads → create_lead).
async function runMaps(job:Job){
  if(job.scan_finished||job.result_count>=job.desired){await finish(job,"completed");return;}
  const lease=await db.rpc("reserve_research_request",{p_job:job.id,p_lease:job.lease_token});
  if(lease.error){await finish(job,lease.error.code==="P2005"?"limit_reached":"pending",lease.error.code==="P2005"?"query_budget":"database",retryDelay(job.attempt,0));return;}
  if(!lease.data){await finish(job,"cancelled");return;}
  const beat=setInterval(()=>{void db.rpc("extend_research_lease",{p_job:job.id,p_lease:job.lease_token});},30000);
  try{
    const query=[job.segment,job.districts,job.city,job.region].filter(Boolean).join(" ");
    // folga de 5 para as que já estão na carteira, sem pagar por muito mais que o pedido
    const places=await apifyMaps(query,Math.min(80,job.desired-job.result_count+5),process.env.APIFY_TOKEN!);
    const rows=places.flatMap(p=>{const row=placeToLead(p,job);return row?[row]:[];});
    const saved=await db.rpc("store_maps_leads",{p_job:job.id,p_lease:job.lease_token,p_rows:rows});
    if(saved.error)throw new ProviderError("database",true);
    const progress=saved.data?.[0];
    if(!progress)return;
    console.log("Pesquisa no Maps: "+places.length+" lugares, "+progress.created+" empresas novas na carteira.");
    await finish(job,progress.cancelled?"cancelled":"completed");
  }catch(cause){
    const error=cause instanceof ProviderError?cause:new ProviderError("unknown");
    await finish(job,error.retriable?"pending":error.code==="credentials"?"awaiting_configuration":"failed",error.code,retryDelay(job.attempt,error.retryAfter));
  }finally{clearInterval(beat);}
}
async function run(job:Job){
  if(apifyEnabled()){await runMaps(job);return;}
  if(!googleEnabled()){await finish(job,"awaiting_configuration","provider_disabled");return;}
  const apiKey=process.env.GOOGLE_PLACES_API_KEY!;
  let next=job.page_token;
  let count=job.result_count;
  if(job.scan_finished||count>=job.desired){await finish(job,"completed");return;}
  const size=Math.min(20,job.desired);
  const query=[job.segment,job.districts,job.city,job.region,"Brasil"].filter(Boolean).join(", ");
  while(!stopping){
    const lease=await db.rpc("reserve_research_request",{p_job:job.id,p_lease:job.lease_token});
    if(lease.error){
      if(lease.error.code==="P2005")await finish(job,"limit_reached","query_budget");
      else { console.error("Falha na reserva.",lease.error.code);await finish(job,"pending","database",retryDelay(job.attempt,0)); }
      return;
    }
    if(!lease.data){await finish(job,"cancelled");return;}
    try {
      const page=await searchPlaces(query,size,next,apiKey);
      const token=page.nextPageToken??null;
      const saved=await db.rpc("store_research_page",{p_job:job.id,p_lease:job.lease_token,p_ids:page.places.map(place=>place.id),p_next:token});
      if(saved.error)throw new ProviderError("database",true);
      const progress=saved.data?.[0];
      if(!progress)return;
      if(progress.cancelled){await finish(job,"cancelled");return;}
      count=progress.result_count;
      if(count>=job.desired||!token){await finish(job,"completed");return;}
      if(token===next){await finish(job,"partial","pagination_stalled");return;}
      next=token;
    }catch(cause){
      const error=cause instanceof ProviderError?cause:new ProviderError("unknown");
      await finish(job,error.retriable&&error.retryAfter<=3600?"pending":error.code==="credentials"&&count===0?"awaiting_configuration":"failed",error.code,retryDelay(job.attempt,error.retryAfter));
      return;
    }
  }
  await finish(job,"pending","worker_stopped",1);
}
type Enrichment={organization_id:string;lead_id:string;lease_token:string;domain:string|null;name:string;city:string;region:string;phones:string[]};
async function enrich(item:Enrichment){
  let result:ReturnType<typeof enrichmentPayload>|null=null,error:string|null=null;
  // etapa visível na tela; também renova o lease nas etapas demoradas
  const step=(label:string)=>db.rpc("enrichment_step",{p_org:item.organization_id,p_lead:item.lead_id,p_lease:item.lease_token,p_step:label}).then(()=>undefined,()=>undefined);
  console.log("Lendo: "+item.name);
  if(!item.domain&&!searchEnabled())error="no_domain";
  else try{
    if(item.domain)await step("Lendo o site "+item.domain);
    const site=item.domain?await readSite(item.domain):null;
    // cada busca é reservada no banco antes da chamada; cota esgotada ou motor fora encerra a pesquisa, não a leitura
    let stopped:"quota"|"provider"|null=null;
    const provider=apifyEnabled()?"apify":"brave";
    const cache=new Map<string,WebResult[]>();
    const reserve=async(count:number)=>{
      const reserved=await db.rpc("reserve_enrichment_search",{p_org:item.organization_id,p_lead:item.lead_id,p_lease:item.lease_token,p_provider:provider,p_count:count});
      if(reserved.error?.code==="P2005"){stopped="quota";return false;}
      if(reserved.error||!reserved.data)throw new Error("reservation");
      return true;
    };
    const run=async(queries:string[])=>{
      const fresh=[...new Set(queries.map(searchKey))].filter(q=>!cache.has(q));
      if(stopped||!fresh.length||!await reserve(fresh.length))return;
      await step("Pesquisando site, Instagram e CNPJ no Google");
      try{
        if(provider==="apify")for(const [q,rows] of await apifyGoogle(fresh,process.env.APIFY_TOKEN!))cache.set(q,rows);
        else for(const q of fresh)cache.set(q,await braveWeb(q,10,process.env.BRAVE_SEARCH_API_KEY!));
      }catch(cause){
        if(!(cause instanceof ProviderError))throw cause;
        stopped="provider";console.error("Pesquisa da leitura indisponível.",cause.code);
      }
    };
    const search=async(q:string)=>{await run([q]);return cache.get(searchKey(q))??[];};
    const research=searchEnabled()?await researchLead({name:item.name,city:item.city,region:item.region,phones:item.phones??[]},site,{search,prefetch:provider==="apify"?run:undefined}):null;
    // Instagram e anúncios da Meta, só pelo Apify. Cada execução do ator é reservada como uma busca.
    const current=research?.site??site;
    const siteInsta=current?.ok?current.found.instagram:null;
    const searchInsta=research?.contacts.find(c=>c.kind==="instagram");
    let social:Awaited<ReturnType<typeof socialLead>>|null=null;
    if(apifyEnabled()){
      const token=process.env.APIFY_TOKEN!;
      const guarded=async<T>(call:()=>Promise<T>):Promise<T|undefined>=>{
        if(stopped||!await reserve(1))return undefined;
        try{return await call();}catch(cause){if(!(cause instanceof ProviderError))throw cause;stopped="provider";return undefined;}
      };
      await step("Conferindo Instagram e anúncios na Meta");
      social=await socialLead({name:item.name,phones:item.phones??[]},siteInsta??(searchInsta?"https://www.instagram.com/"+searchInsta.normalized:null),!siteInsta,
        current?.ok?domain(current.url):item.domain,{profile:u=>guarded(()=>apifyProfile(u,token)),ads:n=>guarded(()=>apifyAds(n,token))});
    }
    const contacts=social?.dropped?(research?.contacts??[]).filter(c=>c.kind!=="instagram"):research?.contacts??[];
    result=enrichmentPayload(current??{ok:false,error:"sem domínio informado e nenhum site confirmado na pesquisa"},
      {...research?.extra,instagram:Boolean(siteInsta)||(Boolean(research?.extra.instagram)&&!social?.dropped),ads:Boolean(social?.adsActive)});
    if(research)result.evidence.push(...research.evidence);
    // logo do Instagram entra logo depois da leitura do site, para não ser cortado pelo limite de evidências
    if(social){
      const current=result;
      current.evidence.splice(1,0,...social.evidence.filter(e=>e.kind==="Logo"&&!current.evidence.some(x=>x.kind==="Logo")));
      current.evidence.push(...social.evidence.filter(e=>e.kind!=="Logo"));
    }
    result.contacts.push(...contacts);
    const why={quota:"A cota diária de pesquisas da leitura automática acabou.",provider:"O motor de pesquisa ("+provider+") recusou ou não respondeu; confira a chave e o crédito."} as const;
    if(stopped)result.evidence.push({kind:"Pesquisa interrompida",observed:why[stopped as keyof typeof why]+" O que faltou pode ser pedido de novo depois.",url:null,excerpt:null});
  }catch{error="reader_failed";}
  console.log("Leitura "+(error?"falhou ("+error+")":"concluída")+": "+item.name);
  const saved=await db.rpc("finish_enrichment",{p_org:item.organization_id,p_lead:item.lead_id,p_lease:item.lease_token,p_result:result,p_error:error});
  if(saved.error)console.error("Falha ao gravar leitura do site; o lease permite nova tentativa.",saved.error.code);
}
/** Processa a fila até esvaziar ou até `until` (não pega item novo depois disso). `forever`: fica esperando itens novos (terminal). */
export async function runQueue({until=Infinity,forever=false}:{until?:number;forever?:boolean}={}) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY onde o robô roda.");
  if(process.env.ENABLE_APIFY==="true"&&!process.env.APIFY_TOKEN){console.error("ENABLE_APIFY ligado sem APIFY_TOKEN: o Apify fica desligado nesta execução.");process.env.ENABLE_APIFY="false";}
  db??=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  let done=0;
  while(!stopping){
    if(Date.now()>until){console.log("Tempo da rodada esgotado; o restante fica para a próxima.");break;}
    try {
      const {data,error}=await db.rpc("claim_research");
      if(error){console.error("Fila indisponível.",error.code);if(!forever)break;await sleep(5000);continue;}
      const job=data?.[0] as Job|undefined;
      if(job){await run(job);done++;continue;}
      if(readerEnabled()){
        const next=await db.rpc("claim_enrichment");
        if(next.error)console.error("Fila de leitura indisponível.",next.error.code);
        const item=next.data?.[0] as Enrichment|undefined;
        if(item){await enrich(item);done++;continue;}
      }
      if(!forever)break;
      await sleep(1500);
    }catch(cause){
      console.error("Execução interrompida; o lease permite recuperar o item.",cause instanceof Error?cause.message:"");
      if(!forever)break;
      await sleep(5000);
    }
  }
  return done;
}
