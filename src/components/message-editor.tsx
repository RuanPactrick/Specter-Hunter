"use client";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Field, Notice, Select } from "./ui";
import { Submit } from "./submit";
import { messageTemplate, purposes, whatsappLink, type Contact, type Purpose } from "@/lib/domain";
export function MessageEditor({ sender,city,preview,contact,draft,action }:{sender:string;city:string;preview:string|null;contact?:Contact;draft?:{purpose:Purpose;content:string};action:(form:FormData)=>Promise<void>}) {
  const [purpose,setPurpose]=useState<Purpose>(draft?.purpose??"confirm");
  const [content,setContent]=useState(draft?.content??messageTemplate("confirm",sender,city,preview));
  const [kind,setKind]=useState("draft");
  const [opened,setOpened]=useState(false);
  const [copy,setCopy]=useState("");
  const href=whatsappLink(contact,content);
  async function copyMessage() {
    try { await navigator.clipboard.writeText(content); setCopy("Mensagem copiada."); }
    catch { setCopy("A cópia automática está indisponível. Selecione a mensagem para copiar."); }
  }
  return <form action={action} className="pad stack"><Field label="Finalidade"><Select name="purpose" options={Object.fromEntries(Object.entries(purposes).filter(([key])=>key!=="preview"||preview))} value={purpose} onChange={event=>{const value=event.target.value as Purpose;setPurpose(value);setContent(messageTemplate(value,sender,city,preview));}}/></Field>
  <Field label="Mensagem" hint="Revise o texto e confirme as informações antes de usar."><textarea name="content" required maxLength={3000} value={content} onChange={event=>setContent(event.target.value)}/></Field>
  <div className="actions"><button type="button" className="btn" onClick={copyMessage} disabled={!content.trim()}><Copy size={16} aria-hidden="true"/>Copiar</button>
  {href?<a className="btn" href={href} target="_blank" rel="noopener noreferrer" onClick={()=>setOpened(true)}><ExternalLink size={16} aria-hidden="true"/>Abrir WhatsApp</a>:<span className="meta">Confirme um canal de WhatsApp para abrir uma conversa.</span>}</div>
  {copy&&<p role="status">{copy}</p>}{opened&&<Notice>Você enviou a mensagem? Escolha “Envio confirmado” e registre manualmente se o envio ocorreu.</Notice>}
  <div className="fields">
  <Field label="O que registrar"><Select name="kind" options={{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}} value={kind} onChange={event=>setKind(event.target.value)}/></Field>
  <Field label="Canal"><Select name="channel" options={contact?["WhatsApp","E-mail","Ligação","Outro"]:["E-mail","Ligação","Outro"]}/></Field>
  </div>{kind==="sent"&&<label className="check"><input type="checkbox" name="confirmed" required/>Confirmo que enviei esta mensagem manualmente.</label>}
  <Submit>{kind==="draft"?"Salvar rascunho":"Registrar interação"}</Submit></form>;
}
