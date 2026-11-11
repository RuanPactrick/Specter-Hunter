"use client";
import { useState, type ReactNode } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { AiRefine, type Refine } from "./ai-refine";
import { Field, Notice, Select } from "./ui";
import { Submit } from "./submit";
import { messageTemplate, purposes, whatsappLink, type Contact, type Purpose } from "@/lib/domain";
/** Abordagem em 3 passos: objetivo, mensagem (com fatos para inserir) e envio + registro. */
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
      {refine&&<AiRefine refine={refine} name={aiName} content={content} purpose={purposes[purpose]} onText={setContent} objection
        quick={["Usar o melhor achado","Melhorar a mensagem","Mais curta","Mais próxima e informal","Mais formal","Começar com um elogio"]} placeholder="Ex.: cite as 173 avaliações; a empresa respondeu: já temos site" noun="mensagem"/>}
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
