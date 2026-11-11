"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Rows3, Search, Columns3, ListChecks, PanelsTopLeft, Plug, Settings, Ellipsis, ChevronRight } from "lucide-react";
const items = [
  ["/app","Visão geral",LayoutDashboard],["/app/oportunidades","Oportunidades",Rows3],["/app/pesquisa","Nova pesquisa",Search],
  ["/app/pipeline","Pipeline",Columns3],["/app/tarefas","Tarefas",ListChecks],["/app/previas","Prévias",PanelsTopLeft],
  ["/app/integracoes","Integrações",Plug],["/app/configuracoes","Configurações",Settings]
] as const;
const current=(path:string,url:string)=>url==="/app"?path===url:path===url||path.startsWith(url+"/");
/** Menu lateral: "Nova pesquisa" vira botão de destaque (é uma ação); contadores ao lado de Oportunidades e Tarefas. */
export function DesktopNav({badges={}}:{badges?:Record<string,number>}) {
  const path=usePathname();
  const group=(list:ReadonlyArray<(typeof items)[number]>)=>list.filter(([url])=>url!=="/app/pesquisa").map(([url,label,Icon])=><Link href={url} className="nav-item" key={url} aria-current={current(path,url)?"page":undefined}><Icon size={17} aria-hidden="true"/>{label}{badges[url]?<span className={"nav-badge"+(url==="/app/tarefas"?" warn":"")}>{badges[url]}</span>:null}</Link>);
  return <nav className="side-nav" aria-label="Navegação principal"><Link href="/app/pesquisa" className="btn primary nav-cta" aria-current={current(path,"/app/pesquisa")?"page":undefined}><Search size={16} aria-hidden="true"/>Nova pesquisa</Link><p className="nav-label">Prospecção</p>{group(items.slice(0,6))}<hr/><p className="nav-label">Espaço de trabalho</p>{group(items.slice(6))}</nav>;
}
export function Breadcrumb() {
  const path=usePathname();
  const item=items.find(([url])=>current(path,url));
  return <div className="crumb"><span>Prospecção</span><ChevronRight size={14} aria-hidden="true"/>{item?.[1] ?? "Mais"}</div>;
}
export function MobileNav() {
  const path=usePathname();
  const mobile=[["/app","Início",LayoutDashboard],["/app/oportunidades","Oportunidades",Rows3],["/app/tarefas","Tarefas",ListChecks],["/app/mais","Mais",Ellipsis]] as const;
  const isMore=!mobile.slice(0,3).some(([url])=>current(path,url));
  return <nav className="mobile-nav" aria-label="Navegação mobile">{mobile.map(([url,label,Icon])=><Link key={url} href={url} aria-current={(url==="/app/mais"?isMore:current(path,url))?"page":undefined}><Icon size={19} aria-hidden="true"/>{label}</Link>)}</nav>;
}
