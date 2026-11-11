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
  const reply=minimizeEvidence(String(data.get("reply")??"").trim()).slice(0,400);
  if(mode.data==="objection"&&!reply)return {error:"Escreva o que a empresa respondeu para gerar a resposta à objeção."};
  const verified=records.filter(e=>evidenceUsable(e)&&selected.data.includes(e.id));
  if(verified.length!==new Set(selected.data).size)return {error:"Uma evidência deixou de estar disponível ou confirmada."};
  const observations=verified.map((e,i)=>({id:String(i+1),observed:minimizeEvidence(decodeEntities(e.observed))}));
  const sources=new Map(observations.map((item,i)=>[item.id,verified[i].kind+" · "+verified[i].source_label+" · "+formatDate(verified[i].consulted_on)]));
  const reservation=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:config.provider,p_operation:"assist",p_ref:id});
  if(reservation.error)return {error:reservation.error.code==="P2005"?"A cota de consultas da organização foi atingida. Tente mais tarde.":"Não foi possível reservar a consulta. Verifique a configuração da integração."};
  try{
    const generate=config.provider==="gemini"?draftWithGemini:draftWithOpenAI;
    const result=await generate(mode.data,{company:assistiveCompany(lead),observations,...(mode.data==="objection"?{reply}:{})},config);
    return {facts:[...new Set(result.fact_ids)].flatMap(f=>{const item=observations.find(item=>item.id===f);return item?[{id:f,text:item.observed,source:sources.get(f)!}]:[];}),
      suggestions:result.suggestions.map(item=>({text:item.text,refs:[...new Set(item.evidence_ids)].map(ref=>sources.get(ref)!)})),questions:result.questions,draft:result.draft};
  }catch(error){
    return {error:error instanceof Error&&error.message==="provider_429"?"O provedor atingiu o limite de uso. Tente mais tarde.":"O provedor não retornou um rascunho válido. Você pode tentar novamente ou usar os modelos locais."};
  }
}
/** Ajuste da mensagem no passo 2 da Abordagem: o vendedor pede, a IA reescreve, e o vendedor pode pedir de novo. */
export async function refineMessage(id:string,input:{content:string;instruction:string;purpose:string}):Promise<{text?:string;tips?:string[];error?:string}> {
  const config=aiConfig();
  if(!config)return {error:"IA desligada no servidor. Cadastre GEMINI_API_KEY e ENABLE_ASSISTIVE_AI=true."};
  const parsed=z.object({content:z.string().trim().min(1).max(3000),instruction:z.string().trim().min(2).max(400),purpose:z.string().trim().max(80)}).safeParse(input);
  if(!parsed.success)return {error:"Escreva a mensagem e o que você quer ajustar."};
  const [{db,org},lead,records]=await Promise.all([context(),loadLead(id),loadEvidence(id)]);
  if(lead.stage==="blocked")return {error:"Empresa marcada como não contatar."};
  // só fatos confirmados e vigentes, sem e-mails, telefones e links
  const observations=records.filter(evidenceUsable).slice(0,8).map((e,i)=>({id:String(i+1),observed:minimizeEvidence(decodeEntities(e.observed))}));
  const reservation=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:config.provider,p_operation:"assist",p_ref:id});
  if(reservation.error)return {error:reservation.error.code==="P2005"?"A cota de consultas da IA foi atingida. Tente mais tarde.":"Não foi possível reservar a consulta da IA."};
  try{
    const generate=config.provider==="gemini"?draftWithGemini:draftWithOpenAI;
    const result=await generate("refine",{company:assistiveCompany(lead),observations,current:parsed.data.content,instruction:parsed.data.instruction,purpose:parsed.data.purpose},config);
    return result.draft.trim()?{text:result.draft.trim(),tips:result.suggestions.map(s=>s.text).slice(0,2)}:{error:"A IA não devolveu uma nova versão. Tente outro pedido."};
  }catch(error){
    return {error:error instanceof Error&&error.message==="provider_429"?"O limite gratuito da IA foi atingido. Tente em alguns minutos.":"A IA não conseguiu ajustar agora. Tente de novo."};
  }
}
