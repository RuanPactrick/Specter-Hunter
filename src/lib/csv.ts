import Papa from "papaparse";
import { nameKey } from "./domain";
export const csvFields = {
  name:"Empresa", sector:"Segmento", city:"Cidade", region:"Estado (UF)", district:"Bairro", address:"Endereço comercial",
  website:"Site", instagram:"Instagram", maps:"Google Maps", phone:"Telefone comercial", email:"E-mail comercial",
  source_label:"Fonte", source_url:"URL da fonte", consulted_on:"Data de consulta (AAAA-MM-DD)", notes:"Observações"
} as const;
export type CsvField=keyof typeof csvFields;
export const requiredFields:CsvField[]=["name","sector","city","region","source_label","consulted_on"];
export const maxCsvBytes=256_000;
export const maxCsvRows=100;
export function readCsv(text:string) {
  const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,""),{skipEmptyLines:"greedy",preview:maxCsvRows+2});
  if(parsed.errors.length) throw new Error("O CSV tem linhas ou aspas inválidas. Confira o arquivo.");
  const [headers,...rows]=parsed.data;
  if(!headers?.length||headers.length>35||!rows.length||rows.length>maxCsvRows) throw new Error("Use um cabeçalho e entre 1 e 100 linhas de dados.");
  if(rows.some(row=>row.length!==headers.length)) throw new Error("Cada linha deve ter a mesma quantidade de colunas que o cabeçalho.");
  return {headers,rows};
}
const aliases:Partial<Record<CsvField,string[]>>={
  name:["nome","empresa","name"],sector:["segmento","sector"],city:["cidade","city"],region:["estado","uf","region"],
  source_label:["fonte","source_label"],source_url:["url da fonte","source_url"],consulted_on:["data","data de consulta","consulted_on"],
  district:["bairro","district"],address:["endereco","endereco comercial","address"],website:["site","website"],phone:["telefone","telefone comercial","phone"],email:["email","e-mail","email comercial"],notes:["observacoes","notes"]
};
export function suggestMap(headers:string[]) {
  return Object.fromEntries(Object.entries(csvFields).map(([key,label])=>{
    const match=new Set([key,nameKey(label),...(aliases[key as CsvField]??[])]);
    const index=headers.findIndex(h=>match.has(nameKey(h)));
    return [key,index<0?"":String(index)];
  }));
}
export function csvCell(value:unknown) {
  const input=String(value??"");
  const safe=/^\s*[=+\-@\t\r\n]/u.test(input)||/^[\t\r\n]/.test(input) ? "'"+input : input;
  return '"'+safe.replaceAll('"','""')+'"';
}
export function toCsv(rows:unknown[][]) {
  return "\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}
