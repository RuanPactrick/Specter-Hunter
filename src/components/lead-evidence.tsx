import { ButtonLink, Empty, Field, Notice, Pairs, Panel, SafeLink, Select, SiteTag, Tag } from "./ui";
import { Submit } from "./submit";
import { MoveForm } from "./move-form";
import { context } from "@/lib/auth";
import { leadPath, loadAssessment, loadContacts, loadEvidence } from "@/lib/data";
import { Dossier, type Reading } from "./lead-dossier";
import { LeadAssistant } from "./lead-assistant";
import { assessSite, createEvidence, createTask, editLead, reviewEvidence, saveScore } from "@/lib/lead-actions";
import { criteria, evidenceExpired, evidenceUsable, formatDate, reviews, score, sites, taskKinds, today, type Evidence, type Lead, type WebsiteStatus } from "@/lib/domain";
export const confirmed = evidenceUsable;
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
type EnrichmentRow=Reading;
async function latestEnrichment(id:string) {
  const {db,org}=await context();
  const {data,error}=await db.from("enrichment_requests").select("state,step,error_code,suggestion,finished_at").eq("organization_id",org.id).eq("lead_id",id).maybeSingle();
  if(error) throw new Error("Falha ao ler a leitura do site");
  return data as EnrichmentRow|null;
}
export async function LeadSummary({lead,owners,owner}:{lead:Lead;owners:Record<string,string>;owner:boolean}) {
  const [{org},evidence,items,channels,reading]=await Promise.all([context(),loadEvidence(lead.id),loadAssessment(lead.id),loadContacts(lead.id),latestEnrichment(lead.id)]);
  const verified=evidence.filter(confirmed);
  const index=score(items,new Set(verified.map(e=>e.id)));
  const age=(Date.parse(today())-Date.parse(lead.consulted_on))/86400000;
  const notes=evidence.filter(e=>!evidenceUsable(e));
  return <>{age>org.retention_days&&<Notice tone="warning">A consulta está fora do intervalo de revisão da organização. Revise a fonte antes de reutilizar os dados.</Notice>}
  <Dossier lead={lead} evidence={evidence} channels={channels} reading={reading}/>
  <LeadAssistant lead={lead} evidence={evidence} modes={["summary"]}/>
  <div className="summary-layout"><div className="summary-action-grid">
    <Panel title="Próximo passo" description="Atualize a etapa ou crie um lembrete." className="summary-next"><div className="pad stack"><MoveForm lead={lead} owner={owner} origin="lead"/>
      <details className="disclosure"><summary>Criar tarefa</summary><form action={createTask.bind(null,lead.id)} className="inner stack">
        <Field label="Título da tarefa"><input name="title" defaultValue={lead.next_action} required maxLength={180}/></Field>
        <Field label="Tipo"><Select name="kind" options={taskKinds}/></Field>
        <Field label="Prazo"><input type="date" name="due" defaultValue={today()} required/></Field>
        <Field label="Responsável"><Select name="assignee_id" options={owners} empty="Minha responsabilidade"/></Field>
        <Field label="Observação"><textarea name="note" maxLength={1500}/></Field><Submit>Criar tarefa</Submit>
      </form></details>
    </div></Panel>
    <Panel title="Pontuação revisada" description="Considera somente as evidências que você confirmou." className="summary-score"><div className="pad stack"><Pairs items={[
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
  </div>
    <Panel title="Dados comerciais" description="Informações usadas para organizar o acompanhamento desta empresa." className="summary-data"><form className="pad stack" action={editLead.bind(null,lead.id)}><div className="fields">
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
  </div></>;
}
export async function EvidenceTab({lead}:{lead:Lead}) {
  const items=await loadEvidence(lead.id);
  return <section className="workflow-section"><header className="workflow-heading"><span>01</span><div><h2>Conferir informações</h2><p>Abra cada registro para revisar o conteúdo e sua origem.</p></div></header>
  <div className="evidence-layout"><Panel title="Fontes registradas" description="Achados mais recentes primeiro." className="evidence-list">
  {items.length?items.map(item=><div key={item.id} className="row !block"><details id={"evidence-"+item.id} className="disclosure"><summary><span className="inline spread"><span>{item.kind} · {item.source_label}</span><Tag tone={evidenceExpired(item)?"warning":confirmed(item)?"success":item.review==="conflict"?"error":"warning"}>{evidenceExpired(item)?"Expirada · ":""}{reviews[item.review]}</Tag></span></summary>
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
  <details className="disclosure panel evidence-add"><summary>Adicionar evidência manualmente</summary><form action={createEvidence.bind(null,lead.id)} className="inner stack">
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
  </form></details></div></section>;
}
export async function PresenceTab({lead}:{lead:Lead}) {
  const [items,latest]=await Promise.all([loadEvidence(lead.id),latestSite(lead.id)]);
  const linked=latest?items.find(item=>item.id===latest.evidence_id):undefined;
  return <section className="workflow-section"><header className="workflow-heading"><span>02</span><div><h2>Avaliar presença digital</h2><p>Use uma evidência vigente para registrar a classificação e explicar o vínculo.</p></div></header>
  <div className="presence-layout"><div className="presence-summary"><Panel title="Situação do site"><div className="pad stack"><Pairs items={[
  ["Classificação",<SiteTag status={lead.website_status} key="status"/>],["Domínio informado",lead.domain?<code key="domain">{lead.domain}</code>:"A confirmar"],
  ["Data da avaliação",formatDate(latest?.created_at??null)],["Performance","Não avaliado"]
  ]}/><Notice tone="warning">Não localizar um site nas consultas realizadas não comprova sua inexistência. Confirme o vínculo com fonte oficial ou comercial.</Notice></div></Panel>
  <Panel title="Como chegamos a esta conclusão"><div className="pad stack">{linked?<><strong>{linked.observed}</strong><span className="meta">{linked.source_label} · consultado em {formatDate(linked.consulted_on)}</span><p>Método: {latest?.method}</p>{evidenceExpired(linked)&&<Notice tone="warning">Esta evidência venceu em {formatDate(linked.expires_at)}. Reavalie a conclusão antes de usá-la.</Notice>}</>:<p className="muted">{latest?"A evidência original venceu ou está indisponível. Reavalie a conclusão.":"Nenhuma avaliação com evidência registrada."}</p>}</div></Panel>
  <Panel title="O que ainda falta verificar"><p className="pad">{latest?.pending||"Confirme o domínio oficial e descarte homônimos antes de classificar."}</p></Panel>
  <Panel title="Verificações externas"><div className="pad stack"><p>Abra a busca de fontes quando habilitada. A revisão da evidência continua manual.</p><ButtonLink href={"/app/verificar/"+lead.id}>Verificar fontes</ButtonLink></div></Panel>
  </div><Panel title="Registrar avaliação" description="Vincule a classificação a uma evidência confirmada." className="presence-form"><form className="pad stack" action={assessSite.bind(null,lead.id)}>
  <div className="fields">
  <Field label="Classificação"><Select name="status" options={sites} defaultValue={lead.website_status}/></Field>
  <Field label="Evidência" hint="A evidência deve estar vigente. Para indicar site próprio, confirme-a e informe o domínio." full><Select name="evidence_id" options={evidenceOptions(items.filter(item=>!evidenceExpired(item)))} empty={items.some(item=>!evidenceExpired(item))?"Selecione":"Nenhuma evidência vigente"} required/></Field>
  <Field label="Site ou domínio"><input name="website" inputMode="url" maxLength={2048} defaultValue={latest?.domain??""}/></Field>
  <Field label="Como o vínculo foi verificado"><input name="method" required maxLength={180} placeholder="Ex.: link no canal oficial"/></Field>
  <Field label="Inferência comercial" full><textarea name="inference" maxLength={1400}/></Field>
  <Field label="Pendências" full><textarea name="pending" maxLength={1400}/></Field>
  </div>
  <Submit>Registrar avaliação</Submit></form></Panel></div></section>;
}
