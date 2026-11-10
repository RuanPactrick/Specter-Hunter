import { z } from "zod";
import { publicUrl } from "./domain";
export const policies={
  google_places:{name:"Google Places",purpose:"Descoberta de identificadores e visualização ao vivo.",retention:"Somente identificador de local. Detalhes são descartados após a consulta.",export:"Identificadores e detalhes não entram no CSV.",credential:"GOOGLE_PLACES_API_KEY",limit:"Paginação limitada por job e pela cota da organização.",attribution:"Google Maps"},
  brave:{name:"Brave Search",purpose:"Busca web pontual para apoiar revisão humana de um lead.",retention:"Resultados transitórios. Sem persistência de títulos, snippets ou links.",export:"Nenhum resultado do provedor é exportado.",credential:"BRAVE_SEARCH_API_KEY",limit:"Até 5 resultados por solicitação. Sem paginação na interface.",attribution:"Brave Search"},
  official_page:{name:"Leitura de páginas oficiais",purpose:"Checagem controlada de disponibilidade e título de URL fornecida.",retention:"Resposta transitória. Somente evidência manual independente pode ser registrada.",export:"Nenhum conteúdo da página é exportado automaticamente.",credential:"Sem chave",limit:"Até 3 redirecionamentos, 200 KiB e 10 segundos.",attribution:"URL final exibida"}
} as const;
export const googleEnabled=()=>process.env.ENABLE_GOOGLE_PLACES==="true"&&Boolean(process.env.GOOGLE_PLACES_API_KEY);
export const braveEnabled=()=>process.env.ENABLE_BRAVE_SEARCH==="true"&&Boolean(process.env.BRAVE_SEARCH_API_KEY);
export const readerEnabled=()=>process.env.ENABLE_OFFICIAL_PAGE_READING==="true";
export class ProviderError extends Error {
  constructor(readonly code:string,readonly retriable=false,readonly retryAfter=0){super(code);}
}
export function retryAfterSeconds(value:string|null,now=Date.now()) {
  if(!value)return 0;
  const delay=/^\d+$/.test(value.trim())?Number(value):Math.ceil((Date.parse(value)-now)/1000);
  return Number.isFinite(delay)?Math.max(0,delay):0;
}
export function retryDelay(attempt:number,retryAfter:number) {
  return Math.min(3600,Math.max(retryAfter,5*2**Math.min(7,Math.max(0,attempt-1))));
}
export async function jsonRequest<T>(url:string,init:RequestInit,schema:z.ZodType<T>,fetcher=fetch) {
  let response:Response;
  try {
    response=await fetcher(url,{...init,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
  } catch { throw new ProviderError("network",true); }
  if(!response.ok){
    const retry=retryAfterSeconds(response.headers.get("retry-after"));
    if(response.status===429)throw new ProviderError("provider_limit",true,retry);
    if(response.status===408||response.status>=500)throw new ProviderError("provider_unavailable",true,retry);
    if(response.status===401||response.status===403)throw new ProviderError("credentials");
    if(response.status===404)throw new ProviderError("not_found");
    throw new ProviderError("request_rejected");
  }
  try {
    const data=schema.safeParse(await response.json());
    if(!data.success)throw new Error("Invalid payload");
    return data.data;
  } catch { throw new ProviderError("invalid_response"); }
}
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const googlePage=z.object({places:z.array(z.object({id:identifier})).max(60).default([]),nextPageToken:z.string().max(2048).optional()});
export async function searchPlaces(query:string,pageSize:number,pageToken:string|null,key:string,fetcher=fetch) {
  return jsonRequest("https://places.googleapis.com/v1/places:searchText",{
    method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":key,"X-Goog-FieldMask":"places.id,nextPageToken"},
    body:JSON.stringify({textQuery:query,pageSize,regionCode:"BR",languageCode:"pt-BR",...(pageToken?{pageToken}:{})})
  },googlePage,fetcher);
}
const details=z.object({
  displayName:z.object({text:z.string().max(500)}).optional(),formattedAddress:z.string().max(800).optional(),
  googleMapsUri:z.string().max(2048).optional(),websiteUri:z.string().max(2048).optional(),businessStatus:z.string().max(100).optional(),
  attributions:z.array(z.object({provider:z.string().max(300).optional(),providerUri:z.string().max(2048).optional()})).max(30).default([])
});
export async function placeDetails(id:string,key:string) {
  if(!identifier.safeParse(id).success)throw new ProviderError("not_found");
  return jsonRequest("https://places.googleapis.com/v1/places/"+encodeURIComponent(id)+"?languageCode=pt-BR",{
    headers:{"X-Goog-Api-Key":key,"X-Goog-FieldMask":"displayName,formattedAddress,googleMapsUri,websiteUri,businessStatus,attributions"}
  },details);
}
const braveResponse=z.object({web:z.object({results:z.array(z.object({title:z.string().max(800),url:z.string().max(2048),description:z.string().max(2000).optional()})).max(20)}).optional()});
export type WebResult={title:string;url:string;description:string};
export async function braveWeb(query:string,count:number,key:string,fetcher=fetch):Promise<WebResult[]> {
  const params=new URLSearchParams({q:query.slice(0,360),count:String(count),country:"BR",search_lang:"pt-br",result_filter:"web"});
  const data=await jsonRequest("https://api.search.brave.com/res/v1/web/search?"+params.toString(),{headers:{"X-Subscription-Token":key,Accept:"application/json"}},braveResponse,fetcher);
  return (data.web?.results??[]).slice(0,count).flatMap(row=>{const url=publicUrl(row.url);return url?[{title:row.title,url,description:row.description??""}]:[];});
}
export async function braveSearch(name:string,city:string,region:string,key:string) {
  return (await braveWeb([name,city,region,"site oficial"].join(" "),5,key)).map(({title,url})=>({title,url}));
}
