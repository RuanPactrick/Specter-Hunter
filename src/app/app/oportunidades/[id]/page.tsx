import Link from "next/link";
import { ChevronLeft, UserRound } from "lucide-react";
import { Avatar, ButtonLink, Flash, Heading, Tag, param, type Search } from "@/components/ui";
import { context } from "@/lib/auth";
import { leadPath, loadLead } from "@/lib/data";
import { stages } from "@/lib/domain";
import { LeadSummary, EvidenceTab, PresenceTab, ContactsTab, ApproachTab, PreviewTab, HistoryTab } from "@/components/lead-tabs";
import { MaterialsTab } from "@/components/materials";
const tabs={resumo:"Resumo",contatos:"Contatos",abordagem:"Abordagem",previa:"Prévia do site",fontes:"Fontes e conferência",historico:"Histórico"} as const;
// links antigos continuam funcionando
const renamed:Record<string,keyof typeof tabs>={evidencias:"fontes",presenca:"fontes",materiais:"previa"};
const intro:Record<keyof typeof tabs,string>={
  resumo:"Confira os achados e defina o próximo passo comercial.",
  contatos:"Revise os canais encontrados e confirme que pertencem à empresa antes de usar.",
  abordagem:"Prepare uma mensagem com base em fatos confirmados e registre o resultado do contato.",
  previa:"Prepare o pedido, monte uma demonstração e acompanhe o link enviado à empresa.",
  fontes:"Revise origem, data e confiança dos dados antes de usá-los na abordagem ou na prévia.",
  historico:"Acompanhe as mudanças e decisões registradas para esta empresa."};
export const metadata={title:"Empresa"};
export default async function LeadPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Search>}) {
  const [{id},query,{role,userId,db,org}]=await Promise.all([params,searchParams,context()]);
  const lead=await loadLead(id);
  const asked=param(query,"aba")??"resumo";
  const tab=renamed[asked]??asked;
  const active=Object.hasOwn(tabs,tab)?tab as keyof typeof tabs:"resumo";
  const { data:members }=await db.from("organization_members").select("user_id,role").eq("organization_id",org.id).limit(100);
  const owners=Object.fromEntries((members??[]).map(row=>[String(row.user_id),row.user_id===userId?"Minha responsabilidade":String(row.role==="owner"?"Proprietário ":"Membro ")+String(row.user_id).slice(0,8)]));
  const selected={resumo:<LeadSummary lead={lead} owners={owners} owner={role==="owner"}/>,contatos:<ContactsTab lead={lead}/>,abordagem:<ApproachTab lead={lead}/>,
    previa:<div className="stack"><PreviewTab lead={lead}/><MaterialsTab lead={lead}/></div>,fontes:<div className="stack"><EvidenceTab lead={lead}/><PresenceTab lead={lead}/></div>,historico:<HistoryTab lead={lead} owner={role==="owner"}/>} as const;
  return <div className="lead-workspace"><div><ButtonLink href="/app/oportunidades" style="small ghost"><ChevronLeft size={16} aria-hidden="true"/>Oportunidades</ButtonLink></div>
  <Heading group="Empresa" title={lead.name} description={lead.sector+" · "+lead.city+", "+lead.region}>
    <ButtonLink href={leadPath(id,"abordagem")} style="primary">{lead.stage==="blocked"?"Ver situação de contato":"Abordagem e contato"}</ButtonLink>
    <ButtonLink href={leadPath(id,"previa")}>Prévia</ButtonLink>
  </Heading><div className="lead-status"><Avatar name={lead.name}/><Tag tone={lead.stage==="blocked"?"error":"success"} dot>{stages[lead.stage]}</Tag><span className="inline muted"><UserRound size={15} aria-hidden="true"/>{lead.assignee_id?owners[lead.assignee_id]??"Membro da organização":"Responsável a definir"}</span></div>
  <Flash params={query}/><nav className="tabs" aria-label="Seções do lead">{Object.entries(tabs).map(([key,label])=><Link key={key} href={leadPath(id,key)} aria-current={active===key?"page":undefined}>{label}</Link>)}</nav>
  <p className="tab-intro">{intro[active]}</p>{selected[active]}</div>;
}
