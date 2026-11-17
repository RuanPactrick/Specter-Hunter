"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Avatar, SiteTag, Tag } from "./ui";
import { formatDate, readingErrors } from "@/lib/domain";
import type { DirectoryLead } from "@/lib/data";
const heading=["Empresa","Presença digital","Oportunidade","Próxima ação","Consulta"];
export function LeadTable({ leads }:{leads:DirectoryLead[]}) {
  const [selected,setSelected]=useState<string[]>([]);
  const current=selected.filter(id=>leads.some(lead=>lead.id===id));
  const exportUrl="/api/exportar?ids="+encodeURIComponent(current.join(","));
  const toggle=(id:string,checked:boolean)=>setSelected(checked?[...current,id]:current.filter(value=>value!==id));
  return <><div className="table-wrap desktop-leads"><table className="data-table lead-table" aria-label="Carteira de oportunidades"><thead><tr>
    <th scope="col"><input type="checkbox" aria-label="Selecionar página" checked={current.length===leads.length} onChange={e=>setSelected(e.target.checked?leads.map(l=>l.id):[])}/></th>
    {heading.map(item=><th scope="col" key={item}>{item}{item==="Oportunidade"&&<span className="meta th-hint">sugerida pela leitura, revise na ficha</span>}</th>)}
    </tr></thead><tbody>{leads.map(lead=><tr key={lead.id}><td><input type="checkbox" aria-label={"Selecionar "+lead.name} checked={current.includes(lead.id)} onChange={e=>toggle(lead.id,e.target.checked)}/></td>
    <td><Link className="company" href={"/app/oportunidades/"+lead.id}><Avatar name={lead.name}/><span><strong title={lead.name}>{lead.name}</strong><small>{lead.sector} · {lead.district?lead.district+", ":""}{lead.city}</small></span></Link></td><td>{busy(lead)?<Tag tone="warning">{lead.reading?.state==="running"?lead.reading.step??"Começando a leitura":"Na fila de leitura"}</Tag>:<SiteTag status={lead.website_status}/>}</td>
    <td><div className="stack tight">{lead.coverage?<Score points={lead.observed} maximum={lead.coverage} note={lead.coverage+"% avaliado"}/>:<Reading lead={lead}/>}
      <Tag tone={lead.confidence==="suficiente"?"success":lead.confidence==="pendente"?"warning":""}>{lead.confidence==="suficiente"?"Evidências suficientes":lead.confidence==="pendente"?"Revisão pendente":"Dados insuficientes"}</Tag></div></td>
    <td>{lead.next_action||<span className="muted">A definir</span>}</td><td><time dateTime={lead.consulted_on}>{formatDate(lead.consulted_on)}</time></td></tr>)}</tbody></table></div>
    <div className="mobile-list">{leads.map(lead=><article className="row mobile-lead-row" key={lead.id}>
      <label className="mobile-select"><input type="checkbox" aria-label={"Selecionar "+lead.name} checked={current.includes(lead.id)} onChange={e=>toggle(lead.id,e.target.checked)}/></label>
      <Link className="inline spread" href={"/app/oportunidades/"+lead.id}><div className="stack"><div className="company"><Avatar name={lead.name}/><div><strong>{lead.name}</strong><small>{lead.sector} · {lead.city}, {lead.region}</small></div></div>
      <div className="inline"><SiteTag status={lead.website_status}/>{lead.priority&&<Tag>{lead.priority==="media"?"Prioridade média":"Prioridade "+lead.priority}</Tag>}</div>
      <small>{lead.next_action||"Próxima ação a definir"} · {formatDate(lead.consulted_on)}</small></div><ChevronRight size={16} aria-hidden="true"/></Link>
    </article>)}</div>
    {current.length>0&&<div className="table-foot"><span>{current.length} selecionado(s)</span><a href={exportUrl} className="btn small">Exportar seleção</a></div>}</>;
}
function Reading({lead}:{lead:DirectoryLead}) {
  const r=lead.reading;
  if(r?.state==="done"&&r.points!==null)return <Score points={r.points} maximum={r.maximum}/>;
  if(r?.state==="pending")return <span className="muted">Aguardando o robô…</span>;
  if(r?.state==="running")return <span className="muted">Lendo agora…</span>;
  if(r?.state==="failed")return <span className="muted">Leitura falhou: {readingErrors[r.error??""]??r.error}. Peça de novo na ficha.</span>;
  return <span className="muted">Não avaliado</span>;
}
function Score({points,maximum,note}:{points:number;maximum:number|null;note?:string}) {
  const share=maximum?Math.min(1,points/maximum):0;
  return <div className="score-bar" title={note}><strong>{points}{maximum!==null&&<span className="meta"> / {maximum}</span>}</strong>
    <span className={"bar "+(share>=0.6?"high":share>=0.35?"mid":"low")} aria-hidden="true"><i style={{width:share*100+"%"}}/></span></div>;
}
const busy=(lead:DirectoryLead)=>lead.reading?.state==="pending"||lead.reading?.state==="running";
