import { ChevronLeft } from "lucide-react";
import { ButtonLink, Flash, param, type Search } from "@/components/ui";
import { context } from "@/lib/auth";
import { loadLead } from "@/lib/data";
import { LeadSummary, EvidenceTab, PresenceTab, ContactsTab, ApproachTab, PreviewTab, HistoryTab } from "@/components/lead-tabs";
import { MaterialsTab } from "@/components/materials";
import { LeadHeader, leadTabs, type LeadTab } from "@/components/lead-header";
// links antigos continuam funcionando
const renamed:Record<string,LeadTab>={evidencias:"fontes",presenca:"fontes",materiais:"previa"};
// as ações desta página processam a fila logo depois do clique (after)
export const maxDuration=300;
export const metadata={title:"Empresa"};
export default async function LeadPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Search>}) {
  const [{id},query,{role,userId,db,org}]=await Promise.all([params,searchParams,context()]);
  const lead=await loadLead(id);
  const asked=param(query,"aba")??"resumo";
  const tab=renamed[asked]??asked;
  const active=Object.hasOwn(leadTabs,tab)?tab as LeadTab:"resumo";
  const { data:members }=await db.from("organization_members").select("user_id,role").eq("organization_id",org.id).limit(100);
  const owners=Object.fromEntries((members??[]).map(row=>[String(row.user_id),row.user_id===userId?"Minha responsabilidade":String(row.role==="owner"?"Proprietário ":"Membro ")+String(row.user_id).slice(0,8)]));
  const filter=param(query,"f")??"";
  const selected={resumo:<LeadSummary lead={lead} owners={owners} owner={role==="owner"}/>,contatos:<ContactsTab lead={lead} filter={filter}/>,abordagem:<ApproachTab lead={lead}/>,
    previa:<PreviewTab lead={lead} materials={<MaterialsTab lead={lead}/>}/>,fontes:<div className="stack"><EvidenceTab lead={lead} filter={filter}/><PresenceTab lead={lead}/></div>,historico:<HistoryTab lead={lead} owner={role==="owner"} filter={filter}/>} as const;
  return <div className="lead-workspace"><div><ButtonLink href="/app/oportunidades" style="small ghost"><ChevronLeft size={16} aria-hidden="true"/>Oportunidades</ButtonLink></div>
  <LeadHeader lead={lead} active={active} owners={owners}/>
  <Flash params={query}/>{selected[active]}</div>;
}
