"use client";
import { useState } from "react";
import { Sparkles, Undo2 } from "lucide-react";
import { Notice } from "./ui";
export type Refine=(input:{content:string;instruction:string;purpose:string})=>Promise<{text?:string;tips?:string[];error?:string}>;
/** Ajuste em conversa com a IA: cada pedido reescreve o texto do campo, e dá para desfazer. */
export function AiRefine({refine,name,content,purpose,onText,quick,placeholder,noun,objection=false}:{refine:Refine;name:string;content:string;purpose:string;onText:(text:string)=>void;quick:string[];placeholder:string;noun:string;objection?:boolean}) {
  const [allowed,setAllowed]=useState(false);
  const [ask,setAsk]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [tips,setTips]=useState<string[]>([]);
  const [history,setHistory]=useState<{text:string;asked:string}[]>([]);
  async function run(instruction:string) {
    if(!instruction.trim()||busy)return;
    setBusy(true);setError("");
    const result=await refine({content,instruction,purpose}).catch(()=>({error:"A IA não respondeu. Tente de novo."}) as {text?:string;tips?:string[];error?:string});
    setBusy(false);
    if(result.error||!result.text){setError(result.error??"Sem resposta.");return;}
    setHistory(h=>[...h,{text:content,asked:instruction}]);setTips(result.tips??[]);setAsk("");onText(result.text);
  }
  function undo(){const last=history.at(-1);if(!last)return;setHistory(h=>h.slice(0,-1));onText(last.text);}
  return <div className="ai-refine">
    <div className="ai-head"><span className="ai-icon" aria-hidden="true"><Sparkles size={16}/></span><strong>Ajustar com {name}</strong><span className="meta">Peça um ajuste, ele reescreve {noun==="mensagem"?"a mensagem":"o "+noun} acima, você revisa.</span></div>
    {!allowed&&<label className="check"><input type="checkbox" onChange={e=>setAllowed(e.target.checked)}/>Autorizo enviar {noun==="mensagem"?"esta mensagem":"este "+noun} e os achados da empresa ao {name}.</label>}
    <div className="chips">{quick.map(q=><button key={q} type="button" className="btn small" disabled={!allowed||busy} onClick={()=>run(q)}>{q}</button>)}
      {objection&&<button type="button" className="btn small" disabled={!allowed||busy} onClick={()=>setAsk("A empresa respondeu: ")}>Responder objeção…</button>}</div>
    <div className="ai-ask"><input value={ask} disabled={!allowed||busy} onChange={e=>setAsk(e.target.value)} maxLength={400} aria-label={"Pedido de ajuste para o "+name}
      placeholder={placeholder} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void run(ask);}}}/>
      <button type="button" className="btn primary small" disabled={!allowed||busy||!ask.trim()} onClick={()=>run(ask)}>{busy?"Ajustando…":"Ajustar"}</button></div>
    {error&&<Notice tone="error">{error}</Notice>}
    {history.length>0&&<div className="ai-log"><span className="meta">Ajustes: {history.map(h=>h.asked).join(" → ")}</span><button type="button" className="btn small ghost" onClick={undo}><Undo2 size={14} aria-hidden="true"/>Desfazer</button></div>}
    {tips.length>0&&<div className="chips"><span className="meta">Próximo ajuste:</span>{tips.map(t=><button key={t} type="button" className="btn small ghost ai-tip" disabled={busy} onClick={()=>run(t)}>{t}</button>)}</div>}
  </div>;
}
