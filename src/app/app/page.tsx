import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ButtonLink, Empty, Heading, Panel, SiteTag, Tag } from "@/components/ui";
import { context } from "@/lib/auth";
import { leadPath, queryLeads } from "@/lib/data";
import { formatDate, researchStates, today, type ResearchJob, type Task } from "@/lib/domain";
import { googleEnabled } from "@/lib/providers";
export const metadata={title:"Visão geral"};
const evidenceText=(evidence:{observed:string})=>{
  const text=evidence.observed.replace(/\s+/g," ").trim();
  return text.length>160?text.slice(0,157).trimEnd()+"…":text;
};
export default async function Dashboard() {
  const { db,org }=await context();
  const date=today();
  const count=(table:string)=>db.from(table).select("id",{count:"exact",head:true}).eq("organization_id",org.id);
  const [leadCount,review,qualified,outreach,sent,proposals,won,tasks,jobs,leads]=await Promise.all([
    count("leads"),count("leads").eq("stage","review"),count("leads").eq("stage","qualified"),count("outreach_events").in("kind",["sent","reply","call"]),
    count("previews").not("sent_on","is",null),count("leads").in("stage",["proposal","negotiation"]),count("leads").eq("stage","won"),
    db.from("tasks").select("id,title,due,lead_id,leads(name)").eq("organization_id",org.id).eq("status","open").order("due").limit(6),
    db.from("research_jobs").select("id,segment,city,state,result_count,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(4),
    queryLeads({pending:"1"},4,0)
  ]);
  if([leadCount,review,qualified,outreach,sent,proposals,won,tasks,jobs].some(result=>result.error)) throw new Error("Falha na leitura da visão geral");
  const evidenceResults=await Promise.all(leads.leads.map(lead=>db.from("evidence_items").select("kind,observed,source_label,consulted_on").eq("organization_id",org.id).eq("lead_id",lead.id).in("review",["pending","conflict","inconclusive"]).or("expires_at.is.null,expires_at.gt."+new Date().toISOString()).order("consulted_on",{ascending:false}).order("created_at",{ascending:false}).limit(1).maybeSingle()));
  if(evidenceResults.some(result=>result.error)) throw new Error("Falha ao carregar evidências da visão geral");
  const evidenceByLead=new Map(leads.leads.map((lead,index)=>[lead.id,evidenceResults[index].data]));
  const hasLeads=(leadCount.count??0)>0;
  const researchAvailable=googleEnabled();
  const cards=[["Empresas em análise",review.count],["Empresas qualificadas",qualified.count],["Interações registradas",outreach.count],["Prévias enviadas",sent.count],["Empresas em proposta ou negociação",proposals.count],["Empresas conquistadas",won.count]] as const;
  return <><Heading group="Espaço de trabalho" title="Visão geral" description={hasLeads?"Etapas mostram a situação atual das empresas; interações e prévias são totais acumulados neste espaço.":"Encontre empresas, registre evidências e organize a próxima abordagem."}>
    {hasLeads?<><ButtonLink href="/app/oportunidades/novo"><Plus size={16} aria-hidden="true"/>Cadastrar empresa</ButtonLink><ButtonLink href="/app/pesquisa" style="primary"><Search size={16} aria-hidden="true"/>Nova pesquisa</ButtonLink></>:<ButtonLink href={researchAvailable?"/app/pesquisa":"/app/oportunidades/novo"} style="primary">{researchAvailable?<><Search size={16} aria-hidden="true"/>Nova pesquisa</>:<><Plus size={16} aria-hidden="true"/>Cadastrar empresa</>}</ButtonLink>}</Heading>
  {hasLeads?<div className="panel metrics">{cards.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div>:<Panel title="Da busca à abordagem" description="A oportunidade começa por um sinal verificável.">
    <div className="pad stack"><ol className="steps">
      <li><strong>Encontre empresas.</strong> {researchAvailable?"Pesquise por segmento e região.":"Cadastre uma empresa e informe a fonte consultada."}</li>
      <li><strong>Registre evidências.</strong> Anote sinais observáveis da presença digital antes de qualificar.</li>
      <li><strong>Defina a próxima ação.</strong> Organize uma tarefa ou prepare a abordagem a partir do que verificou.</li>
    </ol><p className="muted">{researchAvailable?<>Prefere começar manualmente? <Link href="/app/oportunidades/novo">Cadastre uma empresa</Link>.</>:<>A pesquisa externa está desativada. <Link href="/app/integracoes">Configure a integração</Link>.</>}</p></div>
  </Panel>}
  <div className="grid-two"><Panel title="Próximas ações" action={<Link href="/app/tarefas">Todas as tarefas</Link>}>{tasks.data?.length ? (tasks.data as unknown as Task[]).map(t=><div key={t.id} className="row"><div><strong>{t.title}</strong><p className="meta">{t.leads?.name} · {formatDate(t.due)}</p></div><div className="inline">{t.due<date&&<Tag tone="warning">Atrasada</Tag>}<ButtonLink href={leadPath(t.lead_id)} style="small ghost">Abrir</ButtonLink></div></div>):<Empty title="Sem tarefas pendentes" description="Crie uma tarefa no detalhe de uma empresa para organizar a próxima ação."/>}</Panel>
  <Panel title="Pesquisas recentes">{jobs.data?.length ? (jobs.data as Pick<ResearchJob,"id"|"segment"|"city"|"state"|"result_count"|"created_at">[]).map(j=><div className="row" key={j.id}><div><strong>{j.segment}</strong><p className="meta">{j.city} · {formatDate(j.created_at)} · {j.result_count} identificadores</p></div><Link href={"/app/pesquisa/"+j.id}>{researchStates[j.state]}</Link></div>):<Empty title="Nenhuma pesquisa registrada" description="Configure uma fonte ou comece pelo cadastro manual."/>}</Panel></div>
  <Panel title="Oportunidades para revisar" action={<Link href="/app/oportunidades?pending=1">Ver todas</Link>}>{leads.leads.length?leads.leads.map(lead=>{const evidence=evidenceByLead.get(lead.id);return <div className="row review-row" key={lead.id}><div><strong>{lead.name}</strong><p className="meta">{lead.next_action||"Próxima ação a definir"}</p>{evidence?<><p className="meta"><strong>{evidence.kind}:</strong> {evidenceText(evidence)}</p><p className="meta">Fonte: {evidence.source_label} · {formatDate(evidence.consulted_on)}</p></>:<p className="meta">Sem evidência em aberto; confira a presença digital.</p>}</div><div className="inline"><SiteTag status={lead.website_status}/><ButtonLink href={leadPath(lead.id,evidence?"evidencias":"presenca")} style="small ghost">{evidence?"Ver evidência":"Ver presença"}</ButtonLink></div></div>}):<Empty title="Nenhuma oportunidade pendente" description="Cadastre uma empresa para começar a revisar sua presença digital.">{hasLeads&&<ButtonLink href="/app/oportunidades/novo" style="primary">Cadastrar empresa</ButtonLink>}</Empty>}</Panel></>;
}
