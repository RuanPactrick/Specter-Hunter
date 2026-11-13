import { lookup } from "node:dns/promises";
import { Agent, fetch } from "undici";
import ipaddr from "ipaddr.js";
import { decodeEntities, publicUrl } from "./domain";

// páginas maiores são lidas até o limite e cortadas, não recusadas (rodapé com contatos costuma vir no fim)
const limits={bytes:2*1024*1024,redirects:3,timeout:10_000};
const ip4Denied=["192.0.0.0/24","192.88.99.0/24","198.18.0.0/15","198.51.100.0/24","203.0.113.0/24"];
const ip6Denied=["2001::/23","2001:db8::/32","2002::/16","3fff::/20"];
export function isPublicAddress(value:string) {
  if(!ipaddr.isValid(value)||value.includes("%"))return false;
  const address=ipaddr.parse(value);
  if(address.kind()==="ipv4"){
    const v4=address as ipaddr.IPv4;
    return v4.range()==="unicast"&&!ip4Denied.some(block=>v4.match(ipaddr.IPv4.parseCIDR(block)));
  }
  const v6=address as ipaddr.IPv6;
  return v6.range()==="unicast"&&v6.match(ipaddr.IPv6.parseCIDR("2000::/3"))&&!ip6Denied.some(block=>v6.match(ipaddr.IPv6.parseCIDR(block)));
}
export function requestTarget(input:string) {
  const href=publicUrl(input);
  if(!href)return null;
  const url=new URL(href);
  const hostname=url.hostname.toLowerCase().replace(/\.$/,"");
  if(url.port||hostname==="localhost"||[".localhost",".local",".internal",".home.arpa",".test",".invalid",".example",".onion"].some(suffix=>hostname.endsWith(suffix)))return null;
  return url;
}
export function pinAddress(addresses:{address:string;family:number}[]) {
  if(!addresses.length||addresses.some(item=>![4,6].includes(item.family)||!isPublicAddress(item.address)))return null;
  return addresses[0];
}
function abortable<T>(operation:Promise<T>,signal:AbortSignal) {
  return new Promise<T>((resolve,reject)=>{
    const abort=()=>reject(new Error("timeout"));
    if(signal.aborted){abort();return;}
    signal.addEventListener("abort",abort,{once:true});
    void operation.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
  });
}
async function readBody(response:Awaited<ReturnType<typeof fetch>>) {
  const type=response.headers.get("content-type")?.toLowerCase()??"";
  if(!type.includes("text/html")&&!type.includes("application/xhtml+xml")){
    await response.body?.cancel();
    return null;
  }
  const reader=response.body?.getReader();
  if(!reader)return null;
  let read=0,html="";
  const decoder=new TextDecoder();
  try {
    while(true){
      const chunk=await reader.read();
      if(chunk.done)break;
      html+=decoder.decode(chunk.value.subarray(0,limits.bytes-read),{stream:true});
      read+=chunk.value.length;
      if(read>=limits.bytes)break;
    }
    html+=decoder.decode();
  }finally{await reader.cancel().catch(()=>undefined);}
  return html;
}
export function pageTitle(html:string|null) {
  const title=html?.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title\s*>/i)?.[1];
  return title?decodeEntities(title.replace(/<[^>]*>/g,"")).replace(/\s+/g," ").trim().slice(0,240)||null:null;
}
export async function inspectOfficial(input:string) {
  const page=await readPublicPage(input,"SpecterHunter/0.1 (manual website availability check)");
  return {url:page.url,status:page.status,title:pageTitle(page.html)};
}
/** Mesmas travas de SSRF, tamanho e redirect da verificação manual; devolve o HTML para quem extrai contatos. */
export async function readPublicPage(input:string,agent:string) {
  return readPublic(input,agent,"text/html,application/xhtml+xml",readBody);
}
const imageTypes:Record<string,string>={"image/png":"png","image/jpeg":"jpg","image/webp":"webp","image/svg+xml":"svg","image/gif":"gif","image/x-icon":"ico","image/vnd.microsoft.icon":"ico"};
/** Logo para a pasta do site: só imagem, até 3 MB, com as mesmas travas de endereço e redirect. */
export async function readPublicImage(input:string) {
  const page=await readPublic(input,"SpecterHunter/0.1 (logo download)","image/*",async response=>{
    const type=response.headers.get("content-type")?.split(";")[0].trim().toLowerCase()??"";
    const length=Number(response.headers.get("content-length")??0);
    if(response.status!==200||!imageTypes[type]||length>3*1024*1024){await response.body?.cancel();return null;}
    const bytes=new Uint8Array(await response.arrayBuffer());
    return bytes.length<=3*1024*1024?{ext:imageTypes[type],bytes}:null;
  });
  return page.html;
}
async function readPublic<T>(input:string,agent:string,accept:string,read:(response:Awaited<ReturnType<typeof fetch>>)=>Promise<T>) {
  const signal=AbortSignal.timeout(limits.timeout);
  let candidate=input;
  for(let redirects=0;redirects<=limits.redirects;redirects++){
    const url=requestTarget(candidate);
    if(!url)throw new Error("url");
    const ips=await abortable(lookup(url.hostname,{all:true,verbatim:true}),signal);
    const ip=pinAddress(ips);
    if(!ip)throw new Error("address");
    const dispatcher=new Agent({connect:{autoSelectFamily:false,lookup(_host,options,callback){
      if(options.all)callback(null,[{address:ip.address,family:ip.family}]);
      else callback(null,ip.address,ip.family);
    }}});
    try{
      const response=await fetch(url,{dispatcher,signal,redirect:"manual",headers:{Accept:accept,"User-Agent":agent}});
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get("location");
        await response.body?.cancel();
        if(!location||redirects===limits.redirects)throw new Error("redirect");
        candidate=new URL(location,url).href;
        continue;
      }
      return {url:url.href,status:response.status,html:await read(response)};
    }finally{await dispatcher.destroy();}
  }
  throw new Error("redirect");
}
