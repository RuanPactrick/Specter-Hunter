import { randomUUID } from "node:crypto";
import Link from "next/link";
import { context } from "@/lib/auth";
import { apifyEnabled,googleEnabled } from "@/lib/providers";
import { formatDate,researchStates,sectors,type ResearchJob } from "@/lib/domain";
import { StateCity } from "@/components/state-city";
import { startResearch } from "@/lib/research-actions";
import { Submit } from "@/components/submit";
import { ButtonLink,Empty,Field,Flash,Heading,Notice,Panel,Tag,type Search } from "@/components/ui";
// as ações desta página processam a fila logo depois do clique (after)
export const maxDuration=300;
export const metadata={title:"Nova pesquisa"};
export default async function ResearchPage({searchParams}:{searchParams:Promise<Search>}) {
  const {db,org}=await context();
  const maps=apifyEnabled();
  const enabled=maps||googleEnabled();
  const {data,error}=await db.from("research_jobs").select("id,city,region,segment,state,result_count,leads_created,provider,created_at").eq("organization_id",org.id).order("created_at",{ascending:false}).limit(12);
  if(error)throw new Error("Falha ao carregar pesquisas");
  const jobs=(data??[]) as (Pick<ResearchJob,"id"|"city"|"region"|"segment"|"state"|"result_count"|"created_at">&{leads_created:number;provider:string})[];
  return <><Heading group="Pesquisa de empresas" title="Encontre sua próxima oportunidade" description={maps?"Escolha o segmento e a cidade. As empresas encontradas no Google Maps entram direto na sua carteira.":"Defina a região e o segmento de uma pesquisa de identificadores."}/><Flash params={await searchParams}/>
  {!enabled&&<Notice tone="warning"><strong>Descoberta externa desativada.</strong> Ligue o Apify ou o Google Places no servidor e inicie o worker. <Link href="/app/oportunidades/novo">Cadastrar manualmente</Link></Notice>}
  <div className="grid-two"><Panel title="Configurar pesquisa" action={<Tag tone={enabled?"success":"warning"}>{maps?"Google Maps via Apify":enabled?"Google Places":"Integração ausente"}</Tag>}>
  <form action={startResearch} className="pad stack"><input type="hidden" name="request_id" value={randomUUID()}/>
  <div className="fields"><StateCity region={org.region} city={org.city}/>
  <Field label="Bairros opcionais" full><input name="districts" maxLength={250} placeholder="Ex.: Centro, Cohama"/></Field>
  <Field label="Segmento"><input name="segment" list="segments" required maxLength={150} defaultValue={org.segments.split(",")[0]?.trim()}/><datalist id="segments">{sectors.map(s=><option value={s} key={s}/>)}</datalist></Field>
  <Field label={maps?"Quantas empresas":"Quantidade desejada"} hint={maps?"De 1 a 60. O Apify cobra por empresa encontrada.":undefined}><input type="number" name="desired" min={1} max={60} defaultValue={10} required/></Field>
  {maps?<input type="hidden" name="max_queries" value="1"/>:<Field label="Limite de consultas paginadas"><input type="number" name="max_queries" min={1} max={10} defaultValue={3} required/></Field>}</div>
  <label className="check"><input type="checkbox" name="skip_seen" defaultChecked/>{maps?"Pular empresas já encontradas em pesquisas anteriores.":"Excluir identificadores já encontrados em pesquisas anteriores."}</label>
  <label className="check"><input type="checkbox" name="authorize" required/>Confirmo o limite de chamadas e entendo que o provedor pode cobrar pelas consultas.</label>
  {enabled?<Submit>Iniciar pesquisa</Submit>:<ButtonLink href="/app/integracoes">Ver integração</ButtonLink>}
  </form></Panel><div className="stack"><Panel title="Como a pesquisa funciona"><div className="pad stack">{maps?<><ol className="steps"><li>O worker procura o segmento na cidade pelo Google Maps.</li><li>Cada empresa nova entra na carteira com nome, endereço, telefone e site.</li><li>Repetidas e as da lista de não contato ficam de fora.</li><li>Depois, use Ler sites para trazer e-mail, Instagram e CNPJ.</li></ol>
  <Notice>Os contatos entram como não confirmados. Confira antes de abordar.</Notice></>:<><ol className="steps"><li>Buscar identificadores pelo segmento e região.</li><li>Organizar os identificadores e remover repetições.</li><li>Consultar detalhes sob demanda para revisão.</li><li>Cadastrar dados obtidos de fonte independente.</li></ol>
  <Notice>O lote guarda somente identificadores. As exclusões por nome são verificadas na visualização. Franquias, contatos anteriores, domínio e aderência à região exigem revisão humana.</Notice></>}</div></Panel></div></div>
  <Panel title="Histórico de pesquisas">{jobs.length?jobs.map(job=><div className="row" key={job.id}><div><strong>{job.segment}</strong><p className="meta">{job.city}, {job.region} · {formatDate(job.created_at)} · {job.provider==="apify"?job.leads_created+" empresas novas na carteira":job.result_count+" identificadores"}</p></div><div className="actions"><Tag>{researchStates[job.state]}</Tag><ButtonLink href={"/app/pesquisa/"+job.id} style="small">Abrir</ButtonLink></div></div>):<Empty title="Nenhuma pesquisa registrada" description="Inicie uma pesquisa quando o provedor estiver configurado."/ >}</Panel></>;
}
