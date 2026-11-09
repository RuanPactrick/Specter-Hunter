"use client";
import { useState } from "react";
export function CopyText({value,label}:{value:string;label:string}) {
  const [status,setStatus]=useState("");
  return <div className="stack"><button className="btn" type="button" onClick={async()=>{
    try { await navigator.clipboard.writeText(value);setStatus("Texto copiado."); }
    catch { setStatus("Selecione o texto para copiar manualmente."); }
  }}>{label}</button>{status&&<p role="status">{status}</p>}</div>;
}
