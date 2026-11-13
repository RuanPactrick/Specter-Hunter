"use server";
import { z } from "zod";
import { context } from "./auth";
import { loadEvidence,loadLead } from "./data";
import { decodeEntities,evidenceExpired,evidenceUsable,formatDate } from "./domain";
import { salesAngle } from "./insights";
import { noAiLook } from "./site-prompt";
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
    const result=await generate(mode.data,{company:assistiveCompany(lead),observations,sender:minimizeEvidence(org.message_name),...(mode.data==="objection"?{reply}:{})},config);
    return {facts:[...new Set(result.fact_ids)].flatMap(f=>{const item=observations.find(item=>item.id===f);return item?[{id:f,text:item.observed,source:sources.get(f)!}]:[];}),
      suggestions:result.suggestions.map(item=>({text:item.text,refs:[...new Set(item.evidence_ids)].map(ref=>sources.get(ref)!)})),questions:result.questions,draft:result.draft};
  }catch(error){
    return {error:error instanceof Error&&error.message==="provider_429"?"O provedor atingiu o limite de uso. Tente mais tarde.":"O provedor não retornou um rascunho válido. Você pode tentar novamente ou usar os modelos locais."};
  }
}
type RefineResult={text?:string;tips?:string[];error?:string};
/** Ajuste da mensagem no passo 2 da Abordagem: o vendedor pede, a IA reescreve, e o vendedor pode pedir de novo. */
export async function refineMessage(id:string,input:{content:string;instruction:string;purpose:string}):Promise<RefineResult> { return refineWithAi(id,"refine",input); }
/** Mesmo ajuste em conversa, para o prompt do site na aba Prévia. */
export async function refinePrompt(id:string,input:{content:string;instruction:string;purpose:string}):Promise<RefineResult> { return refineWithAi(id,"refinePrompt",input); }
/** Abordagem → "O cliente respondeu?": lê a resposta da empresa e sugere a melhor resposta, com a última mensagem enviada como contexto. */
export async function answerClient(id:string,input:{content:string;instruction:string;purpose:string}):Promise<RefineResult> { return refineWithAi(id,"objection",input); }
async function refineWithAi(id:string,mode:"refine"|"refinePrompt"|"objection",input:{content:string;instruction:string;purpose:string}):Promise<RefineResult> {
  const config=aiConfig();
  if(!config)return {error:"IA desligada no servidor. Cadastre GEMINI_API_KEY e ENABLE_ASSISTIVE_AI=true."};
  const parsed=z.object({content:z.string().trim().max(12000),instruction:z.string().trim().min(2).max(1500),purpose:z.string().trim().max(80)}).safeParse(input);
  if(!parsed.success)return {error:"Escreva o texto e o que você quer ajustar."};
  const [{db,org},lead,records]=await Promise.all([context(),loadLead(id),loadEvidence(id)]);
  if(lead.stage==="blocked")return {error:"Empresa marcada como não contatar."};
  if(mode!=="objection"&&!parsed.data.content)return {error:"Escreva o texto e o que você quer ajustar."};
  const sent=mode==="objection"?(await db.from("outreach_events").select("content").eq("organization_id",org.id).eq("lead_id",id).eq("kind","sent").order("created_at",{ascending:false}).limit(1)).data?.[0]?.content:undefined;
  // fatos confirmados primeiro; achados do robô ainda não conferidos vão marcados, sem e-mails, telefones e links
  const found=records.filter(e=>!evidenceExpired(e)&&e.kind!=="Cadastro"&&e.kind!=="Contatos no site"&&e.kind!=="Conteúdo do site"&&e.review!=="inconclusive"&&e.review!=="conflict"&&(evidenceUsable(e)||e.provider!=="manual"))
    .filter((e,i,all)=>all.findIndex(x=>x.kind===e.kind)===i);
  const ordered=[...found.filter(evidenceUsable),...found.filter(e=>!evidenceUsable(e))].slice(0,8);
  const observations=ordered.map((e,i)=>({id:String(i+1),observed:(evidenceUsable(e)?"":"(não conferido) ")+e.kind+": "+minimizeEvidence(decodeEntities(e.observed))}));
  const {summary,hooks}=salesAngle(ordered);
  const angle=summary+(hooks.length?" Ganchos: "+hooks.map(h=>h.title+" ("+h.detail+")").join("; "):"");
  const reservation=await db.rpc("reserve_live_lookup",{p_org:org.id,p_provider:config.provider,p_operation:"assist",p_ref:id});
  if(reservation.error)return {error:reservation.error.code==="P2005"?"A cota de consultas da IA foi atingida. Tente mais tarde.":"Não foi possível reservar a consulta da IA."};
  try{
    const generate=config.provider==="gemini"?draftWithGemini:draftWithOpenAI;
    const result=await generate(mode,{company:assistiveCompany(lead),observations,angle:minimizeEvidence(angle),...(mode==="objection"
      ?{reply:minimizeEvidence(parsed.data.instruction),current:sent??undefined,sender:minimizeEvidence(org.message_name)}
      :{current:parsed.data.content,instruction:parsed.data.instruction,purpose:parsed.data.purpose,...(mode==="refine"?{sender:minimizeEvidence(org.message_name)}:{})})},config);
    return result.draft.trim()?{text:mode==="refinePrompt"?noAiLook(result.draft):result.draft.trim(),tips:result.suggestions.map(s=>s.text).slice(0,mode==="objection"?4:2)}:{error:"A IA não devolveu uma nova versão. Tente outro pedido."};
  }catch(error){
    return {error:error instanceof Error&&error.message==="provider_429"?"O limite gratuito da IA foi atingido. Tente em alguns minutos.":"A IA não conseguiu ajustar agora. Tente de novo."};
  }
}
