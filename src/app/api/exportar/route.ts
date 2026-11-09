import { z } from "zod";
import { context } from "@/lib/auth";
import { queryLeads, withCurrentSite, type DirectoryLead } from "@/lib/data";
import { toCsv } from "@/lib/csv";
import { sites, stages } from "@/lib/domain";
const cap=1000;
export async function GET(request:Request) {
  const {db,org}=await context();
  const {searchParams}=new URL(request.url);
  const ids=searchParams.get("ids");
  let leads:DirectoryLead[];
  let truncated=false;
  if(ids!==null){
    const parsed=z.array(z.uuid()).min(1).max(20).safeParse(ids.split(","));
    if(!parsed.success)return new Response("Seleção inválida.",{status:400});
    const {data,error}=await db.from("lead_directory").select("*").eq("organization_id",org.id).in("id",parsed.data);
    if(error)return new Response("Exportação indisponível.",{status:503});
    leads=((data??[]) as DirectoryLead[]).map(withCurrentSite);
  } else {
    const result=await queryLeads(Object.fromEntries(searchParams),cap,0);
    leads=result.leads;truncated=result.total>cap;
  }
  if(truncated)return new Response("Aplique filtros para exportar até 1.000 registros por vez.",{status:422});
  const {error}=await db.from("audit_events").insert({organization_id:org.id,event:"export.csv",detail:{count:leads.length,selection:ids!==null}});
  if(error)return new Response("A auditoria da exportação não pôde ser registrada.",{status:503});
  const rows=[["Empresa","Segmento","Cidade","Estado","Bairro","Etapa","Presença digital","Pontuação observada","Cobertura","Próxima ação","Última consulta","Fonte de cadastro","Observações"],
    ...leads.map(l=>[l.name,l.sector,l.city,l.region,l.district,stages[l.stage],sites[l.website_status],l.coverage?l.observed:"",l.coverage+"%",l.next_action,l.consulted_on,l.source_label,l.notes])];
  return new Response(toCsv(rows),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="specter-hunter-oportunidades.csv"',"Cache-Control":"private, no-store"}});
}
