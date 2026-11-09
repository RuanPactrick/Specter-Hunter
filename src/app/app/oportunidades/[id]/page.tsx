import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { Avatar, ButtonLink, Flash, Heading, Tag, param, type Search } from "@/components/ui";
import { context } from "@/lib/auth";
import { leadPath, loadLead } from "@/lib/data";
import { stages } from "@/lib/domain";
import { LeadSummary, EvidenceTab, PresenceTab, ContactsTab, ApproachTab, PreviewTab, HistoryTab } from "@/components/lead-tabs";
import { MaterialsTab } from "@/components/materials";
const tabs={resumo:"Visão geral",evidencias:"Evidências",presenca:"Presença digital",contatos:"Contatos",abordagem:"Abordagem",previa:"Prévia",historico:"Histórico",materiais:"Materiais"} as const;
export const metadata={title:"Detalhe do lead"};
export default async function LeadPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Search>}) {
  const [{id},query,{role,userId,db,org}]=await Promise.all([params,searchParams,context()]);
  const lead=await loadLead(id);
  const tab=param(query,"aba")??"resumo";
  const active=Object.hasOwn(tabs,tab)?tab as keyof typeof tabs:"resumo";
  const { data:members }=await db.from("organization_members").select("user_id,role").eq("organization_id",org.id).limit(100);
  const owners=Object.fromEntries((members??[]).map(row=>[String(row.user_id),row.user_id===userId?"Minha responsabilidade":String(row.role==="owner"?"Proprietário ":"Membro ")+String(row.user_id).slice(0,8)]));
  const selected={resumo:<LeadSummary lead={lead} owners={owners} owner={role==="owner"}/>,evidencias:<EvidenceTab lead={lead}/>,presenca:<PresenceTab lead={lead}/>,contatos:<ContactsTab lead={lead}/>,abordagem:<ApproachTab lead={lead}/>,previa:<PreviewTab lead={lead}/>,historico:<HistoryTab lead={lead} owner={role==="owner"}/>,materiais:<MaterialsTab lead={lead}/>} as const;
  return <><div><ButtonLink href="/app/oportunidades" style="small ghost"><ChevronLeft size={16} aria-hidden="true"/>Oportunidades</ButtonLink></div>
  <Heading group="Detalhe do lead" title={lead.name} description={lead.sector+" · "+lead.city+", "+lead.region}>
    <ButtonLink href={leadPath(id,"abordagem")} style="primary">{lead.stage==="blocked"?"Ver situação de contato":"Abordagem e contato"}</ButtonLink>
    <ButtonLink href={leadPath(id,"previa")}>Prévia</ButtonLink>
  </Heading><div className="inline"><Avatar name={lead.name}/><Tag tone={lead.stage==="blocked"?"error":"success"} dot>{stages[lead.stage]}</Tag><span className="inline muted"><UserRound size={15} aria-hidden="true"/>{lead.assignee_id?owners[lead.assignee_id]??"Membro da organização":"Responsável a definir"}</span></div>
  <Flash params={query}/><nav className="tabs" aria-label="Seções do lead">{Object.entries(tabs).map(([key,label])=><Link key={key} href={leadPath(id,key)} aria-current={active===key?"page":undefined}>{label}</Link>)}</nav>
  {selected[active]}</>;
}
