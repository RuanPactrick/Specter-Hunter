"use client";
import { useState, type ReactNode } from "react";
import { Copy, ExternalLink, Sparkles, Undo2 } from "lucide-react";
import { Field, Notice, Select } from "./ui";
import { Submit } from "./submit";
import { messageTemplate, purposes, whatsappLink, type Contact, type Purpose } from "@/lib/domain";
/** Abordagem em 3 passos: objetivo, mensagem (com fatos para inserir) e envio + registro. */
type Refine=(input:{content:string;instruction:string;purpose:string})=>Promise<{text?:string;tips?:string[];error?:string}>;
const quick=["Melhorar a mensagem","Mais curta","Mais próxima e informal","Mais formal","Começar com um elogio"];
/** Ajuste em conversa com a IA: cada pedido reescreve o texto do campo, e dá para desfazer. */
function AiRefine({refine,name,content,purpose,onText}:{refine:Refine;name:string;content:string;purpose:string;onText:(text:string,undo?:boolean)=>void}) {
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
  function undo(){const last=history.at(-1);if(!last)return;setHistory(h=>h.slice(0,-1));onText(last.text,true);}
  return <div className="ai-refine">
    <div className="ai-head"><span className="ai-icon" aria-hidden="true"><Sparkles size={16}/></span><strong>Ajustar com {name}</strong><span className="meta">Peça um ajuste, ele reescreve a mensagem acima, você revisa.</span></div>
    {!allowed&&<label className="check"><input type="checkbox" onChange={e=>setAllowed(e.target.checked)}/>Autorizo enviar esta mensagem e os fatos confirmados da empresa ao {name}.</label>}
    <div className="chips">{quick.map(q=><button key={q} type="button" className="btn small" disabled={!allowed||busy} onClick={()=>run(q)}>{q}</button>)}
      <button type="button" className="btn small" disabled={!allowed||busy} onClick={()=>setAsk("A empresa respondeu: ")}>Responder objeção…</button></div>
    <div className="ai-ask"><input value={ask} disabled={!allowed||busy} onChange={e=>setAsk(e.target.value)} maxLength={400} aria-label={"Pedido de ajuste para o "+name}
      placeholder="Ex.: cite as 173 avaliações; a empresa respondeu: já temos site" onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void run(ask);}}}/>
      <button type="button" className="btn primary small" disabled={!allowed||busy||!ask.trim()} onClick={()=>run(ask)}>{busy?"Ajustando…":"Ajustar"}</button></div>
    {error&&<Notice tone="error">{error}</Notice>}
    {history.length>0&&<div className="ai-log"><span className="meta">Ajustes: {history.map(h=>h.asked).join(" → ")}</span><button type="button" className="btn small ghost" onClick={undo}><Undo2 size={14} aria-hidden="true"/>Desfazer</button></div>}
    {tips.length>0&&<div className="chips"><span className="meta">Próximo ajuste:</span>{tips.map(t=><button key={t} type="button" className="btn small ghost" disabled={busy} onClick={()=>run(t)}>{t}</button>)}</div>}
  </div>;
}
export function MessageEditor({ sender,city,preview,contact,draft,action,facts=[],unlock,refine,aiName="Gemini" }:{sender:string;city:string;preview:string|null;contact?:Contact;draft?:{purpose:Purpose;content:string};action:(form:FormData)=>Promise<void>;facts?:string[];unlock?:ReactNode;refine?:Refine;aiName?:string}) {
  const [purpose,setPurpose]=useState<Purpose>(draft?.purpose??"confirm");
  const [content,setContent]=useState(draft?.content??messageTemplate("confirm",sender,city,preview));
  const [kind,setKind]=useState("draft");
  const [opened,setOpened]=useState(false);
  const [copy,setCopy]=useState("");
  const href=whatsappLink(contact,content);
  const options=Object.entries(purposes).filter(([key])=>key!=="preview"||preview) as [Purpose,string][];
  async function copyMessage() {
    try { await navigator.clipboard.writeText(content); setCopy("Mensagem copiada."); }
    catch { setCopy("A cópia automática está indisponível. Selecione a mensagem para copiar."); }
  }
  return <form action={action} className="composer">
    <input type="hidden" name="purpose" value={purpose}/>
    <section className="composer-step"><h3><span className="step-n">1</span>O que você quer agora?</h3>
      <div className="chips" role="radiogroup" aria-label="Objetivo da mensagem">{options.map(([key,label])=><button key={key} type="button" role="radio" aria-checked={purpose===key} className={"chip"+(purpose===key?" on":"")}
        onClick={()=>{setPurpose(key);setContent(messageTemplate(key,sender,city,preview));}}>{label}</button>)}</div></section>
    <section className="composer-step"><h3><span className="step-n">2</span>Ajuste a mensagem</h3>
      <Field label="Mensagem" hint="Revise o texto e só afirme o que estiver confirmado."><textarea name="content" required maxLength={3000} rows={8} value={content} onChange={event=>setContent(event.target.value)}/></Field>
      {facts.length>0&&<div className="chips"><span className="meta">Inserir fato:</span>{facts.map(f=><button key={f} type="button" className="btn small" onClick={()=>setContent(c=>c.trimEnd()+" "+f)}>+ {f}</button>)}<span className="meta grow-right">{content.length} caracteres</span></div>}
      {refine&&<AiRefine refine={refine} name={aiName} content={content} purpose={purposes[purpose]} onText={setContent}/>}
    </section>
    <section className="composer-step"><h3><span className="step-n">3</span>Envie e registre</h3>
      {unlock}
      <div className="actions">{href?<a className="btn primary" href={href} target="_blank" rel="noopener noreferrer" onClick={()=>setOpened(true)}><ExternalLink size={16} aria-hidden="true"/>Abrir no WhatsApp</a>:<span className="meta">Confirme um WhatsApp para abrir a conversa daqui.</span>}
        <button type="button" className="btn" onClick={copyMessage} disabled={!content.trim()}><Copy size={16} aria-hidden="true"/>Copiar mensagem</button></div>
      {copy&&<p role="status">{copy}</p>}{opened&&<Notice>Mandou a mensagem? Escolha “Envio confirmado” abaixo e registre.</Notice>}
      <div className="fields">
        <Field label="O que registrar"><Select name="kind" options={{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}} value={kind} onChange={event=>setKind(event.target.value)}/></Field>
        <Field label="Canal"><Select name="channel" options={contact?["WhatsApp","E-mail","Ligação","Outro"]:["E-mail","Ligação","Outro"]}/></Field>
      </div>{kind==="sent"&&<label className="check"><input type="checkbox" name="confirmed" required/>Confirmo que enviei esta mensagem manualmente.</label>}
      <Submit>{kind==="draft"?"Salvar rascunho":"Registrar interação"}</Submit>
    </section></form>;
}
