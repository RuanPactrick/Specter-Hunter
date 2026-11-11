"use client";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Field, Notice, Select } from "./ui";
import { Submit } from "./submit";
import { messageTemplate, outreachChannel, outreachHref, purposes, type Contact, type Purpose } from "@/lib/domain";
export function MessageEditor({ sender,city,company,preview,channels,draft,action }:{sender:string;city:string;company:string;preview:string|null;channels:Contact[];draft?:{purpose:Purpose;content:string};action:(form:FormData)=>Promise<void>}) {
  const [purpose,setPurpose]=useState<Purpose>(draft?.purpose??"confirm");
  const [content,setContent]=useState(draft?.content??messageTemplate("confirm",sender,city,preview));
  const [kind,setKind]=useState("draft");
  const [contactId,setContactId]=useState(channels[0]?.id??"");
  const [actionOpened,setActionOpened]=useState(false);
  const [copy,setCopy]=useState("");
  const contact=channels.find(channel=>channel.id===contactId)??channels[0];
  const channel=outreachChannel(contact);
  const href=outreachHref(contact,content,company);
  const channelOptions=Object.fromEntries(channels.map(item=>[item.id,outreachChannel(item)+" · "+item.value]));
  const actionLabel=contact?.kind==="whatsapp"?"Abrir WhatsApp":contact?.kind==="email"?"Escrever e-mail":"Ligar";
  async function copyMessage() {
    try { await navigator.clipboard.writeText(content); setCopy("Mensagem copiada."); }
    catch { setCopy("A cópia automática está indisponível. Selecione a mensagem para copiar."); }
  }
  return <form action={action} className="pad stack"><Field label="Finalidade"><Select name="purpose" options={Object.fromEntries(Object.entries(purposes).filter(([key])=>key!=="preview"||preview))} value={purpose} onChange={event=>{const value=event.target.value as Purpose;setPurpose(value);setContent(messageTemplate(value,sender,city,preview));}}/></Field>
  <Field label="Mensagem" hint="Revise o texto e confirme as informações antes de usar."><textarea name="content" required maxLength={3000} value={content} onChange={event=>setContent(event.target.value)}/></Field>
  {channels.length>0&&<Field label="Canal para contato" hint="Somente canais confirmados. Outros estão na aba Contatos."><Select value={contact?.id??""} options={channelOptions} onChange={event=>{setContactId(event.target.value);setActionOpened(false);}}/></Field>}
  <div className="actions"><button type="button" className="btn" onClick={copyMessage} disabled={!content.trim()}><Copy size={16} aria-hidden="true"/>Copiar mensagem</button>
  {href&&contact?<a className="btn" href={href} {...(contact.kind==="whatsapp"?{target:"_blank",rel:"noopener noreferrer"}:{})} onClick={()=>setActionOpened(true)}><ExternalLink size={16} aria-hidden="true"/>{actionLabel}</a>:<span className="meta">Nenhum canal confirmado para abrir uma conversa.</span>}</div>
  <input type="hidden" name="channel" value={channel}/>
  {copy&&<p role="status">{copy}</p>}{actionOpened&&<Notice>{contact?.kind==="phone"?"Depois da ligação, registre o resultado manualmente.":"Depois de enviar, registre manualmente se a mensagem foi enviada."}</Notice>}
  <div className="fields">
  <Field label="O que registrar"><Select name="kind" options={{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}} value={kind} onChange={event=>setKind(event.target.value)}/></Field>
  </div>{kind==="sent"&&<label className="check"><input type="checkbox" name="confirmed" required/>Confirmo que enviei esta mensagem manualmente.</label>}
  <Submit>{kind==="draft"?"Salvar rascunho":"Registrar interação"}</Submit></form>;
}
