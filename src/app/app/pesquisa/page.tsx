import { randomUUID } from "node:crypto";
import Link from "next/link";
import { context } from "@/lib/auth";
import { googleEnabled } from "@/lib/providers";
import { formatDate,researchStates,sectors,type ResearchJob } from "@/lib/domain";
import { StateCity } from "@/components/state-city";
import { startResearch } from "@/lib/research-actions";
import { Submit } from "@/components/submit";
import { ButtonLink,Empty,Field,Flash,Heading,Notice,Panel,Tag,type Search } from "@/components/ui";
export const metadata={title:"Nova pesquisa"};
export default async function ResearchPage({searchParams}:{searchParams:Promise<Search>}) {
  const {db,org}=await context();
  const enabled=googleEnabled();
  const {data,error}=await db.from("research_jobs").select("id,city,region,segment,state,result_count,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(12);
  if(error)throw new Error("Falha ao carregar pesquisas");
  const jobs=(data??[]) as Pick<ResearchJob,"id"|"city"|"region"|"segment"|"state"|"result_count"|"created_at">[];
  return <><Heading group="Pesquisa de empresas" title="Encontre sua próxima oportunidade" description="Defina a região e o segmento de uma pesquisa de identificadores."/><Flash params={await searchParams}/>
  {!enabled&&<Notice tone="warning"><strong>Descoberta externa desativada.</strong> Configure o Google Places no servidor e inicie o worker. <Link href="/app/oportunidades/novo">Cadastrar manualmente</Link></Notice>}
  <div className="grid-two"><Panel title="Configurar pesquisa" action={<Tag tone={enabled?"success":"warning"}>{enabled?"Google Places":"Integração ausente"}</Tag>}>
  <form action={startResearch} className="pad stack"><input type="hidden" name="request_id" value={randomUUID()}/>
  <div className="fields"><StateCity region={org.region} city={org.city}/>
  <Field label="Bairros opcionais" full><input name="districts" maxLength={250} placeholder="Ex.: Centro, Cohama"/></Field>
  <Field label="Segmento"><input name="segment" list="segments" required maxLength={150} defaultValue={org.segments.split(",")[0]?.trim()}/><datalist id="segments">{sectors.map(s=><option value={s} key={s}/>)}</datalist></Field>
  <Field label="Quantidade desejada"><input type="number" name="desired" min={1} max={60} defaultValue={10} required/></Field>
  <Field label="Limite de consultas paginadas"><input type="number" name="max_queries" min={1} max={10} defaultValue={3} required/></Field></div>
  <label className="check"><input type="checkbox" name="skip_seen" defaultChecked/>Excluir identificadores já encontrados em pesquisas anteriores.</label>
  <label className="check"><input type="checkbox" name="authorize" required/>Confirmo o limite de chamadas e entendo que o provedor pode cobrar pelas consultas.</label>
  {enabled?<Submit>Iniciar pesquisa</Submit>:<ButtonLink href="/app/integracoes">Ver integração</ButtonLink>}
  </form></Panel><div className="stack"><Panel title="Como a pesquisa funciona"><div className="pad stack"><ol className="steps"><li>Buscar identificadores pelo segmento e região.</li><li>Organizar os identificadores e remover repetições.</li><li>Consultar detalhes sob demanda para revisão.</li><li>Cadastrar dados obtidos de fonte independente.</li></ol>
  <Notice>O lote guarda somente identificadores. As exclusões por nome são verificadas na visualização. Franquias, contatos anteriores, domínio e aderência à região exigem revisão humana.</Notice></div></Panel></div></div>
  <Panel title="Histórico de pesquisas">{jobs.length?jobs.map(job=><div className="row" key={job.id}><div><strong>{job.segment}</strong><p className="meta">{job.city}, {job.region} · {formatDate(job.created_at)} · {job.result_count} identificadores</p></div><div className="actions"><Tag>{researchStates[job.state]}</Tag><ButtonLink href={"/app/pesquisa/"+job.id} style="small">Abrir</ButtonLink></div></div>):<Empty title="Nenhuma pesquisa registrada" description="Inicie uma pesquisa quando o provedor estiver configurado."/ >}</Panel></>;
}
