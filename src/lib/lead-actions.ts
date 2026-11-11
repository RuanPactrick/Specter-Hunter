"use server";
import { z } from "zod";
import { context } from "./auth";
import { leadPath, loadLead } from "./data";
import { checklist, contacts, contactValue, criteria, domain, offerKinds, previewStates, purposes, reviews, sites, stages, taskKinds } from "./domain";
import { leadSchema, message, on, optionalDate, optionalText, optionalUrl, parse, saveError, text } from "./forms";
const listPath="/app/oportunidades";
const newPath=listPath+"/novo";
const uuid=z.uuid();
const strictUrl=optionalUrl.refine(value=>value!==null);
type Input=Omit<z.output<typeof leadSchema>,"override">;

function leadPayload(fields:Input,path:string,source_kind:"manual"|"csv") {
  const values=[["phone",fields.phone],["email",fields.email],["instagram",fields.instagram],["website",fields.website],["maps",fields.maps]] as const;
  const normalized=values.flatMap(([kind,value])=>{
    if(!value) return [];
    const contact=contactValue(kind,value);
    if(!contact) message(path,"Confira o campo "+contacts[kind]+".");
    return [{...contact,kind}];
  });
  return { ...fields, domain:fields.website?domain(fields.website):null, contacts:normalized, source_kind };
}
export async function createLead(data:FormData) {
  const { db,org }=await context();
  const { override,...fields }=parse(leadSchema,data,newPath);
  const { data:id,error }=await db.rpc("create_lead",{p_org:org.id,p_data:leadPayload(fields,newPath,"manual"),p_override:override});
  saveError(newPath,error);
  if(typeof id!=="string") message(newPath,"O cadastro não retornou um identificador.");
  message(leadPath(id),"Empresa cadastrada e fonte registrada.",true);
}
export async function editLead(id:string,data:FormData) {
  const path=leadPath(id);
  await loadLead(id);
  const { db,org }=await context();
  const schema=z.object({
    sector:text(100),district:optionalText(100),address:optionalText(250),notes:optionalText(2500),next_action:optionalText(240),
    follow_up:optionalDate,priority:z.enum(["alta","media","baixa",""]).transform(v=>v||null),
    assignee_id:z.union([uuid,z.literal("")]).transform(v=>v||null),
    contract_value:z.string().trim().regex(/^(?:\d{1,10}(?:[.,]\d{1,2})?)?$/).transform(v=>v?Number(v.replace(",",".")):null)
  });
  const fields=parse(schema,data,path);
  const { error }=await db.from("leads").update(fields).eq("organization_id",org.id).eq("id",id);
  saveError(path,error);
  message(path,"Dados comerciais atualizados.",true);
}
export async function createEvidence(id:string,data:FormData) {
  const path=leadPath(id,"fontes");
  await loadLead(id);
  const { db,org }=await context();
  const fields=parse(z.object({kind:text(80),observed:text(2000),url:optionalUrl,source_label:text(200),consulted_on:z.iso.date(),method:text(180),
    excerpt:optionalText(500),confidence:z.enum(["suficiente","pendente","insuficiente"]),expires_at:optionalDate,export_allowed:on}),data,path);
  const { error }=await db.from("evidence_items").insert({...fields,organization_id:org.id,lead_id:id});
  saveError(path,error);
  message(path,"Evidência adicionada para revisão.",true);
}
export async function reviewEvidence(id:string,evidence:string,data:FormData) {
  // a revisão rápida do resumo volta para o resumo
  const path=data.get("back")==="resumo"?leadPath(id):leadPath(id,"fontes");
  if(!uuid.safeParse(evidence).success) message(path,"Evidência indisponível.");
  await loadLead(id);
  const { db,org }=await context();
  const fields=parse(z.object({review:z.enum(Object.keys(reviews) as [keyof typeof reviews]),observed:text(2000),review_note:optionalText(1000)}),data,path);
  if(fields.review==="conflict"&&!fields.review_note) message(path,"Descreva o conflito antes de registrar.");
  const { data:updated,error }=await db.from("evidence_items").update(fields).eq("organization_id",org.id).eq("lead_id",id).eq("id",evidence).select("id").maybeSingle();
  saveError(path,error);
  if(!updated) message(path,"A evidência não está disponível nesta carteira.");
  message(path,"Revisão registrada.",true);
}
export async function assessSite(id:string,data:FormData) {
  const path=leadPath(id,"fontes");
  await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({status:z.enum(Object.keys(sites) as [keyof typeof sites]),evidence_id:uuid,website:optionalUrl,
    method:text(180),inference:optionalText(1400),pending:optionalText(1400)}),data,path);
  const { error }=await db.rpc("assess_website",{p_org:org.id,p_lead:id,p_status:f.status,p_evidence:f.evidence_id,
    p_domain:f.website?domain(f.website):null,p_method:f.method,p_inference:f.inference,p_pending:f.pending});
  saveError(path,error);
  message(path,"Avaliação de presença digital registrada.",true);
}
export async function saveScore(id:string,data:FormData) {
  const path=leadPath(id);
  await loadLead(id);
  const { db,org }=await context();
  const fields=parse(z.object({criterion:z.enum(Object.keys(criteria) as [keyof typeof criteria]),points:z.string().regex(/^\d{1,2}$/).transform(Number),
    rationale:text(1000,3),evidence_id:uuid}),data,path);
  if(fields.points>criteria[fields.criterion].max) message(path,"O valor ultrapassa o máximo do critério.");
  const existing=await db.from("opportunity_assessments").select("criterion").eq("organization_id",org.id).eq("lead_id",id).eq("criterion",fields.criterion).maybeSingle();
  saveError(path,existing.error);
  const query=existing.data
    ? db.from("opportunity_assessments").update({points:fields.points,rationale:fields.rationale,evidence_id:fields.evidence_id,updated_at:new Date().toISOString()}).eq("organization_id",org.id).eq("lead_id",id).eq("criterion",fields.criterion)
    : db.from("opportunity_assessments").insert({...fields,organization_id:org.id,lead_id:id});
  const { error }=await query;
  saveError(path,error);
  message(path,"Critério salvo com justificativa e evidência.",true);
}
export async function addContact(id:string,data:FormData) {
  const path=leadPath(id,"contatos");
  await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({kind:z.enum(Object.keys(contacts) as [keyof typeof contacts]),value:text(2048),source_label:text(200),consulted_on:z.iso.date(),confirmed:on}),data,path);
  const contact=contactValue(f.kind,f.value);
  if(!contact) message(path,"Confira o formato do canal selecionado.");
  const { error }=await db.from("lead_contacts").insert({...f,...contact,organization_id:org.id,lead_id:id});
  saveError(path,error);
  message(path,"Canal comercial cadastrado.",true);
}
// back: aba para onde voltar ("abordagem" quando confirmado de lá); FormData vem por último quando não há back
export async function confirmContact(id:string,contactId:string,confirmed:boolean,back?:string|FormData) {
  const path=leadPath(id,back==="abordagem"?"abordagem":"contatos");
  await loadLead(id);
  const { db,org }=await context();
  const { data,error }=await db.from("lead_contacts").update({confirmed}).eq("organization_id",org.id).eq("lead_id",id).eq("id",contactId).select("id").maybeSingle();
  saveError(path,error);
  if(!data) message(path,"Canal indisponível.");
  message(path,confirmed?"Confirmação registrada.":"Canal marcado como pendente.",true);
}
export async function outreach(id:string,data:FormData) {
  const path=leadPath(id,"abordagem");
  await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({kind:z.enum(["draft","sent","reply","call"]),purpose:z.enum(Object.keys(purposes) as [keyof typeof purposes]),channel:z.enum(["WhatsApp","E-mail","Ligação","Outro"]),content:text(3000)}),data,path);
  if(f.kind==="sent" && data.get("confirmed")!=="on") message(path,"Confirme manualmente que a mensagem foi enviada.");
  const { error }=await db.rpc("record_outreach",{p_org:org.id,p_lead:id,p_kind:f.kind,p_purpose:f.purpose,p_channel:f.channel,p_content:f.content});
  saveError(path,error);
  message(path,f.kind==="draft"?"Rascunho salvo.":"Interação registrada manualmente.",true);
}
export async function moveLead(id:string,origin:"lead"|"pipeline",data:FormData) {
  const path=origin==="lead"?leadPath(id):"/app/pipeline";
  await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({stage:z.enum(Object.keys(stages) as [keyof typeof stages]),reason:optionalText(500),unblock:on}),data,path);
  const { error }=await db.rpc("move_lead",{p_org:org.id,p_lead:id,p_stage:f.stage,p_reason:f.reason,p_unblock:f.unblock});
  saveError(path,error);
  message(path,"Etapa atualizada.",true);
}
export async function createTask(id:string,data:FormData) {
  const path=leadPath(id);
  await loadLead(id);
  const { db,org,userId }=await context();
  const f=parse(z.object({title:text(180),kind:z.enum(Object.keys(taskKinds) as [keyof typeof taskKinds]),due:z.iso.date(),note:optionalText(1500),
    assignee_id:z.union([uuid,z.literal("")]).default("").transform(v=>v||null)}),data,path);
  const { error }=await db.from("tasks").insert({...f,assignee_id:f.assignee_id??userId,organization_id:org.id,lead_id:id});
  saveError(path,error);
  message(path,"Tarefa criada.",true);
}
export async function taskStatus(id:string,status:"open"|"done") {
  const path="/app/tarefas";
  const { db,org }=await context();
  const { data,error }=await db.from("tasks").update({status}).eq("organization_id",org.id).eq("id",id).select("id").maybeSingle();
  saveError(path,error);
  if(!data) message(path,"Tarefa indisponível.");
  message(path,status==="done"?"Tarefa concluída.":"Tarefa reaberta.",true);
}
export async function savePreview(id:string,data:FormData) {
  const path=leadPath(id,"previa");
  const lead=await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({url:strictUrl,repository:optionalUrl,status:z.enum(Object.keys(previewStates) as [keyof typeof previewStates]),
    sent_on:optionalDate,feedback:optionalText(1600),note:optionalText(1600)}),data,path);
  if(f.status==="sent"&&!f.sent_on) message(path,"Informe a data do envio registrado.");
  if(lead.stage==="blocked"&&f.sent_on) message(path,"Não é possível registrar envio para um lead bloqueado.");
  const checks=checklist.filter((_,i)=>data.get("check_"+i)==="on");
  const existing=await db.from("previews").select("id").eq("organization_id",org.id).eq("lead_id",id).maybeSingle();
  saveError(path,existing.error);
  const update={...f,checklist:checks};
  const { error }=existing.data
    ? await db.from("previews").update(update).eq("organization_id",org.id).eq("lead_id",id)
    : await db.from("previews").insert({...update,organization_id:org.id,lead_id:id});
  saveError(path,error);
  message(path,"Prévia registrada.",true);
}
export async function saveOffer(id:string,data:FormData) {
  const path=leadPath(id,"abordagem");
  await loadLead(id);
  const { db,org }=await context();
  const f=parse(z.object({kind:z.enum(offerKinds as [string,...string[]]),evidence_id:uuid,problem:text(1200),solution:text(1200),benefit:text(1000),
    scope:text(1200),questions:text(1200),objections:text(1200)}),data,path);
  const { error }=await db.from("offers").insert({...f,organization_id:org.id,lead_id:id});
  saveError(path,error);
  message(path,"Oferta salva com referência à evidência.",true);
}
export async function linkDuplicates(id:string,data:FormData) {
  const path=leadPath(id,"historico");
  await loadLead(id);
  const { db,org }=await context();
  const { related,reason }=parse(z.object({related:uuid,reason:text(500,3)}),data,path);
  const { error }=await db.rpc("merge_leads",{p_org:org.id,p_from:related,p_into:id,p_reason:reason});
  saveError(path,error);
  message(path,"Duplicidade vinculada. Os dois registros permanecem acessíveis.",true);
}
