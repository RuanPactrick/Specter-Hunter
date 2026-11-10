import { notFound } from "next/navigation";
import { z } from "zod";
import { context } from "@/lib/auth";
import { formatDate,researchStates,type ResearchJob } from "@/lib/domain";
import { cancelResearch,lookupPlace } from "@/lib/research-actions";
import { apifyEnabled,googleEnabled } from "@/lib/providers";
import { LiveLookup } from "@/components/live-lookup";
import { Refresh } from "@/components/refresh";
import { Submit } from "@/components/submit";
import { ButtonLink,Empty,Flash,Heading,Notice,Pairs,Panel,Tag,type Search } from "@/components/ui";
const jobFields="id,city,region,districts,segment,desired,max_queries,query_count,result_count,leads_created,provider,attempt,state,error_code,created_at,started_at,finished_at,cancel_requested,step";
const codes:Record<string,string>={provider_disabled:"O provedor não está habilitado no worker.",credentials:"O provedor recusou a credencial.",provider_limit:"O provedor limitou as consultas.",provider_unavailable:"O provedor ficou indisponível.",network:"A conexão expirou ou falhou.",request_rejected:"O provedor rejeitou os parâmetros.",invalid_response:"A resposta veio em formato inesperado.",lease_exhausted:"O worker interrompeu a execução e esgotou as tentativas.",query_budget:"O limite de consultas do job ou da organização foi atingido.",pagination_stalled:"A fonte repetiu o cursor de paginação.",database:"A fila ficou temporariamente indisponível.",worker_stopped:"O worker parou e a pesquisa foi reagendada."};
export default async function JobPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Search>}) {
  const [{id},{db,org},query]=await Promise.all([params,context(),searchParams]);
  if(!z.uuid().safeParse(id).success)notFound();
  const [jobData,result,steps]=await Promise.all([
    db.from("research_jobs").select(jobFields).eq("organization_id",org.id).eq("id",id).maybeSingle(),
    db.from("research_results").select("provider_id,created_at").eq("organization_id",org.id).eq("job_id",id).order("created_at").limit(60),
    db.from("research_job_steps").select("id,step,event,created_at").eq("organization_id",org.id).eq("job_id",id).order("id",{ascending:false}).limit(12)
  ]);
  if(jobData.error||result.error||steps.error)throw new Error("Falha ao carregar pesquisa");
  if(!jobData.data)notFound();
  const job=jobData.data as ResearchJob&{step:string;leads_created:number;provider:string};
  // o provedor só é gravado quando a página volta do Apify: enquanto roda, vale o que está ligado no servidor
  const maps=job.provider==="apify"||((job.state==="running"||job.state==="pending")&&apifyEnabled());
  const active=job.state==="running"||job.state==="pending";
  const status=researchStates[job.state];
  const stepNames:Record<string,string>={queued:"Fila",discovery:"Descoberta",deduplication:"Normalização e duplicação",retry:"Nova tentativa",cancel:"Cancelamento",finished:"Encerramento"};
  const eventNames:Record<string,string>={queued:"Na fila",request_reserved:"Consulta reservada",identifiers_saved:"Página processada",requested:"Solicitado",pending:"Reagendada",completed:"Concluída",partial:"Parcial",failed:"Falhou",cancelled:"Cancelada",awaiting_configuration:"Aguardando configuração",limit_reached:"Limite atingido"};
  return <><Refresh active={active}/><Heading group="Pesquisa de empresas" title={active?"Pesquisa em andamento":"Acompanhamento da pesquisa"} description={job.segment+" · "+job.city+", "+job.region}>
    <ButtonLink href="/app/pesquisa">Nova pesquisa</ButtonLink><ButtonLink href="/app/oportunidades/novo">Cadastrar de fonte independente</ButtonLink>{active&&<form action={cancelResearch.bind(null,id)}><Submit style="danger">Cancelar pesquisa</Submit></form>}</Heading><Flash params={query}/>
  {job.error_code&&<Notice tone={job.state==="failed"?"error":"warning"}>{codes[job.error_code]??"A execução encontrou um erro."} Os identificadores já gravados permanecem disponíveis.</Notice>}
  {job.cancel_requested&&active&&<Notice tone="warning">Aguardando a solicitação em curso terminar. A próxima página não será processada.</Notice>}
  {job.state==="pending"&&!job.started_at&&<Notice>A pesquisa está na fila. Confira se o worker está em execução.</Notice>}
  <div className="grid-two"><Panel title="Andamento" action={<Tag tone={job.state==="completed"?"success":job.state==="failed"?"error":active?"info":"warning"} dot>{status}</Tag>}>
  <div className="pad stack"><progress value={job.result_count} max={job.desired} aria-label="Identificadores encontrados em relação ao solicitado"/>
  <Pairs items={[["Etapa",stepNames[job.step]??status],...(maps?[["Empresas novas na carteira",String(job.leads_created)] as [string,string]]:[]),[maps?"Encontradas no Maps":"Identificadores",job.result_count+" de "+job.desired+" solicitados"],["Consultas reservadas",job.query_count+" / "+job.max_queries],["Tentativas",job.attempt],["Início",formatDate(job.started_at)],["Encerramento",formatDate(job.finished_at)]]}/></div></Panel>
  <Panel title="Eventos da execução">{steps.data?.map(s=><div className="row" key={s.id}><strong>{stepNames[s.step]??s.step}</strong><span className="meta">{eventNames[s.event]??"Atualização"}</span></div>)}</Panel></div>
  {maps?<Panel title="Empresas cadastradas"><div className="pad stack">
    <p>{job.leads_created?job.leads_created+" empresas entraram na carteira. As que já estavam lá ou na lista de não contato ficaram de fora ("+Math.max(0,job.result_count-job.leads_created)+").":active?"As empresas aparecem na carteira quando o Google Maps responder, em geral em menos de um minuto.":"Nenhuma empresa nova: as encontradas já estavam na carteira ou na lista de não contato."}</p>
    <div className="actions"><ButtonLink href={"/app/oportunidades?sector="+encodeURIComponent(job.segment)} style="primary">Ver na carteira</ButtonLink></div></div></Panel>:
  <Panel title={active||job.state!=="completed"?"Resultados disponíveis":"Identificadores encontrados"} description="Fonte Google Maps. Os detalhes são consultados sob demanda e ficam fora da carteira e do CSV.">
  {result.data?.length?result.data.map((item,i)=><div className="row !block" key={item.provider_id}><details className="disclosure"><summary>Resultado {i+1} · <code>{item.provider_id}</code></summary><div className="inner stack">
    {googleEnabled()?<LiveLookup label="Consultar detalhes agora" run={lookupPlace.bind(null,id,item.provider_id)}/>:<p className="muted">Google Places desativado. O identificador permanece disponível.</p>}
  </div></details></div>):<Empty title="Nenhum identificador disponível" description={active?"Os resultados aparecerão conforme cada página for processada.":"A fonte não produziu resultados disponíveis para esta execução."}/>}
  </Panel>}</>;
}
