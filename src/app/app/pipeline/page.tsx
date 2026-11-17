import Link from "next/link";
import { context } from "@/lib/auth";
import { leadPath, queryLeads } from "@/lib/data";
import { formatDate, stages, type Stage, type Lead } from "@/lib/domain";
import { Empty, Field, Flash, Heading, Panel, Select, Tag, param, type Search } from "@/components/ui";
import { MoveForm } from "@/components/move-form";
import { chanceOf, forecast, type Chance } from "@/lib/chance";
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(n);
const chanceTone:Record<Chance,string>={alta:"success",média:"warning",baixa:"error",nenhuma:"error"};
const lanes:Stage[]=["qualified","contact","identified","preview","proposal","negotiation"];
function Card({lead,owner,preview,chance}:{lead:Lead;owner:boolean;preview:boolean;chance?:Chance}) {
  return <article className="panel pad stack"><Link href={leadPath(lead.id)}><strong>{lead.name}</strong></Link><span className="meta">{lead.sector}</span><span>{lead.next_action||"Próxima ação a definir"}</span><span className="meta">{formatDate(lead.follow_up)} · {lead.assignee_id?"Responsável definido":"Sem responsável"}</span>{preview&&<Tag tone="info">Com prévia</Tag>}{chance&&<Tag tone={chanceTone[chance]}>Chance {chance}</Tag>}
  {lead.contract_value!==null&&<span>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(lead.contract_value)}</span>}<MoveForm lead={lead} owner={owner} origin="pipeline"/></article>;
}
export default async function Pipeline({searchParams}:{searchParams:Promise<Search>}) {
  const [params,{db,org,role}]=await Promise.all([searchParams,context()]);
  const raw=param(params,"etapa")??"qualified";
  const active=Object.hasOwn(stages,raw)?raw as Stage:"qualified";
  const listMode=param(params,"modo")==="lista";
  const {data:previewRows,error}=await db.from("previews").select("lead_id").eq("organization_id",org.id).limit(1000);
  if(error) throw new Error("Falha ao carregar prévias do pipeline");
  const previews=new Set((previewRows??[]).map(p=>p.lead_id));
  // chance = a da resposta do cliente mais recente que foi analisada pela IA
  const [{data:open,error:openError},{data:replies,error:replyError}]=await Promise.all([
    db.from("leads").select("id,contract_value").eq("organization_id",org.id).in("stage",lanes).limit(1000),
    db.from("outreach_events").select("lead_id,content").eq("organization_id",org.id).eq("kind","reply").order("created_at",{ascending:false}).limit(2000)]);
  if(openError||replyError) throw new Error("Falha ao carregar a previsão do pipeline");
  const chances=new Map<string,Chance>();
  for(const r of replies??[]){const c=chanceOf(r.content);if(c&&!chances.has(r.lead_id))chances.set(r.lead_id,c);}
  const plan=forecast((open??[]).map(l=>({contract_value:l.contract_value,chance:chances.get(l.id)??null})));
  const [list,...results]=await Promise.all([queryLeads({stage:active,page:param(params,"page")}),...lanes.map(stage=>queryLeads({stage},8,0))]);
  const owner=role==="owner";
  return <><Heading group="Organização comercial" title="Pipeline" description="Acompanhe a negociação e registre a próxima ação de cada empresa."><Link className="btn desktop-only" href={listMode?"/app/pipeline":"/app/pipeline?modo=lista"}>{listMode?"Ver quadro":"Ver lista por etapa"}</Link></Heading><Flash params={params}/>
  {plan.total>0&&<Panel title="Previsão de fechamento"><div className="pad stack"><p><strong>{money(plan.expected)}</strong> previstos de {money(plan.total)} em negociação.</p>
  <p className="meta">Valor informado de cada empresa × a chance lida na última resposta do cliente (alta 70%, média 40%, baixa 12,5%).{plan.withoutChance>0?" "+plan.withoutChance+(plan.withoutChance>1?" empresas com valor ainda não têm":" empresa com valor ainda não tem")+" resposta analisada e não entram na previsão.":""}</p></div></Panel>}
  {!listMode&&<div className="board desktop-pipeline">{lanes.map((stage,i)=><section className="lane" key={stage}><header className="inline spread"><h2>{stages[stage]}</h2><Tag>{results[i].total}</Tag></header>
  {results[i].leads.length?results[i].leads.map(lead=><Card key={lead.id} lead={lead} owner={owner} preview={previews.has(lead.id)} chance={chances.get(lead.id)}/>):<p className="meta mt-3">Nenhuma empresa nesta etapa.</p>}
  {results[i].total>results[i].leads.length&&<Link href={"/app/pipeline?modo=lista&etapa="+stage}>Ver todos</Link>}</section>)}</div>}
  <div className={listMode?"stack":"stack mobile-only"}><Panel title="Empresas por etapa"><form className="pad inline" action="/app/pipeline"><input type="hidden" name="modo" value="lista"/>
  <Field label="Etapa"><Select name="etapa" options={stages} defaultValue={active}/></Field><button className="btn self-end" type="submit">Aplicar etapa</button></form></Panel>
  {list.leads.length?list.leads.map(lead=><Card key={lead.id} lead={lead} owner={owner} preview={previews.has(lead.id)} chance={chances.get(lead.id)}/>):<Panel title={stages[active]}><Empty title="Sem empresas nesta etapa" description="Selecione outra etapa ou mova um lead pela carteira."/></Panel>}
  <div className="actions">{list.filters.page>1&&<Link className="btn" href={"/app/pipeline?modo=lista&etapa="+active+"&page="+(list.filters.page-1)}>Anterior</Link>}{list.total>list.filters.page*20&&<Link className="btn" href={"/app/pipeline?modo=lista&etapa="+active+"&page="+(list.filters.page+1)}>Próxima</Link>}</div></div>
  </>;
}
