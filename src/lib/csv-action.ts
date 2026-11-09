"use server";
import { z } from "zod";
import { context } from "./auth";
import { leadSchema } from "./forms";
import { contactValue,domain } from "./domain";
import { maxCsvRows } from "./csv";
export type ImportState={created:number;reports:{line:number;message:string}[];error?:string};
const schema=leadSchema.omit({override:true});
export async function importCsv(_state:ImportState,data:FormData):Promise<ImportState> {
  const {db,org}=await context();
  const input=data.get("rows");
  if(typeof input!=="string"||input.length>512000||data.get("confirmed")!=="on") return {created:0,reports:[],error:"Confirme a importação dos dados próprios após a prévia."};
  let parsed:unknown;
  try{parsed=JSON.parse(input);}catch{return {created:0,reports:[],error:"Arquivo ou mapeamento inválido."};}
  const batch=z.array(z.record(z.string(),z.string())).min(1).max(maxCsvRows).safeParse(parsed);
  if(!batch.success) return {created:0,reports:[],error:"Use de 1 a 100 linhas."};
  const reports:ImportState["reports"]=[];
  const payload=batch.data.flatMap((row,index)=>{
    const check=schema.safeParse({...row,region:row.region?.trim().toUpperCase()});
    if(!check.success) {reports.push({line:index+2,message:"Revise o campo "+String(check.error.issues[0]?.path[0]??"obrigatório")+"."});return [];}
    const f=check.data;
    const columns=[["phone",f.phone],["email",f.email],["instagram",f.instagram],["website",f.website],["maps",f.maps]] as const;
    const mapped=columns.filter(([,value])=>Boolean(value)).map(([kind,value])=>{const result=contactValue(kind,value??"");return result?{kind,...result}:null;});
    if(mapped.some(c=>c===null)){reports.push({line:index+2,message:"Canal comercial inválido."});return [];}
    return [{line:index+2,data:{...f,domain:f.website?domain(f.website):null,contacts:mapped}}];
  });
  if(!payload.length) return {created:0,reports,error:"Nenhuma linha válida foi importada."};
  const {data:result,error}=await db.rpc("import_leads",{p_org:org.id,p_items:payload.map(r=>r.data)});
  if(error||!Array.isArray(result)) return {created:0,reports,error:"A importação falhou. O lote não foi gravado."};
  let created=0;
  for(const item of result){
    const row=payload[Number(item.position)-1];
    if(!row) continue;
    if(item.status==="created"){created++;continue;}
    const descriptions:Record<string,string>={duplicate:"Possível duplicação. Revise a carteira antes de cadastrar outra unidade.",suppressed:"Registro excluído pela lista de exclusão ou não contato.",invalid:"Dados inválidos para cadastro."};
    reports.push({line:row.line,message:descriptions[item.status]??"Linha indisponível."});
  }
  return {created,reports:reports.sort((a,b)=>a.line-b.line)};
}
