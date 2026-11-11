import Link from "next/link";
import { EvidenceFix } from "./evidence-fix";
import { ButtonLink, Empty, Field, Notice, Pairs, Panel, SafeLink, Select, SiteTag, Tag } from "./ui";
import { Submit } from "./submit";
import { MoveForm } from "./move-form";
import { context } from "@/lib/auth";
import { leadPath, loadAssessment, loadContacts, loadEvidence, loadReading } from "@/lib/data";
import { Findings, SalesAngle, ScoreBreakdown, TalkNow } from "./lead-dossier";
import { LeadAssistant } from "./lead-assistant";
import { assessSite, createEvidence, createTask, editLead, reviewEvidence, saveScore } from "@/lib/lead-actions";
import { criteria, decodeEntities, evidenceExpired, evidenceUsable, formatDate, score, sites, taskKinds, today, type Evidence, type Lead, type WebsiteStatus } from "@/lib/domain";
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
export async function LeadSummary({lead,owners,owner}:{lead:Lead;owners:Record<string,string>;owner:boolean}) {
  const [{org},evidence,items,channels,reading]=await Promise.all([context(),loadEvidence(lead.id),loadAssessment(lead.id),loadContacts(lead.id),loadReading(lead.id)]);
  const verified=evidence.filter(confirmed);
  const index=score(items,new Set(verified.map(e=>e.id)));
  const age=(Date.parse(today())-Date.parse(lead.consulted_on))/86400000;
  const notes=evidence.filter(e=>!evidenceUsable(e));
  return <>{age>org.retention_days&&<Notice tone="warning">A consulta está fora do intervalo de revisão da organização. Revise a fonte antes de reutilizar os dados.</Notice>}
  <div className="summary-columns"><div className="summary-main">
    <SalesAngle evidence={evidence}/>
    <Findings lead={lead} evidence={evidence} reading={reading}/>
    <LeadAssistant lead={lead} evidence={evidence} modes={["summary"]}/>
    <Panel title="Próximo passo" description="Mude a etapa da negociação ou crie um lembrete para não esquecer." className="summary-next"><div className="pad stack"><MoveForm lead={lead} owner={owner} origin="lead"/>
      <details className="disclosure"><summary>Criar tarefa</summary><form action={createTask.bind(null,lead.id)} className="inner stack">
        <Field label="Título da tarefa"><input name="title" defaultValue={lead.next_action} required maxLength={180}/></Field>
        <Field label="Tipo"><Select name="kind" options={taskKinds}/></Field>
        <Field label="Prazo"><input type="date" name="due" defaultValue={today()} required/></Field>
        <Field label="Responsável"><Select name="assignee_id" options={owners} empty="Minha responsabilidade"/></Field>
        <Field label="Observação"><textarea name="note" maxLength={1500}/></Field><Submit>Criar tarefa</Submit>
      </form></details>
      <details className="disclosure"><summary>Pontuação revisada (só com o que você confirmou)</summary><div className="inner stack"><Pairs items={[
        ["Presença digital",<SiteTag status={lead.website_status} key="site"/>],
        ["Índice observado",index.maximum?index.observed+" / "+index.maximum:"Não avaliado"],["Cobertura",index.coverage+"%"],
        ["Confiança",verified.length?(notes.length?"Revisão pendente":"Evidências suficientes"):"Dados insuficientes"]
      ]}/>
      <ul className="list-disc pl-5">{Object.entries(criteria).map(([key,c])=>{const row=items.find(i=>i.criterion===key&&verified.some(e=>e.id===i.evidence_id));return <li key={key}><strong>{c.label}</strong> · {row?row.points+"/"+c.max+" · "+row.rationale:"Não avaliado"}</li>;})}</ul>
      {verified.length?<form action={saveScore.bind(null,lead.id)} className="stack">
      <Field label="Critério"><Select name="criterion" options={Object.fromEntries(Object.entries(criteria).map(([key,c])=>[key,c.label+" · até "+c.max]))}/></Field>
      <Field label="Pontuação observada"><input name="points" type="number" min={0} max={30} required/></Field>
      <Field label="Evidência confirmada"><Select name="evidence_id" options={evidenceOptions(verified)} required/></Field>
      <Field label="Justificativa"><textarea name="rationale" required maxLength={1000}/></Field><Submit>Salvar critério</Submit>
      </form>:<ButtonLink href={leadPath(lead.id,"fontes")}>Conferir fontes</ButtonLink>}</div></details>
    </div></Panel>
  </div><aside className="summary-side">
    <ScoreBreakdown reading={reading}/>
    <TalkNow lead={lead} channels={channels}/>
    <section className="panel side-card"><h2>Dados da empresa</h2><Pairs items={[
      ["Responsável",lead.assignee_id?(owners[lead.assignee_id]??"Membro").replace("Minha responsabilidade","Você"):"A definir"],
      ["Prioridade",lead.priority?{alta:"Alta",media:"Média",baixa:"Baixa"}[lead.priority]:"A definir"],
      ["Retorno",formatDate(lead.follow_up)],
      ["Origem",lead.source_url?<SafeLink key="source" url={lead.source_url}>{lead.source_label}</SafeLink>:lead.source_label]
    ]}/>
    <details className="disclosure"><summary>Editar dados</summary><form className="inner stack" action={editLead.bind(null,lead.id)}>
      <Field label="Segmento"><input name="sector" required maxLength={100} defaultValue={lead.sector}/></Field>
      <Field label="Bairro"><input name="district" maxLength={100} defaultValue={lead.district}/></Field>
      <Field label="Endereço comercial"><input name="address" maxLength={250} defaultValue={lead.address}/></Field>
      <Field label="Responsável"><Select name="assignee_id" options={owners} empty="A definir" defaultValue={lead.assignee_id??""}/></Field>
      <Field label="Prioridade comercial"><Select name="priority" options={{alta:"Alta",media:"Média",baixa:"Baixa"}} empty="A definir" defaultValue={lead.priority??""}/></Field>
      <Field label="Próxima ação"><input name="next_action" maxLength={240} defaultValue={lead.next_action}/></Field>
      <Field label="Data de retorno"><input type="date" name="follow_up" defaultValue={lead.follow_up??""}/></Field>
      <Field label="Valor informado (R$)"><input name="contract_value" inputMode="decimal" maxLength={13} defaultValue={lead.contract_value??""}/></Field>
      <Field label="Observações"><textarea name="notes" maxLength={2500} defaultValue={lead.notes}/></Field>
      <Submit>Salvar dados</Submit></form></details></section>
  </aside></div></>;
}
export async function EvidenceTab({lead,filter}:{lead:Lead;filter:string}) {
  const all=(await loadEvidence(lead.id)).filter(e=>e.kind!=="Cadastro");
  const isPending=(e:Evidence)=>e.review==="pending"&&!evidenceExpired(e);
  const rows=filter==="pendentes"?all.filter(isPending):filter==="confirmadas"?all.filter(confirmed):all;
  const chip=(key:string,label:string,n:number)=><Link className={"btn small"+((filter||"")===key?" primary":"")} href={leadPath(lead.id,"fontes")+(key?"&f="+key:"")} aria-current={(filter||"")===key?"page":undefined}>{label} {n}</Link>;
  const state=(e:Evidence)=>evidenceExpired(e)?<Tag tone="warning">Vencida</Tag>:confirmed(e)?<Tag tone="success">Confirmado</Tag>:e.review==="pending"?<Tag tone="warning">A conferir</Tag>:e.review==="conflict"?<Tag tone="error">Conflito</Tag>:<Tag>Descartado</Tag>;
  return <section className="panel sources">
    <div className="list-head"><div className="grow"><h2>De onde vem cada informação</h2><p className="meta">Confira, corrija ou descarte. Só o que estiver confirmado entra na nota revisada e na mensagem.</p></div>
      <div className="actions" role="group" aria-label="Filtrar fontes">{chip("","Todas",all.length)}{chip("pendentes","A conferir",all.filter(isPending).length)}{chip("confirmadas","Confirmadas",all.filter(confirmed).length)}</div></div>
    {rows.length?<div className="source-table" role="table" aria-label="Fontes"><div className="source-row head" role="row"><span role="columnheader">Informação</span><span role="columnheader">O que foi observado</span><span role="columnheader">Fonte</span><span role="columnheader">Data</span><span role="columnheader">Situação</span><span role="columnheader"><span className="sr-only">Ações</span></span></div>
    {rows.map(e=><div key={e.id} id={"evidence-"+e.id} className={"source-row"+(isPending(e)?" pending":"")} role="row">
      <strong role="cell">{e.kind}</strong><span role="cell" className="source-observed">{decodeEntities(e.observed)}</span>
      <span role="cell">{e.url?<SafeLink url={e.url}>{e.source_label} ↗</SafeLink>:<span className="meta">{e.source_label}</span>}</span>
      <span role="cell" className="meta">{formatDate(e.consulted_on)}</span><span role="cell">{state(e)}</span>
      <span role="cell" className="source-actions">{isPending(e)&&<form action={reviewEvidence.bind(null,lead.id,e.id)}><input type="hidden" name="observed" value={e.observed}/><button className="btn small" name="review" value="confirmed">Confere</button></form>}
        <EvidenceFix action={reviewEvidence.bind(null,lead.id,e.id)} kind={e.kind} source={e.source_label+" · "+formatDate(e.consulted_on)} observed={e.observed} review={e.review} note={e.review_note??""}/></span>
    </div>)}</div>:<Empty title={all.length?"Nada neste filtro":"Sem fontes ainda"} description={all.length?"Escolha outro filtro.":"Peça a leitura automática ou registre uma prova abaixo."}/>}
  </section>;
}
export async function PresenceTab({lead}:{lead:Lead}) {
  const [items,latest]=await Promise.all([loadEvidence(lead.id),latestSite(lead.id)]);
  const linked=latest?items.find(item=>item.id===latest.evidence_id):undefined;
  return <div className="sources-side">
  <section className="panel side-card"><h2>Situação do site</h2>
    <div className="inline"><SiteTag status={lead.website_status}/><span className="meta">{latest?"avaliado em "+formatDate(latest.created_at):"ainda não avaliado"}{linked?" · "+linked.source_label:""}</span></div>
    {linked&&evidenceExpired(linked)&&<Notice tone="warning">A prova desta classificação venceu em {formatDate(linked.expires_at)}. Reavalie.</Notice>}
    <p className="meta">Discorda? Troque a classificação e diga como conferiu. Não achar um site não prova que ele não existe.</p>
    <details className="disclosure"><summary>Alterar classificação</summary><form className="inner stack" action={assessSite.bind(null,lead.id)}>
      <Field label="Classificação"><Select name="status" options={sites} defaultValue={lead.website_status}/></Field>
      <Field label="Prova" hint="Para indicar site próprio, use uma prova confirmada e informe o domínio."><Select name="evidence_id" options={evidenceOptions(items.filter(item=>!evidenceExpired(item)))} empty={items.some(item=>!evidenceExpired(item))?"Selecione":"Nenhuma prova vigente"} required/></Field>
      <Field label="Site ou domínio"><input name="website" inputMode="url" maxLength={2048} defaultValue={latest?.domain??""}/></Field>
      <Field label="Como conferiu"><input name="method" required maxLength={180} placeholder="Ex.: link no Instagram oficial"/></Field>
      <Field label="Observação comercial"><textarea name="inference" maxLength={1400}/></Field>
      <Field label="O que falta conferir"><textarea name="pending" maxLength={1400}/></Field>
      <Submit style="small">Alterar</Submit></form></details>
    <ButtonLink href={"/app/verificar/"+lead.id} style="small">Verificar fontes externas</ButtonLink></section>
  <section className="panel side-card"><h2>Registrar uma prova</h2><p className="meta">Algo que você viu e o robô não pegou: uma ligação, um print, uma conversa.</p>
    <form action={createEvidence.bind(null,lead.id)} className="stack">
    <Field label="Tipo"><input name="kind" placeholder="Ex.: conversa com a recepção" required maxLength={80}/></Field>
    <Field label="O que você viu"><textarea name="observed" required maxLength={2000}/></Field>
    <Field label="Onde"><input name="source_label" required maxLength={200} placeholder="Ex.: ligação para a recepção"/></Field>
    <details className="disclosure"><summary>Mais detalhes</summary><div className="inner stack">
      <Field label="Link (opcional)"><input name="url" inputMode="url" maxLength={2048}/></Field>
      <Field label="Trecho permitido (opcional)"><textarea name="excerpt" maxLength={500}/></Field>
      <Field label="Vence em (opcional)"><input type="date" name="expires_at"/></Field>
      <label className="check"><input type="checkbox" name="export_allowed"/>Tenho autorização para exportar esta prova.</label></div></details>
    <input type="hidden" name="consulted_on" value={today()}/><input type="hidden" name="method" value="Registro manual"/><input type="hidden" name="confidence" value="pendente"/>
    <Submit style="small">Registrar</Submit></form></section></div>;
}
