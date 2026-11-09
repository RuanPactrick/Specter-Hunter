"use server";
import { z } from "zod";
import { context } from "./auth";
import { loadEvidence,loadLead } from "./data";
import { aiConfig,assistiveModes,draftWithOpenAI,minimizeEvidence } from "./assistive";
export type AssistiveState={error?:string;facts?:string[];suggestions?:{text:string;refs:string[]}[];questions?:string[];draft?:string};
export async function generateAssistance(id:string,_state:AssistiveState,data:FormData):Promise<AssistiveState> {
  const config=aiConfig();
  if(!config)return {error:"IA assistiva desabilitada. Os modelos locais continuam disponíveis."};
  const [{db,org},lead,records]=await Promise.all([context(),loadLead(id),loadEvidence(id)]);
  if(lead.stage==="blocked")return {error:"Assistência indisponível para este lead na lista de não contato."};
  const mode=z.enum(Object.keys(assistiveModes) as [keyof typeof assistiveModes]).safeParse(data.get("mode"));
  const selected=z.array(z.uuid()).min(1).max(8).safeParse(data.getAll("evidence_id"));
  if(!mode.success||!selected.success||data.get("permission")!=="on")return {error:"Selecione de uma a oito evidências e confirme a permissão de uso."};
  const verified=records.filter(e=>(e.review==="confirmed"||e.review==="corrected")&&selected.data.includes(e.id));
  if(verified.length!==new Set(selected.data).size)return {error:"Uma evidência deixou de estar disponível ou confirmada."};
  const observations=verified.map(e=>({id:e.id,observed:minimizeEvidence(e.observed)}));
  const reservation=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:"openai",p_operation:"assist",p_ref:id});
  if(reservation.error)return {error:"Não foi possível reservar a consulta. Verifique permissões e cota."};
  try{
    const result=await draftWithOpenAI(mode.data,observations,config);
    return {facts:[...new Set(result.fact_ids)].flatMap(f=>{const value=observations.find(item=>item.id===f);return value?[value.observed]:[];}),
      suggestions:result.suggestions.map(item=>({text:item.text,refs:item.evidence_ids})),questions:result.questions,draft:result.draft};
  }catch{return {error:"O provedor recusou a consulta ou retornou um resultado inválido. Nenhum texto foi gravado."};}
}
