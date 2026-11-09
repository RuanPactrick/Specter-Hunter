"use client";
import { useActionState,useState } from "react";
import { Field, Notice, Select } from "./ui";
import { Submit } from "./submit";
import { csvFields, maxCsvBytes, readCsv, requiredFields, suggestMap } from "@/lib/csv";
import { importCsv } from "@/lib/csv-action";
export function Importer(){
  const [preview,setPreview]=useState<ReturnType<typeof readCsv>>();
  const [mapping,setMapping]=useState<Record<string,string>>({});
  const [error,setError]=useState("");
  const [result,action]=useActionState(importCsv,{created:0,reports:[]});
  const rows=preview?.rows.map(row=>Object.fromEntries(Object.entries(mapping).filter(([,col])=>col!=="").map(([key,col])=>[key,row[Number(col)]??""])))??[];
  const mapped=requiredFields.every(key=>mapping[key]!==undefined&&mapping[key]!=="");
  return <div className="pad stack"><Field label="Arquivo CSV" hint="Até 256 KB e 100 linhas. Inclua a fonte e a data da consulta."><input type="file" accept=".csv,text/csv" onChange={async event=>{
    const file=event.target.files?.[0];setPreview(undefined);setError("");
    if(!file)return;
    if(file.size>maxCsvBytes){setError("O arquivo excede 256 KB.");return;}
    try{const data=readCsv(await file.text());setPreview(data);setMapping(suggestMap(data.headers));}
    catch(e){setError(e instanceof Error?e.message:"O arquivo não pôde ser lido.");}
  }}/></Field>
  {error&&<Notice tone="error">{error}</Notice>}
  {preview&&<><h3>Mapeamento de colunas</h3><div className="fields">{Object.entries(csvFields).map(([key,label])=><Field key={key} label={label}><Select options={Object.fromEntries(preview.headers.map((h,i)=>[i,h]))} empty="Não importar" value={mapping[key]??""} onChange={event=>setMapping({...mapping,[key]:event.target.value})}/></Field>)}</div>
  <h3>Prévia · {rows.length} linha(s)</h3><div className="table-wrap"><table className="data-table"><thead><tr>{["Empresa","Segmento","Cidade","Estado","Fonte"].map(v=><th scope="col" key={v}>{v}</th>)}</tr></thead><tbody>{rows.slice(0,5).map((row,i)=><tr key={i}>{["name","sector","city","region","source_label"].map(v=><td key={v}>{row[v]||"—"}</td>)}</tr>)}</tbody></table></div>
  {!mapped?<Notice tone="warning">Mapeie empresa, segmento, cidade, estado, fonte e data da consulta.</Notice>:<form className="stack" action={action}><input type="hidden" name="rows" value={JSON.stringify(rows)}/><label className="check"><input type="checkbox" name="confirmed" required/>Confirmei a origem dos dados e revisei o mapeamento.</label><Submit>Confirmar importação</Submit></form>}</>}
  {result.error&&<Notice tone="error">{result.error}</Notice>}
  {result.created>0&&<Notice tone={result.reports.length?"warning":"success"}>{result.created} empresa(s) cadastrada(s). {result.reports.length>0?"As demais linhas constam no relatório.":""}</Notice>}
  {result.reports.length>0&&<ul className="list-disc pl-5">{result.reports.map(r=><li key={r.line}><strong>Linha {r.line}.</strong> {r.message}</li>)}</ul>}
  </div>;
}
