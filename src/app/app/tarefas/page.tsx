import Link from "next/link";
import { context } from "@/lib/auth";
import { leadPath } from "@/lib/data";
import { formatDate, taskKinds, today, type Task } from "@/lib/domain";
import { taskStatus } from "@/lib/lead-actions";
import { ButtonLink, Empty, Flash, Heading, Panel, Tag, param, type Search } from "@/components/ui";
import { Submit } from "@/components/submit";
const views={today:"Hoje",late:"Atrasadas",upcoming:"Próximas",done:"Concluídas"} as const;
export default async function Tasks({searchParams}:{searchParams:Promise<Search>}) {
  const [params,{db,org,userId}]=await Promise.all([searchParams,context()]);
  const raw=param(params,"vista")??"today";
  const view=Object.hasOwn(views,raw)?raw as keyof typeof views:"today";
  const page=Math.min(5000,Math.max(1,Math.floor(Number(param(params,"page"))||1)));
  const date=today();
  let query=db.from("tasks").select("id,title,kind,due,status,lead_id,note,assignee_id,leads(name)",{count:"exact"}).eq("organization_id",org.id).eq("status",view==="done"?"done":"open");
  if(view==="today") query=query.eq("due",date);
  if(view==="late") query=query.lt("due",date);
  if(view==="upcoming") query=query.gt("due",date);
  const {data,count,error}=await query.order("due").order("id").range((page-1)*25,page*25-1);
  if(error) throw new Error("Falha ao carregar tarefas");
  const rows=(data??[]) as unknown as Task[];
  return <><Heading group="Organização comercial" title="Tarefas" description="Revise prazos e acompanhe os próximos passos da carteira."/><Flash params={params}/>
  <nav className="tabs" aria-label="Visões de tarefas">{Object.entries(views).map(([key,label])=><Link href={"/app/tarefas?vista="+key} key={key} aria-current={view===key?"page":undefined}>{label}</Link>)}</nav>
  <Panel title={views[view]}>{rows.length?rows.map(t=><div className="row" key={t.id}><div><h3>{t.title}</h3><p className="meta">{t.leads?.name} · {taskKinds[t.kind]} · {formatDate(t.due)} · {t.assignee_id===userId?"Minha responsabilidade":t.assignee_id?"Membro da organização":"A definir"}</p>{t.note&&<p>{t.note}</p>}</div><div className="actions">
  {t.due<date&&t.status==="open"&&<Tag tone="warning">Atrasada</Tag>}<ButtonLink href={leadPath(t.lead_id)} style="small">Abrir lead</ButtonLink><form action={taskStatus.bind(null,t.id,t.status==="open"?"done":"open")}><Submit style="small primary">{t.status==="open"?"Concluir":"Reabrir"}</Submit></form></div></div>):<Empty title="Nenhuma tarefa nesta visão" description="Crie tarefas no detalhe do lead ou escolha outro período."><ButtonLink href="/app/oportunidades">Ver oportunidades</ButtonLink></Empty>}
  <div className="table-foot"><span>Página {page}</span><div className="actions">{page>1&&<ButtonLink href={"/app/tarefas?vista="+view+"&page="+(page-1)}>Anterior</ButtonLink>}{(count??0)>page*25&&<ButtonLink href={"/app/tarefas?vista="+view+"&page="+(page+1)}>Próxima</ButtonLink>}</div></div></Panel></>;
}
