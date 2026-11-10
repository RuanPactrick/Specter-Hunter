import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { braveEnabled, braveWeb, googleEnabled, ProviderError, readerEnabled, retryDelay, searchPlaces, type WebResult } from "../src/lib/providers";
import { enrichmentPayload, readSite } from "../src/lib/enrichment";
import { researchLead } from "../src/lib/research";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error("Configure a URL do Supabase e a chave service role no processo do worker.");
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
let stopping=false;
process.on("SIGINT",()=>{stopping=true;});
process.on("SIGTERM",()=>{stopping=true;});
type Job={id:string;lease_token:string;city:string;region:string;districts:string;segment:string;desired:number;attempt:number;page_token:string|null;result_count:number;scan_finished:boolean};
async function finish(job:Job,state:string,error:string|null=null,delay=0){
  const result=await db.rpc("finish_research",{p_job:job.id,p_lease:job.lease_token,p_state:state,p_error:error,p_delay:delay});
  if(result.error)console.error("Falha ao concluir job; a recuperação por lease continuará.",result.error.code);
}
async function run(job:Job){
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
  if(!item.domain&&!braveEnabled())error="no_domain";
  else try{
    const site=item.domain?await readSite(item.domain):null;
    let quota=false;
    // cada busca é reservada no banco antes de chamar o Brave; cota esgotada encerra a pesquisa, não a leitura
    const search=async(q:string):Promise<WebResult[]>=>{
      if(quota)return [];
      const reserved=await db.rpc("reserve_enrichment_search",{p_org:item.organization_id,p_lead:item.lead_id,p_lease:item.lease_token});
      if(reserved.error?.code==="P2005"){quota=true;return [];}
      if(reserved.error||!reserved.data)throw new Error("reservation");
      return braveWeb(q,10,process.env.BRAVE_SEARCH_API_KEY!);
    };
    const research=braveEnabled()?await researchLead({name:item.name,city:item.city,region:item.region,phones:item.phones??[]},site,{search}):null;
    result=enrichmentPayload(research?.site??site??{ok:false,error:"sem domínio informado e nenhum site confirmado na pesquisa"},research?.extra);
    if(research){result.evidence.push(...research.evidence);result.contacts.push(...research.contacts);}
    if(quota)result.evidence.push({kind:"Pesquisa interrompida",observed:"A cota diária de pesquisas da leitura automática acabou. O que faltou pode ser pedido de novo amanhã.",url:null,excerpt:null});
  }catch{error="reader_failed";}
  const saved=await db.rpc("finish_enrichment",{p_org:item.organization_id,p_lead:item.lead_id,p_lease:item.lease_token,p_result:result,p_error:error});
  if(saved.error)console.error("Falha ao gravar leitura do site; o lease permite nova tentativa.",saved.error.code);
}
async function main(){
  console.log("Worker Specter Hunter iniciado. Uma execução por processo.");
  while(!stopping){
    try {
      const {data,error}=await db.rpc("claim_research");
      if(error){console.error("Fila indisponível.",error.code);await sleep(5000);continue;}
      const job=data?.[0] as Job|undefined;
      if(job){await run(job);continue;}
      if(readerEnabled()){
        const next=await db.rpc("claim_enrichment");
        if(next.error)console.error("Fila de leitura indisponível.",next.error.code);
        const item=next.data?.[0] as Enrichment|undefined;
        if(item){await enrich(item);continue;}
      }
      await sleep(1500);
    }catch{
      console.error("Execução interrompida; o lease permite recuperar o job.");
      await sleep(5000);
    }
  }
}
void main().catch(()=>{process.exitCode=1;});
