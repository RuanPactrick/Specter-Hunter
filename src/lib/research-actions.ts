"use server";
import { z } from "zod";
import { context } from "./auth";
import { loadLead } from "./data";
import { nameKey, regions, publicUrl } from "./domain";
import { message,on,optionalText,parse,saveError,text } from "./forms";
import { braveEnabled,braveSearch,googleEnabled,placeDetails,ProviderError,readerEnabled,searchEnabled } from "./providers";
import { inspectOfficial } from "./reader";
const path="/app/pesquisa";
const uuid=z.uuid();
const placeId=z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
export type LookupState = { error?:string; notice?:string; items?:{title:string;url?:string;description?:string}[]; source?:string };
export async function startResearch(data:FormData) {
  const {db,org}=await context();
  if(!googleEnabled())message(path,"Google Places está desativado ou sem chave. O cadastro manual continua disponível.");
  const f=parse(z.object({request_id:uuid,city:text(100),region:z.enum(regions),districts:optionalText(250),segment:text(150),desired:z.coerce.number().int().min(1).max(60),max_queries:z.coerce.number().int().min(1).max(10),skip_seen:on}),data,path);
  if(data.get("authorize")!=="on")message(path,"Confirme o limite de consultas e as regras da fonte.");
  const {data:id,error}=await db.rpc("enqueue_research",{p_org:org.id,p_request:f.request_id,p_city:f.city,p_region:f.region,p_districts:f.districts,p_segment:f.segment,p_desired:f.desired,p_max_queries:f.max_queries,p_skip_seen:f.skip_seen});
  saveError(path,error);
  if(typeof id!=="string")message(path,"Não foi possível iniciar a pesquisa.");
  message(path+"/"+id,"Pesquisa registrada. O worker processará a fila.",true);
}
export async function requestEnrichment(id:string) {
  const {db,org}=await context();
  const back="/app/oportunidades/"+id+"?aba=presenca";
  if(!readerEnabled())message(back,"A leitura de páginas está desativada no servidor.");
  if(!uuid.safeParse(id).success)message(back,"Lead indisponível.");
  const {data,error}=await db.rpc("request_enrichment",{p_org:org.id,p_leads:[id]});
  saveError(back,error);
  message(back,data?"Leitura do site na fila. O worker grava evidências e contatos para revisão.":"Informe o domínio do lead ou aguarde a leitura em andamento.",Boolean(data));
}
export async function requestEnrichmentAll() {
  const {db,org}=await context();
  const back="/app/oportunidades";
  if(!readerEnabled())message(back,"A leitura de páginas está desativada no servidor.");
  let list=db.from("leads").select("id").eq("organization_id",org.id).neq("stage","blocked");
  if(!searchEnabled())list=list.not("domain","is",null);   // sem pesquisa, só quem tem domínio tem o que ler
  const {data:rows,error:listError}=await list.order("updated_at",{ascending:false}).limit(50);
  saveError(back,listError);
  const {data,error}=await db.rpc("request_enrichment",{p_org:org.id,p_leads:(rows??[]).map(r=>r.id)});
  saveError(back,error);
  message(back,data?data+" empresas entraram na fila de leitura do site.":"Nenhuma empresa nova para ler: sem domínio ou já na fila.",Boolean(data));
}
export async function cancelResearch(id:string) {
  const {db,org}=await context();
  if(!uuid.safeParse(id).success)message(path,"Pesquisa indisponível.");
  const {data,error}=await db.rpc("cancel_research",{p_org:org.id,p_job:id});
  saveError(path,error);
  message(path+"/"+id,data?"Cancelamento solicitado. Os resultados já gravados foram preservados.":"A pesquisa não está ativa.",Boolean(data));
}
function providerFailure(error:unknown):LookupState {
  if(error instanceof ProviderError) {
    if(error.code==="provider_limit")return {error:"Limite do provedor atingido. Aguarde antes de tentar novamente."};
    if(error.code==="credentials")return {error:"O provedor recusou a credencial. Revise a configuração no servidor."};
    if(error.code==="not_found")return {error:"O registro não está mais disponível na fonte."};
  }
  return {error:"A consulta externa falhou. Os registros salvos foram preservados."};
}
function reservationError(code:string):LookupState {
  return {error:code==="P2005"?"Limite de consultas da organização atingido. Tente novamente mais tarde.":"Este registro não está disponível para consulta."};
}
export async function lookupPlace(job:string,place:string):Promise<LookupState>{
  const {db,org}=await context();
  if(!googleEnabled()||!uuid.safeParse(job).success||!placeId.safeParse(place).success)return {error:"Resultado indisponível ou fonte desativada."};
  const reserve=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:"google_places",p_operation:"details",p_ref:job,p_place:place});
  if(reserve.error)return reservationError(reserve.error.code);
  try{
    const data=await placeDetails(place,process.env.GOOGLE_PLACES_API_KEY!);
    const title=data.displayName?.text??"Nome indisponível";
    const normalized=nameKey(title);
    const [excluded,suppressed]=await Promise.all([
      db.from("exclusions").select("id").eq("organization_id",org.id).eq("name_key",normalized).limit(1),
      db.from("suppression_entries").select("id").eq("organization_id",org.id).eq("name_key",normalized).limit(1)
    ]);
    if(excluded.error||suppressed.error)return {error:"A lista de exclusão está indisponível. Nenhum detalhe foi mostrado."};
    if(excluded.data?.length||suppressed.data?.length)return {notice:"Resultado oculto pela lista de exclusão ou de não contato."};
    if(data.businessStatus==="CLOSED_PERMANENTLY")return {notice:"Resultado omitido porque a fonte registra encerramento permanente."};
    const maps=data.googleMapsUri?publicUrl(data.googleMapsUri):null;
    const website=data.websiteUri?publicUrl(data.websiteUri):null;
    return {source:"Google Maps",notice:"Dados transitórios. Um link retornado pela fonte ainda precisa de confirmação independente.",items:[
      {title,description:data.formattedAddress,url:maps??undefined},
      ...(website?[{title:"Site indicado pela fonte",url:website}]:[]),
      ...data.attributions.flatMap(a=>a.provider?[{title:"Atribuição: "+a.provider,url:a.providerUri?publicUrl(a.providerUri)??undefined:undefined}]:[])
    ]};
  }catch(error){return providerFailure(error);}
}
export async function checkBrave(id:string):Promise<LookupState>{
  const {db,org}=await context();
  if(!braveEnabled())return {error:"Brave Search está desativado."};
  const lead=await loadLead(id);
  const reserve=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:"brave",p_operation:"search",p_ref:id});
  if(reserve.error)return reservationError(reserve.error.code);
  try{
    const items=await braveSearch(lead.name,lead.city,lead.region,process.env.BRAVE_SEARCH_API_KEY!);
    return {source:"Brave Search",items,notice:items.length?"Resultados transitórios. Verifique o vínculo com a empresa antes de registrar evidência independente.":"Nenhum resultado nesta consulta. A situação do site permanece inconclusiva."};
  }catch(error){return providerFailure(error);}
}
export async function checkOfficial(id:string,_state:LookupState,data:FormData):Promise<LookupState>{
  const {db,org}=await context();
  if(!readerEnabled())return {error:"A leitura de páginas está desativada."};
  await loadLead(id);
  const url=z.string().max(2048).safeParse(data.get("url"));
  if(!url.success||data.get("permission")!=="on")return {error:"Informe a URL e confirme que o acesso é permitido."};
  const reserve=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:"official_page",p_operation:"inspect",p_ref:id});
  if(reserve.error)return reservationError(reserve.error.code);
  try {
    const result=await inspectOfficial(url.data);
    return {source:"Leitura de página oficial",items:[{title:result.title??"Título indisponível",url:result.url,description:"Resposta HTTP "+result.status}],notice:"A resposta HTTP descreve esta consulta. Ela não confirma propriedade do domínio."};
  }catch{return {error:"A URL foi bloqueada ou não respondeu dentro dos limites. Nenhum conteúdo foi armazenado."};}
}
