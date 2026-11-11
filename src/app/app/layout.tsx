import Link from "next/link";
import { LogOut, Plus, Search, User } from "lucide-react";
import { context } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";
import { Avatar, Brand, ButtonLink } from "@/components/ui";
import { Breadcrumb, DesktopNav, MobileNav } from "@/components/navigation";
export const dynamic = "force-dynamic";
export default async function Workspace({ children }:{children:React.ReactNode}) {
  const { org,email,role,db }=await context();
  // contadores do menu e fila do robô: consultas só de contagem, em paralelo
  const [leads,tasks,queue]=await Promise.all([
    db.from("leads").select("id",{count:"exact",head:true}).eq("organization_id",org.id),
    db.from("tasks").select("id",{count:"exact",head:true}).eq("organization_id",org.id).eq("status","open"),
    db.from("enrichment_requests").select("lead_id",{count:"exact",head:true}).eq("organization_id",org.id).in("state",["pending","running"])
  ]);
  return <div className="app-shell"><aside className="sidebar">
    <Link href="/app" aria-label="Specter Hunter, início"><Brand/></Link>
    <DesktopNav badges={{"/app/oportunidades":leads.count??0,"/app/tarefas":tasks.count??0}}/>
    <div className="robot-status"><span className={"dot"+(queue.count?" busy":"")}/><div><strong>{queue.count?"Robô trabalhando":"Robô ativo"}</strong><p className="meta">{queue.count?queue.count+(queue.count===1?" empresa":" empresas")+" na fila · confere a cada minuto":"Fila vazia · confere a cada minuto"}</p></div></div>
    <div className="profile"><Avatar name={org.message_name}/><div><strong>{org.message_name}</strong><p className="meta">{role==="owner"?"Proprietário":"Membro"}</p></div><form action={logout}><button className="btn icon small" type="submit" aria-label="Sair"><LogOut size={16} aria-hidden="true"/></button></form></div>
  </aside><div className="min-w-0">
    <header className="topbar"><Breadcrumb/><form action="/app/oportunidades" className="top-search" aria-label="Busca geral"><label className="search-field"><Search size={16} aria-hidden="true"/><input name="q" type="search" aria-label="Busca geral" placeholder="Busca geral" maxLength={100}/></label><button className="sr-only" type="submit">Buscar</button></form>
      <ButtonLink href="/app/oportunidades/novo" style="primary"><Plus size={16} aria-hidden="true"/>Cadastrar empresa</ButtonLink>
      <Link title={email} className="btn icon" href="/app/configuracoes" aria-label="Perfil e configurações"><User size={17} aria-hidden="true"/></Link></header>
    <header className="mobile-top"><Link href="/app"><Brand/></Link><Link className="btn icon" href="/app/configuracoes" aria-label="Perfil e configurações"><User size={17} aria-hidden="true"/></Link></header>
    <main id="conteudo" className="workspace"><div className="screen">{children}</div></main></div><MobileNav/></div>;
}
