import Link from "next/link";
import { ButtonLink, Empty, Field, Notice, Pairs, Panel, SafeLink, Select, Tag } from "./ui";
import { Submit } from "./submit";
import { MessageEditor } from "./message-editor";
import { CopyText } from "./copy-text";
import { confirmed, evidenceOptions } from "./lead-evidence";
import { deleteLead } from "@/lib/privacy-actions";
import { aiConfig,assistiveModes,minimizeEvidence } from "@/lib/assistive";
import { generateAssistance } from "@/lib/assistive-action";
import { AssistiveEditor } from "./assistive-editor";
import { context } from "@/lib/auth";
import { leadPath, loadContacts, loadEvidence, loadPreview } from "@/lib/data";
import { checklist, contacts, formatDate, offerKinds, previewStates, purposes, today, type Lead, type Purpose } from "@/lib/domain";
import { addContact, confirmContact, linkDuplicates, outreach, saveOffer, savePreview } from "@/lib/lead-actions";

export async function ContactsTab({lead}:{lead:Lead}) {
  const rows=await loadContacts(lead.id);
  return <div className="grid-two"><Panel title="Canais comerciais" description="Cada canal tem fonte, data e confirmação próprias.">
  {rows.length?rows.map(c=><div className="row" key={c.id}><div><h3>{contacts[c.kind]} · {c.kind==="website"||c.kind==="maps"?<SafeLink url={c.value}/>:c.value}</h3><p className="meta">{c.source_label} · {formatDate(c.consulted_on)}</p></div><div className="actions"><Tag tone={c.confirmed?"success":"warning"}>{c.confirmed?"Confirmado":"Pendente"}</Tag><form action={confirmContact.bind(null,lead.id,c.id,!c.confirmed)}><Submit style="small">{c.confirmed?"Marcar pendente":"Confirmar canal"}</Submit></form></div></div>):<Empty title="Nenhum canal cadastrado" description="Adicione um canal comercial com a fonte de origem."/>}
  </Panel><Panel title="Adicionar canal"><form className="pad stack" action={addContact.bind(null,lead.id)}>
  <Field label="Tipo"><Select name="kind" options={contacts}/></Field>
  <Field label="Valor"><input name="value" maxLength={2048} required/></Field>
  <Field label="Fonte"><input name="source_label" maxLength={200} required/></Field>
  <Field label="Data da consulta"><input type="date" name="consulted_on" defaultValue={today()} required/></Field>
  <label className="check"><input type="checkbox" name="confirmed"/>Confirmei o canal com uma fonte confiável.</label><Submit>Adicionar canal</Submit></form></Panel></div>;
}

export async function ApproachTab({lead}:{lead:Lead}) {
  const {db,org}=await context();
  const [channels,preview,evidence,events,offers]=await Promise.all([
    loadContacts(lead.id),loadPreview(lead.id),loadEvidence(lead.id),
    db.from("outreach_events").select("id,kind,purpose,channel,content,created_at").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(30),
    db.from("offers").select("id,kind,problem,solution,benefit,scope,questions,objections,evidence_id").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(10)
  ]);
  if(events.error||offers.error) throw new Error("Falha ao ler abordagem");
  const verified=evidence.filter(confirmed);
  const draft=events.data?.find(e=>e.kind==="draft");
  const activeDraft=draft && typeof draft.purpose==="string" && Object.hasOwn(purposes,draft.purpose) ? {purpose:draft.purpose as Purpose,content:String(draft.content)}:undefined;
  const previewUrl=preview&&["ready","sent","review","approved"].includes(preview.status)?preview.url:null;
  return <div className="grid-two"><div className="stack">
  {lead.stage==="blocked"?<Notice tone="warning">Lead na lista de não contato. As ações e sugestões ficam bloqueadas até revisão pelo proprietário.</Notice>:<Panel title="Prepare o primeiro contato" description="Modelos em português para editar e revisar."><MessageEditor sender={org.message_name} city={lead.city} preview={previewUrl} contact={channels.find(c=>c.kind==="whatsapp"&&c.confirmed)} draft={activeDraft} action={outreach.bind(null,lead.id)}/></Panel>}
  <Panel title="Interações registradas">{events.data?.length?events.data.map(e=><div className="row" key={e.id}><div className="min-w-0 wrap-break-word"><strong>{{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}[String(e.kind)]??"Registro"}</strong><p>{e.content}</p><p className="meta">{e.channel} · {formatDate(e.created_at)}</p></div></div>):<Empty title="Sem interações" description="Os registros aparecem aqui após salvar um rascunho ou confirmar uma interação."/>}</Panel></div>
  <div className="stack"><Panel title="Contexto disponível"><div className="pad stack">
  {verified.length?<ul className="list-disc pl-5">{verified.slice(0,5).map(e=><li key={e.id}>{e.observed} <span className="meta">· {e.source_label}</span></li>)}</ul>:<p className="muted">Confirme evidências antes de usar informações comerciais na abordagem.</p>}
  <ButtonLink href={leadPath(lead.id,"evidencias")}>Revisar evidências</ButtonLink></div></Panel>
  {aiConfig()&&lead.stage!=="blocked"&&verified.length>0&&<Panel title="IA assistiva" description="Opcional. Selecione as observações que podem ser compartilhadas com o provedor."><AssistiveEditor action={generateAssistance.bind(null,lead.id)} options={assistiveModes} evidence={verified.slice(0,12).map(e=>({id:e.id,observed:minimizeEvidence(e.observed)}))}/></Panel>}
  <Panel title="Oferta recomendada">{offers.data?.map(row=><div className="row !block" key={row.id}><details className="disclosure"><summary>{row.kind}</summary><div className="inner">
  <Pairs items={[["Problema",row.problem],["Evidência",verified.find(e=>e.id===row.evidence_id)?.source_label??"Revisão necessária"],["Solução",row.solution],["Benefício esperado",row.benefit],["Escopo",row.scope],["Perguntas",row.questions],["Objeções",row.objections]]}/>
  </div></details></div>)}
  <div className="pad stack">{lead.stage==="blocked"?<p className="muted">Elaboração indisponível para este lead.</p>:verified.length?<details className="disclosure"><summary>Elaborar oferta</summary><form action={saveOffer.bind(null,lead.id)} className="inner stack">
  <Field label="Tipo de projeto"><Select name="kind" options={offerKinds}/></Field>
  <Field label="Evidência confirmada"><Select name="evidence_id" options={evidenceOptions(verified)}/></Field>
  {([["problem","Problema observado"],["solution","Solução"],["benefit","Benefício esperado"],["scope","Escopo mínimo"],["questions","Perguntas de qualificação"],["objections","Possíveis objeções"]] as const).map(([name,label])=><Field key={name} label={label}><textarea name={name} required maxLength={name==="benefit"?1000:1200}/></Field>)}
  <Submit>Salvar oferta</Submit></form></details>:<p className="muted">Adicione uma evidência confirmada para embasar a oferta.</p>}</div>
  </Panel></div></div>;
}

export async function PreviewTab({lead}:{lead:Lead}) {
  const [preview,evidence]=await Promise.all([loadPreview(lead.id),loadEvidence(lead.id)]);
  const facts=evidence.filter(confirmed);
  const brief=[
    "Briefing de prévia · Specter Hunter","Empresa: "+lead.name,"Segmento informado: "+lead.sector,"Região: "+lead.city+", "+lead.region,"",
    "Fatos com revisão:",...facts.map(e=>"- "+e.observed+" [evidência "+e.id+" · "+e.source_label+"]"),
    "","Pendências:",...(evidence.filter(e=>!confirmed(e)).map(e=>"- Revisar "+e.kind+" · "+e.source_label)),
    "- Confirme conteúdo, canais e autorizações de uso antes de publicar.","- Use apenas materiais autorizados para a finalidade registrada.",
    "- Identifique a prévia e mantenha a indexação desativada durante a revisão."
  ].join("\n");
  return <div className="grid-two"><Panel title="Prévia do projeto" description={preview?"Registro do material que será apresentado à empresa.":"Registre o endereço da prévia e acompanhe a revisão."} action={preview?<Tag tone="info">{previewStates[preview.status]}</Tag>:null}>
  {preview&&<div className="row"><div><span className="meta">Criada em {formatDate(preview.created_at)}</span><br/><SafeLink url={preview.url}/></div><SafeLink url={preview.url}>Abrir prévia</SafeLink></div>}
  <form action={savePreview.bind(null,lead.id)} className="pad stack"><div className="fields">
    <Field label="URL da prévia"><input name="url" inputMode="url" required maxLength={2048} defaultValue={preview?.url}/></Field>
    <Field label="Repositório (opcional)"><input name="repository" inputMode="url" maxLength={2048} defaultValue={preview?.repository??""}/></Field>
    <Field label="Status"><Select name="status" options={previewStates} defaultValue={preview?.status??"building"}/></Field>
    <Field label="Data de envio registrado"><input type="date" name="sent_on" defaultValue={preview?.sent_on??""}/></Field>
    <Field label="Feedback" full><textarea name="feedback" maxLength={1600} defaultValue={preview?.feedback}/></Field>
    <Field label="Observações" full><textarea name="note" maxLength={1600} defaultValue={preview?.note}/></Field>
  </div><fieldset><legend className="font-bold mb-1">Checklist preenchido manualmente</legend>{checklist.map((item,i)=><label className="check" key={item}><input type="checkbox" name={"check_"+i} defaultChecked={preview?.checklist.includes(item)}/>{item}</label>)}</fieldset><Submit>Registrar prévia</Submit></form></Panel>
  <Panel title="Briefing para a prévia" description="Modelo para copiar em Claude, Antigravity ou outro editor."><div className="pad stack">
  <ButtonLink href={leadPath(lead.id,"materiais")}>Gerenciar captura e materiais autorizados</ButtonLink><Field label="Briefing com evidências e pendências"><textarea readOnly rows={13} value={brief}/></Field><CopyText value={brief} label="Copiar briefing"/>
  </div></Panel></div>;
}

export async function HistoryTab({lead,owner}:{lead:Lead;owner:boolean}) {
  const {db,org}=await context();
  const {data,error}=await db.from("audit_events").select("id,event,detail,created_at").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(80);
  if(error) throw new Error("Falha ao carregar histórico");
  const labels:Record<string,string>={"lead.created":"Empresa cadastrada","lead.stage":"Etapa atualizada","outreach.draft":"Rascunho salvo","outreach.sent":"Envio confirmado manualmente","outreach.reply":"Resposta registrada","outreach.call":"Ligação registrada","website.assessed":"Presença digital avaliada","lead.duplicate_linked":"Duplicidade vinculada","lead_contacts.insert":"Canal cadastrado","lead_contacts.update":"Canal revisado","evidence_items.insert":"Evidência adicionada","evidence_items.update":"Evidência revisada","tasks.insert":"Tarefa criada","tasks.update":"Tarefa atualizada","previews.insert":"Prévia registrada","previews.update":"Prévia atualizada","brand_assets.insert":"Material registrado","brand_assets.update":"Autorização de material revisada","offers.insert":"Oferta registrada"};
  return <div className="grid-two"><Panel title="Histórico do lead">{data?.length?data.map(row=><div className="row" key={row.id}><div><strong>{labels[row.event]??"Registro de atividade"}</strong>{typeof row.detail?.reason==="string"&&row.detail.reason&&<p>{row.detail.reason}</p>}
  {typeof row.detail?.related_id==="string"&&<Link href={leadPath(row.detail.related_id)}>Ver lead relacionado</Link>}</div><time className="mono" dateTime={row.created_at}>{formatDate(row.created_at)}</time></div>):<Empty title="Sem eventos registrados" description="As mudanças de etapa e os registros de abordagem aparecem aqui."/>}</Panel>
  {owner&&<Panel title="Revisar possível duplicação" description="Vincule dois registros relacionados sem perder os anexos, as fontes ou a trilha de auditoria."><form className="pad stack" action={linkDuplicates.bind(null,lead.id)}>
  <Field label="ID do outro lead" hint="Use o identificador da URL de detalhes."><input name="related" required maxLength={36}/></Field>
  <Field label="Justificativa da revisão"><input name="reason" required maxLength={500}/></Field><Submit>Vincular registros</Submit></form></Panel>}
  {owner&&<Panel title="Excluir cadastro" description="A confirmação remove os dados do lead e seus registros associados. As restrições de não contato são preservadas."><form action={deleteLead.bind(null,lead.id)} className="pad stack">
  <Field label="Digite o nome exato da empresa"><input name="confirmation" required maxLength={160}/></Field>
  <label className="check"><input type="checkbox" name="acknowledge" required/>Confirmo a exclusão permanente deste lead.</label><Submit style="danger">Excluir cadastro</Submit>
  </form></Panel>}</div>;
}
