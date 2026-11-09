import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { ButtonLink, Empty, Heading, Panel, SiteTag, Tag } from "@/components/ui";
import { context } from "@/lib/auth";
import { leadPath, queryLeads } from "@/lib/data";
import { formatDate, researchStates, today, type ResearchJob, type Task } from "@/lib/domain";
export const metadata={title:"Visão geral"};
export default async function Dashboard() {
  const { db,org }=await context();
  const date=today();
  const count=(table:string)=>db.from(table).select("id",{count:"exact",head:true}).eq("organization_id",org.id);
  const [review,qualified,outreach,sent,proposals,won,tasks,jobs,leads]=await Promise.all([
    count("leads").eq("stage","review"),count("leads").eq("stage","qualified"),count("outreach_events").in("kind",["sent","reply","call"]),
    count("previews").not("sent_on","is",null),count("leads").in("stage",["proposal","negotiation"]),count("leads").eq("stage","won"),
    db.from("tasks").select("id,title,due,lead_id,leads(name)").eq("organization_id",org.id).eq("status","open").order("due").limit(6),
    db.from("research_jobs").select("id,segment,city,state,result_count,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(4),
    queryLeads({pending:"1"},4,0)
  ]);
  if([review,qualified,outreach,sent,proposals,won,tasks,jobs].some(result=>result.error)) throw new Error("Falha na leitura da visão geral");
  const cards=[["Leads em análise",review.count],["Qualificados",qualified.count],["Contatos registrados",outreach.count],["Prévias enviadas",sent.count],["Propostas em andamento",proposals.count],["Ganhos",won.count]] as const;
  return <><Heading group="Espaço de trabalho" title="Visão geral" description="Veja o que precisa da sua atenção hoje.">
    <ButtonLink href="/app/oportunidades/novo"><Plus size={16} aria-hidden="true"/>Cadastrar empresa</ButtonLink><ButtonLink href="/app/pesquisa" style="primary"><Search size={16} aria-hidden="true"/>Nova pesquisa</ButtonLink></Heading>
  <div className="panel metrics">{cards.map(([label,value])=><div className="metric" key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>)}</div>
  <div className="grid-two"><Panel title="Próximas ações" action={<Link href="/app/tarefas">Todas as tarefas</Link>}>{tasks.data?.length ? (tasks.data as unknown as Task[]).map(t=><div key={t.id} className="row"><div><strong>{t.title}</strong><p className="meta">{t.leads?.name} · {formatDate(t.due)}</p></div><div className="inline">{t.due<date&&<Tag tone="warning">Atrasada</Tag>}<ButtonLink href={leadPath(t.lead_id)} style="small ghost">Abrir</ButtonLink></div></div>):<Empty title="Sem tarefas pendentes" description="Crie uma tarefa no detalhe de uma empresa para organizar a próxima ação."/>}</Panel>
  <Panel title="Pesquisas recentes">{jobs.data?.length ? (jobs.data as Pick<ResearchJob,"id"|"segment"|"city"|"state"|"result_count"|"created_at">[]).map(j=><div className="row" key={j.id}><div><strong>{j.segment}</strong><p className="meta">{j.city} · {formatDate(j.created_at)} · {j.result_count} identificadores</p></div><Link href={"/app/pesquisa/"+j.id}>{researchStates[j.state]}</Link></div>):<Empty title="Nenhuma pesquisa registrada" description="Configure uma fonte ou comece pelo cadastro manual."/>}</Panel></div>
  <Panel title="Oportunidades para revisar" action={<Link href="/app/oportunidades?pending=1">Ver todas</Link>}>{leads.leads.length?leads.leads.map(lead=><div className="row" key={lead.id}><div><strong>{lead.name}</strong><p className="meta">{lead.next_action||"Próxima ação a definir"}</p></div><div className="inline"><SiteTag status={lead.website_status}/><ButtonLink href={leadPath(lead.id)} style="small ghost">Ver detalhes</ButtonLink></div></div>):<Empty title="Nenhuma oportunidade pendente" description="Cadastre uma empresa para começar a revisar sua presença digital."><ButtonLink href="/app/oportunidades/novo" style="primary">Cadastrar empresa</ButtonLink></Empty>}</Panel></>;
}
