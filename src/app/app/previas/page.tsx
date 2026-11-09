import { context } from "@/lib/auth";
import { leadPath } from "@/lib/data";
import { formatDate, previewStates, type Preview } from "@/lib/domain";
import { ButtonLink, Empty, Heading, Panel, SafeLink, Tag, param, type Search } from "@/components/ui";
export default async function Previews({searchParams}:{searchParams:Promise<Search>}) {
  const [{db,org},params]=await Promise.all([context(),searchParams]);
  const page=Math.min(5000,Math.max(1,Math.floor(Number(param(params,"page"))||1)));
  const {data,count,error}=await db.from("previews").select("id,lead_id,url,status,created_at,sent_on,leads(name)",{count:"exact"}).eq("organization_id",org.id).order("created_at",{ascending:false}).range((page-1)*25,page*25-1);
  if(error) throw new Error("Falha ao carregar prévias");
  const rows=(data??[]) as unknown as (Pick<Preview,"id"|"url"|"status"|"created_at"|"sent_on">&{lead_id:string;leads:{name:string}})[];
  return <><Heading group="Projetos" title="Prévias" description="Acompanhe os projetos registrados, os envios e o retorno das empresas."/>
  <Panel title="Prévias registradas">{rows.length?rows.map(p=><div className="row" key={p.id}><div><h3>{p.leads?.name}</h3><p><SafeLink url={p.url}/></p><p className="meta">Criação {formatDate(p.created_at)} · Envio {formatDate(p.sent_on)}</p></div><div className="actions"><Tag tone="info">{previewStates[p.status]}</Tag><ButtonLink href={leadPath(p.lead_id,"previa")} style="small">Revisar prévia</ButtonLink></div></div>):<Empty title="Nenhuma prévia registrada" description="Abra um lead para registrar uma URL, o checklist e a data de envio."><ButtonLink href="/app/oportunidades">Ver oportunidades</ButtonLink></Empty>}
  <div className="table-foot"><span>Página {page}</span><div className="actions">{page>1&&<ButtonLink href={"/app/previas?page="+(page-1)}>Anterior</ButtonLink>}{(count??0)>page*25&&<ButtonLink href={"/app/previas?page="+(page+1)}>Próxima</ButtonLink>}</div></div></Panel></>;
}
