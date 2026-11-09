import Image from "next/image";
import Link from "next/link";
import { CircleAlert, CircleCheck, Inbox, Info } from "lucide-react";
import type { ReactNode } from "react";
import { sites, type WebsiteStatus } from "@/lib/domain";
export type Search = Record<string,string|string[]|undefined>;
export const param = (params:Search, key:string) => typeof params[key] === "string" ? params[key] : undefined;
export function Brand() {
  return <span className="brand"><Image src="/assinatura-fundo-escuro.svg" width={165} height={37} loading="eager" unoptimized alt="Specter Hunter"/></span>;
}
export function Heading({ group,title,description,children }:{group:string;title:string;description?:string;children?:ReactNode}) {
  return <header className="page-head"><div><p className="kicker">{group}</p><h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{children && <div className="actions">{children}</div>}</header>;
}
export function Panel({ title, description, action, children, className="" }:{title:string;description?:string;action?:ReactNode;children:ReactNode;className?:string}) {
  return <section className={"panel "+className}><header className="panel-head"><div><h2>{title}</h2>{description && <p className="muted">{description}</p>}</div>{action}</header>{children}</section>;
}
export function Field({ label, hint, children, full=false }:{label:string;hint?:string;children:ReactNode;full?:boolean}) {
  return <label className={"field "+(full ? "full" : "")}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Select({ options,empty,...props }:{options:Record<string,string>|readonly string[];empty?:string}&React.SelectHTMLAttributes<HTMLSelectElement>) {
  const entries = Array.isArray(options) ? options.map(v => [v,v]) : Object.entries(options);
  return <select {...props}>{empty !== undefined && <option value="">{empty}</option>}{entries.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select>;
}
export function Notice({ children,tone="info" }:{children:ReactNode;tone?:"info"|"success"|"warning"|"error"}) {
  const Icon=tone==="success"?CircleCheck:tone==="info"?Info:CircleAlert;
  return <div className={"notice "+tone} role={tone==="error"?"alert":"status"}><Icon size={16} aria-hidden="true"/><div>{children}</div></div>;
}
export function Flash({ params }:{params:Search}) {
  const error=param(params,"msg")?.slice(0,240);
  const success=param(params,"ok")?.slice(0,240);
  if (error) return <Notice tone="error">{error === "sessao" ? "Entre para acessar seu espaço de trabalho. Se a sessão expirou, seus dados foram preservados." : error === "link" ? "O link é inválido ou expirou. Solicite outro e tente novamente." : error}</Notice>;
  return success ? <Notice tone="success">{success}</Notice> : null;
}
export function Tag({ children,tone="",dot=false }:{children:ReactNode;tone?:string;dot?:boolean}) {
  return <span className={"tag "+tone+(dot?" dot":"")}>{children}</span>;
}
export function SiteTag({ status }:{status:WebsiteStatus}) {
  const tone=status==="owned"?"success":status==="conflict"||status==="not_found"||status==="unreachable"?"warning":status==="insufficient"?"":"info";
  return <Tag tone={tone} dot>{sites[status]}</Tag>;
}
export function Empty({ title, description, children }:{title:string;description:string;children?:ReactNode}) {
  return <div className="empty"><Inbox size={22} aria-hidden="true"/><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Avatar({ name, large=false }:{name:string;large?:boolean}) {
  return <span aria-hidden="true" className={"avatar "+(large?"large":"")}>{name.trim().split(/\s+/).slice(0,2).map(word=>word[0]?.toLocaleUpperCase("pt-BR")).join("")}</span>;
}
export function Pairs({ items }:{items:[string,ReactNode][]}) {
  return <dl className="pairs">{items.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
export function ButtonLink({ href,children,style="" }:{href:string;children:ReactNode;style?:string}) {
  return <Link href={href} className={"btn "+style}>{children}</Link>;
}
export function SafeLink({ url, children }:{url:string;children?:ReactNode}) {
  if (!/^https?:\/\//i.test(url)) return <code>{url}</code>;
  return <a href={url} target="_blank" rel="noopener noreferrer">{children ?? <code>{url}</code>}</a>;
}
