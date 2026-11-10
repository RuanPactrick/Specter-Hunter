import Link from "next/link";
import { ButtonLink, Empty, Field, Notice, Pairs, Panel, SafeLink, Select, SiteTag, Tag } from "./ui";
import { Submit } from "./submit";
import { MoveForm } from "./move-form";
import { context } from "@/lib/auth";
import { leadPath, loadAssessment, loadEvidence } from "@/lib/data";
import { assessSite, createEvidence, createTask, editLead, reviewEvidence, saveScore } from "@/lib/lead-actions";
import { requestEnrichment } from "@/lib/research-actions";
import { braveEnabled } from "@/lib/providers";
import type { Suggestion } from "@/lib/enrichment";
import { criteria, formatDate, reviews, score, sites, taskKinds, today, type Evidence, type Lead, type WebsiteStatus } from "@/lib/domain";
export const confirmed = (e:Evidence)=>e.review==="confirmed"||e.review==="corrected";
export function evidenceOptions(items:Evidence[]) {
  return Object.fromEntries(items.map(e=>[e.id,e.kind+" · "+e.source_label+" · "+formatDate(e.consulted_on)]));
}
type SiteAssessment={status:WebsiteStatus;domain:string|null;evidence_id:string;method:string;inference:string;pending:string;created_at:string};
async function latestSite(id:string) {
  const {db,org}=await context();
  const {data,error}=await db.from("website_assessments").select("status,domain,evidence_id,method,inference,pending,created_at").eq("organization_id",org.id).eq("lead_id",id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error("Falha ao ler a avaliação");
  return data as SiteAssessment|null;
}
type EnrichmentRow={state:"pending"|"running"|"done"|"failed";error_code:string|null;suggestion:Suggestion|null;finished_at:string|null};
const enrichmentStates={pending:"Na fila",running:"Lendo o site",done:"Concluída",failed:"Falhou"} as const;
async function latestEnrichment(id:string) {
  const {db,org}=await context();
  const {data,error}=await db.from("enrichment_requests").select("state,error_code,suggestion,finished_at").eq("organization_id",org.id).eq("lead_id",id).maybeSingle();
  if(error) throw new Error("Falha ao ler a leitura do site");
  return data as EnrichmentRow|null;
}
function SiteReading({lead,row}:{lead:Lead;row:EnrichmentRow|null}) {
  const busy=row?.state==="pending"||row?.state==="running";
  return <Panel title="Leitura automática do site"><div className="pad stack">
    {row?<Pairs items={[["Situação",<Tag key="s" tone={row.state==="failed"?"error":row.state==="done"?"success":""}>{enrichmentStates[row.state]}</Tag>],
      ["Concluída em",formatDate(row.finished_at)],
      ...(row.suggestion?[["Nota sugerida",row.suggestion.points+" de "+row.suggestion.maximum] as [string,string],["Oportunidade sugerida",row.suggestion.opportunity??"—"] as [string,string]]:[]),
      ...(row.error_code?[["Erro",row.error_code] as [string,string]]:[])]}/>:<p className="muted">O site ainda não foi lido.</p>}
    {row?.suggestion&&<p className="meta">{row.suggestion.rationale}</p>}
    <p className="muted">O worker lê o domínio informado{braveEnabled()?", pesquisa na web o site, o Instagram e o CNPJ que faltarem,":""} e grava evidências e contatos como pendentes. A nota é uma sugestão e não entra no índice comercial até você revisar.</p>
    {lead.domain||braveEnabled()?<form action={requestEnrichment.bind(null,lead.id)}><Submit style="small">{busy?"Leitura em andamento":row?"Ler o site de novo":"Ler o site"}</Submit></form>:<Notice tone="warning">Informe o domínio do lead para ler o site.</Notice>}
  </div></Panel>;
}
export async function LeadSummary({lead,owners,owner}:{lead:Lead;owners:Record<string,string>;owner:boolean}) {
  const [{org},evidence,items,latest]=await Promise.all([context(),loadEvidence(lead.id),loadAssessment(lead.id),latestSite(lead.id)]);
  const verified=evidence.filter(confirmed);
  const index=score(items,new Set(verified.map(e=>e.id)));
  const observation=latest?evidence.find(e=>e.id===latest.evidence_id):undefined;
  const age=(Date.parse(today())-Date.parse(lead.consulted_on))/86400000;
  const notes=evidence.filter(e=>e.review==="pending"||e.review==="conflict"||e.review==="inconclusive");
  return <>{age>org.retention_days&&<Notice tone="warning">A consulta está fora do intervalo de revisão da organização. Revise a fonte antes de reutilizar os dados.</Notice>}
  <div className="grid-two"><div className="stack">
    <Panel title="Por que revisar esta oportunidade"><div className="pad stack">
    <div><h3>Fatos observados</h3>{verified.length?<ul className="list-disc pl-5 mt-2">{verified.slice(0,5).map(e=><li key={e.id}>{e.observed} <Link href={leadPath(lead.id,"evidencias")} className="meta">{e.source_label}</Link></li>)}</ul>:<p className="muted">As informações cadastradas aguardam revisão.</p>}</div>
    <div><h3>Inferências comerciais</h3><p>{observation&&latest?.inference?latest.inference:"Nenhuma inferência registrada com evidência disponível."}</p></div>
    <div><h3>Pendências</h3><p>{latest?.pending|| (notes.length ? notes.length+" evidência(s) precisam de revisão." : "Sem pendência registrada.")}</p></div>
    </div></Panel>
    <Panel title="Dados comerciais"><form className="pad stack" action={editLead.bind(null,lead.id)}><div className="fields">
      <Field label="Segmento"><input name="sector" required maxLength={100} defaultValue={lead.sector}/></Field>
      <Field label="Bairro"><input name="district" maxLength={100} defaultValue={lead.district}/></Field>
      <Field label="Endereço comercial" full><input name="address" maxLength={250} defaultValue={lead.address}/></Field>
      <Field label="Responsável"><Select name="assignee_id" options={owners} empty="A definir" defaultValue={lead.assignee_id??""}/></Field>
      <Field label="Prioridade comercial"><Select name="priority" options={{alta:"Alta",media:"Média",baixa:"Baixa"}} empty="A definir" defaultValue={lead.priority??""}/></Field>
      <Field label="Próxima ação"><input name="next_action" maxLength={240} defaultValue={lead.next_action}/></Field>
      <Field label="Data de retorno"><input type="date" name="follow_up" defaultValue={lead.follow_up??""}/></Field>
      <Field label="Valor informado (R$)"><input name="contract_value" inputMode="decimal" maxLength={13} defaultValue={lead.contract_value??""}/></Field>
      <Field label="Observações" full><textarea name="notes" maxLength={2500} defaultValue={lead.notes}/></Field>
    </div><Submit>Salvar dados comerciais</Submit></form></Panel>
  </div><div className="stack">
    <Panel title="Resumo da avaliação"><div className="pad stack"><Pairs items={[
      ["Presença digital",<SiteTag status={lead.website_status} key="site"/>],
      ["Índice observado",index.maximum?index.observed+" / "+index.maximum:"Não avaliado"],["Cobertura",index.coverage+"%"],
      ["Confiança",verified.length?(notes.length?"Revisão pendente":"Evidências suficientes"):"Dados insuficientes"],
      ["Última consulta",formatDate(lead.consulted_on)],["Fonte do cadastro",lead.source_url?<SafeLink key="source" url={lead.source_url}>{lead.source_label}</SafeLink>:lead.source_label]
    ]}/><p className="meta">{index.provisional?"Avaliação provisória. Critérios sem evidência ficam fora da pontuação observada.":"Cobertura completa dos critérios comerciais."}</p>
    <details className="disclosure"><summary>Critérios e justificativas</summary><div className="inner stack">
      <ul className="list-disc pl-5">{Object.entries(criteria).map(([key,c])=>{const row=items.find(i=>i.criterion===key&&verified.some(e=>e.id===i.evidence_id));return <li key={key}><strong>{c.label}</strong> · {row?row.points+"/"+c.max+" · "+row.rationale:"Não avaliado"}</li>;})}</ul>
      {verified.length?<form action={saveScore.bind(null,lead.id)} className="stack">
      <Field label="Critério"><Select name="criterion" options={Object.fromEntries(Object.entries(criteria).map(([key,c])=>[key,c.label+" · até "+c.max]))}/></Field>
      <Field label="Pontuação observada"><input name="points" type="number" min={0} max={30} required/></Field>
      <Field label="Evidência confirmada"><Select name="evidence_id" options={evidenceOptions(verified)} required/></Field>
      <Field label="Justificativa"><textarea name="rationale" required maxLength={1000}/></Field><Submit>Salvar critério</Submit>
      </form>:<ButtonLink href={leadPath(lead.id,"evidencias")}>Revisar evidências</ButtonLink>}
    </div></details></div></Panel>
    <Panel title="Ações do lead"><div className="pad stack"><MoveForm lead={lead} owner={owner} origin="lead"/>
      <details className="disclosure"><summary>Criar tarefa</summary><form action={createTask.bind(null,lead.id)} className="inner stack">
        <Field label="Título da tarefa"><input name="title" defaultValue={lead.next_action} required maxLength={180}/></Field>
        <Field label="Tipo"><Select name="kind" options={taskKinds}/></Field>
        <Field label="Prazo"><input type="date" name="due" defaultValue={today()} required/></Field>
        <Field label="Responsável"><Select name="assignee_id" options={owners} empty="Minha responsabilidade"/></Field>
        <Field label="Observação"><textarea name="note" maxLength={1500}/></Field><Submit>Criar tarefa</Submit>
      </form></details>
    </div></Panel>
  </div></div></>;
}
export async function EvidenceTab({lead}:{lead:Lead}) {
  const items=await loadEvidence(lead.id);
  return <div className="grid-two"><Panel title="Evidências digitais" description="Confira o valor observado, a fonte e o método antes de alterar a revisão.">
  {items.length?items.map(item=><div key={item.id} className="row !block"><details className="disclosure"><summary><span className="inline spread"><span>{item.kind} · {item.source_label}</span><Tag tone={confirmed(item)?"success":item.review==="conflict"?"error":"warning"}>{reviews[item.review]}</Tag></span></summary>
  <div className="inner stack"><p>{item.observed}</p><Pairs items={[
    ["Data da consulta",formatDate(item.consulted_on)],["Método",item.method],["Origem",item.provider==="csv"?"CSV de dados próprios":"Manual"],
    ["URL",item.url?<SafeLink key="url" url={item.url}/>:"Sem URL"],["Confiança",item.confidence],["Expiração",formatDate(item.expires_at)],
    ["Exportação",item.export_allowed?"Autorização registrada":"Restrita"]
  ]}/>{item.excerpt&&<blockquote className="notice">{item.excerpt}</blockquote>}
  <form action={reviewEvidence.bind(null,lead.id,item.id)} className="stack">
    <Field label="Valor observado"><textarea name="observed" defaultValue={item.observed} required maxLength={2000}/></Field>
    <Field label="Status de revisão"><Select name="review" options={reviews} defaultValue={item.review}/></Field>
    <Field label="Nota de revisão ou conflito"><input name="review_note" defaultValue={item.review_note??""} maxLength={1000}/></Field>
    <Submit>Salvar revisão</Submit>
  </form></div></details></div>):<Empty title="Sem evidências disponíveis" description="Adicione uma fonte com data e método de verificação."/>}</Panel>
  <Panel title="Adicionar evidência"><form action={createEvidence.bind(null,lead.id)} className="pad stack">
    <Field label="Tipo"><input name="kind" placeholder="Ex.: vínculo do domínio" required maxLength={80}/></Field>
    <Field label="Informação observada"><textarea name="observed" required maxLength={2000}/></Field>
    <Field label="Fonte"><input name="source_label" required maxLength={200}/></Field>
    <Field label="URL da evidência"><input name="url" inputMode="url" maxLength={2048}/></Field>
    <Field label="Data da consulta"><input type="date" name="consulted_on" defaultValue={today()} required/></Field>
    <Field label="Método"><input name="method" required maxLength={180}/></Field>
    <Field label="Trecho permitido (opcional)"><textarea name="excerpt" maxLength={500}/></Field>
    <Field label="Confiança"><Select name="confidence" options={{pendente:"Revisão pendente",suficiente:"Suficiente",insuficiente:"Insuficiente"}}/></Field>
    <Field label="Expiração (opcional)"><input type="date" name="expires_at"/></Field>
    <label className="check"><input type="checkbox" name="export_allowed"/>Tenho autorização para exportar a observação e sua fonte.</label>
    <Submit>Adicionar evidência</Submit>
  </form></Panel></div>;
}
export async function PresenceTab({lead}:{lead:Lead}) {
  const [items,latest,reading]=await Promise.all([loadEvidence(lead.id),latestSite(lead.id),latestEnrichment(lead.id)]);
  const linked=latest?items.find(item=>item.id===latest.evidence_id):undefined;
  return <div className="grid-two"><div className="stack"><Panel title="Situação do site"><div className="pad stack"><Pairs items={[
  ["Classificação",<SiteTag status={lead.website_status} key="status"/>],["Domínio informado",lead.domain?<code key="domain">{lead.domain}</code>:"A confirmar"],
  ["Data da avaliação",formatDate(latest?.created_at??null)],["Performance","Não avaliado"]
  ]}/><Notice tone="warning">Não localizar um site nas consultas realizadas não comprova sua inexistência. Confirme o vínculo com fonte oficial ou comercial.</Notice></div></Panel>
  <Panel title="Como chegamos a esta conclusão"><div className="pad stack">{linked?<><strong>{linked.observed}</strong><span className="meta">{linked.source_label} · {formatDate(linked.consulted_on)}</span><p>Método: {latest?.method}</p></>:<p className="muted">{latest?"A evidência original expirou ou está indisponível. Reavalie a conclusão.":"Nenhuma avaliação com evidência registrada."}</p>}</div></Panel>
  <Panel title="O que ainda falta verificar"><p className="pad">{latest?.pending||"Confirme o domínio oficial e descarte homônimos antes de classificar."}</p></Panel>
  <SiteReading lead={lead} row={reading}/>
  <Panel title="Verificações externas"><div className="pad stack"><p>Abra a busca de fontes quando habilitada. A revisão da evidência continua manual.</p><ButtonLink href={"/app/verificar/"+lead.id}>Verificar fontes</ButtonLink></div></Panel>
  </div><Panel title="Registrar avaliação"><form className="pad stack" action={assessSite.bind(null,lead.id)}>
  <Field label="Classificação"><Select name="status" options={sites} defaultValue={lead.website_status}/></Field>
  <Field label="Evidência" hint="Para indicar site próprio, confirme a evidência e informe o domínio."><Select name="evidence_id" options={evidenceOptions(items)} empty="Selecione" required/></Field>
  <Field label="Site ou domínio"><input name="website" inputMode="url" maxLength={2048} defaultValue={latest?.domain??""}/></Field>
  <Field label="Como o vínculo foi verificado"><input name="method" required maxLength={180} placeholder="Ex.: link no canal oficial"/></Field>
  <Field label="Inferência comercial"><textarea name="inference" maxLength={1400}/></Field>
  <Field label="Pendências"><textarea name="pending" maxLength={1400}/></Field>
  <Submit>Registrar avaliação</Submit></form></Panel></div>;
}
