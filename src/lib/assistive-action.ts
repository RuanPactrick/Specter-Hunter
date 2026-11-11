"use server";
import { z } from "zod";
import { context } from "./auth";
import { loadEvidence,loadLead } from "./data";
import { decodeEntities,evidenceUsable,formatDate } from "./domain";
import { aiConfig,assistiveCompany,assistiveModes,draftWithGemini,draftWithOpenAI,minimizeEvidence } from "./assistive";
export type AssistiveState={error?:string;facts?:{id:string;text:string;source:string}[];suggestions?:{text:string;refs:string[]}[];questions?:string[];draft?:string};
export async function generateAssistance(id:string,provider:"gemini"|"openai",_state:AssistiveState,data:FormData):Promise<AssistiveState> {
  const config=aiConfig();
  if(!config)return {error:"IA assistiva desabilitada. Os modelos locais continuam disponíveis."};
  if(config.provider!==provider)return {error:"A integração mudou. Recarregue a ficha e revise o envio."};
  const [{db,org},lead,records]=await Promise.all([context(),loadLead(id),loadEvidence(id)]);
  if(lead.stage==="blocked")return {error:"Assistência indisponível para este lead na lista de não contato."};
  const mode=z.enum(Object.keys(assistiveModes) as [keyof typeof assistiveModes]).safeParse(data.get("mode"));
  const selected=z.array(z.uuid()).min(1).max(8).safeParse(data.getAll("evidence_id"));
  if(!mode.success||!selected.success||data.get("permission")!=="on")return {error:"Selecione de uma a oito evidências e confirme a permissão de uso."};
  const verified=records.filter(e=>evidenceUsable(e)&&selected.data.includes(e.id));
  if(verified.length!==new Set(selected.data).size)return {error:"Uma evidência deixou de estar disponível ou confirmada."};
  const observations=verified.map((e,i)=>({id:String(i+1),observed:minimizeEvidence(decodeEntities(e.observed))}));
  const sources=new Map(observations.map((item,i)=>[item.id,verified[i].kind+" · "+verified[i].source_label+" · "+formatDate(verified[i].consulted_on)]));
  const reservation=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:config.provider,p_operation:"assist",p_ref:id});
  if(reservation.error)return {error:reservation.error.code==="P2005"?"A cota de consultas da organização foi atingida. Tente mais tarde.":"Não foi possível reservar a consulta. Verifique a configuração da integração."};
  try{
    const generate=config.provider==="gemini"?draftWithGemini:draftWithOpenAI;
    const result=await generate(mode.data,{company:assistiveCompany(lead),observations},config);
    return {facts:[...new Set(result.fact_ids)].flatMap(f=>{const item=observations.find(item=>item.id===f);return item?[{id:f,text:item.observed,source:sources.get(f)!}]:[];}),
      suggestions:result.suggestions.map(item=>({text:item.text,refs:[...new Set(item.evidence_ids)].map(ref=>sources.get(ref)!)})),questions:result.questions,draft:result.draft};
  }catch(error){
    return {error:error instanceof Error&&error.message==="provider_429"?"O provedor atingiu o limite de uso. Tente mais tarde.":"O provedor não retornou um rascunho válido. Você pode tentar novamente ou usar os modelos locais."};
  }
}
