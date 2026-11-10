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
import { checklist, contactHref, contacts, decodeEntities, evidenceExpired, evidenceUsable, formatDate, offerKinds, previewStates, purposes, today, type Lead, type Purpose } from "@/lib/domain";
import { addContact, confirmContact, linkDuplicates, outreach, saveOffer, savePreview } from "@/lib/lead-actions";

const contactOrder=["whatsapp","phone","email","instagram","website","maps"] as const;
const actionLabel={whatsapp:"Abrir conversa",phone:"Ligar",email:"Escrever e-mail",instagram:"Abrir perfil",website:"Abrir site",maps:"Abrir no Maps"} as const;
const origin=(label:string)=>label==="Leitura automática do site"?"achado pelo robô (site e pesquisa)":label==="Google Maps via Apify"?"do Google Maps":label;
export async function ContactsTab({lead}:{lead:Lead}) {
  const rows=await loadContacts(lead.id);
  const blocked=lead.stage==="blocked";
  return <div className="stack">{blocked&&<Notice tone="warning">Empresa marcada como não contatar: os atalhos de contato ficam desligados.</Notice>}
  {rows.length?<div className="contact-groups">{contactOrder.map(kind=>{const list=rows.filter(c=>c.kind===kind);return list.length?<Panel key={kind} title={contacts[kind]+(list.length>1?" ("+list.length+")":"")}>
    {list.map(c=>{const href=blocked?null:contactHref(c.kind,c.normalized,c.value);return <div className="row contact-row" key={c.id}><div className="min-w-0">
      <strong className="contact-value">{kind==="maps"?"Ficha no Google Maps":c.value}</strong><p className="meta">{origin(c.source_label)} · {formatDate(c.consulted_on)}</p></div>
      <div className="actions">{href&&<a className="btn small primary" href={href} target="_blank" rel="noopener noreferrer">{actionLabel[kind]}</a>}
      <form action={confirmContact.bind(null,lead.id,c.id,!c.confirmed)}><button className={"btn small"+(c.confirmed?" ghost":"")} type="submit" title={c.confirmed?"Clique para voltar a pendente":"Marque quando tiver certeza de que o canal é da empresa"}>{c.confirmed?"✓ Confirmado":"Confirmar"}</button></form></div></div>;})}
  </Panel>:null;})}</div>:<Empty title="Nenhum canal ainda" description="Peça a leitura automática no Resumo ou adicione um canal abaixo."/>}
  <details className="disclosure panel"><summary>Adicionar canal manualmente</summary><form className="inner stack" action={addContact.bind(null,lead.id)}>
  <Field label="Tipo"><Select name="kind" options={contacts}/></Field>
  <Field label="Valor" hint="Telefone com DDD, e-mail, @ do Instagram ou endereço do site."><input name="value" maxLength={2048} required/></Field>
  <Field label="Onde você encontrou"><input name="source_label" maxLength={200} required placeholder="Ex.: cartão de visita, site, ligação"/></Field>
  <Field label="Data"><input type="date" name="consulted_on" defaultValue={today()} required/></Field>
  <label className="check"><input type="checkbox" name="confirmed"/>Já confirmei que este canal é da empresa.</label><Submit>Adicionar canal</Submit></form></details></div>;
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
  // o que o robô achou e ainda não foi conferido também ajuda a conversar, marcado como "a conferir"
  const facts=evidence.filter(e=>!evidenceExpired(e)&&e.provider!=="manual"&&e.kind!=="Cadastro"&&e.kind!=="Contatos no site"&&e.review!=="inconclusive"&&e.review!=="conflict");
  const whats=channels.find(c=>c.kind==="whatsapp"&&c.confirmed)??channels.find(c=>c.kind==="whatsapp");
  const draft=events.data?.find(e=>e.kind==="draft");
  const activeDraft=draft && typeof draft.purpose==="string" && Object.hasOwn(purposes,draft.purpose) ? {purpose:draft.purpose as Purpose,content:String(draft.content)}:undefined;
  const previewUrl=preview&&["ready","sent","review","approved"].includes(preview.status)?preview.url:null;
  return <div className="grid-two"><div className="stack">
  {lead.stage==="blocked"?<Notice tone="warning">Lead na lista de não contato. As ações e sugestões ficam bloqueadas até revisão pelo proprietário.</Notice>:<Panel title="Prepare o primeiro contato" description="Escolha o objetivo, ajuste o texto e envie pelo WhatsApp. Depois registre o que aconteceu.">
  {whats&&!whats.confirmed&&<div className="pad"><Notice tone="warning"><span>O robô achou o WhatsApp <strong>{whats.value}</strong>. Confirme que é da empresa para liberar o envio.</span>
    <form action={confirmContact.bind(null,lead.id,whats.id,true)} className="mt-2"><input type="hidden" name="back" value="abordagem"/><Submit style="small">Confirmar este WhatsApp</Submit></form></Notice></div>}
  {!whats&&<div className="pad"><Notice>Nenhum WhatsApp encontrado. Copie a mensagem e use telefone ou e-mail da aba Contatos.</Notice></div>}
  <MessageEditor sender={org.message_name} city={lead.city} preview={previewUrl} contact={whats?.confirmed?whats:undefined} draft={activeDraft} action={outreach.bind(null,lead.id)}/></Panel>}
  <Panel title="Interações registradas">{events.data?.length?events.data.map(e=><div className="row" key={e.id}><div className="min-w-0 wrap-break-word"><strong>{{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}[String(e.kind)]??"Registro"}</strong><p>{e.content}</p><p className="meta">{e.channel} · {formatDate(e.created_at)}</p></div></div>):<Empty title="Sem interações" description="Os registros aparecem aqui após salvar um rascunho ou confirmar uma interação."/>}</Panel></div>
  <div className="stack"><Panel title="O que usar na conversa" description="Fatos sobre a empresa para personalizar a mensagem. Só afirme o que estiver confirmado."><div className="pad stack">
  {facts.length?<ul className="fact-list">{facts.slice(0,8).map(e=><li key={e.id}><strong>{e.kind}</strong> {confirmed(e)?<Tag tone="success">Confirmado</Tag>:<Tag tone="warning">A conferir</Tag>}<p>{decodeEntities(e.observed)}</p><p className="meta">{e.source_label} · consultado em {formatDate(e.consulted_on)}</p></li>)}</ul>:<p className="muted">Peça a leitura automática no Resumo para trazer fatos atuais sobre a empresa.</p>}
  <ButtonLink href={leadPath(lead.id)}>Conferir no Resumo</ButtonLink></div></Panel>
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
  const facts=evidence.filter(evidenceUsable);
  const pending=evidence.filter(e=>!evidenceExpired(e)&&e.review==="pending"&&e.kind!=="Cadastro");
  const brief=[
    "Briefing de prévia · Specter Hunter","Empresa: "+lead.name,"Segmento informado: "+lead.sector,"Região: "+lead.city+", "+lead.region,"",
    "Endereço: "+(lead.address||"não informado"),"Site atual: "+(lead.domain||"não tem"),"",
    "Fatos confirmados e vigentes:",...(facts.length?facts.map(e=>"- "+e.kind+": "+decodeEntities(e.observed)+" ["+e.source_label+" · consultado em "+formatDate(e.consulted_on)+"]"):["- nenhum ainda"]),
    "Achados vencidos foram omitidos; confira a aba Fontes e conferência antes de usar informações antigas.",
    "","Achados do robô ainda a conferir (não afirmar sem checar):",...pending.map(e=>"- "+e.kind+": "+decodeEntities(e.observed)+" ["+e.source_label+" · consultado em "+formatDate(e.consulted_on)+"]"),
    "- Confirme conteúdo, canais e autorizações de uso antes de publicar.","- Use apenas materiais autorizados para a finalidade registrada.",
    "- Identifique a prévia e mantenha a indexação desativada durante a revisão."
  ].join("\n");
  return <div className="grid-two"><Panel title="Prévia do site" description={preview?"O site de demonstração desta empresa.":"Depois de montar a prévia, cole o link aqui para acompanhar."} action={preview?<Tag tone="info">{previewStates[preview.status]}</Tag>:null}>
  {preview&&<div className="row"><div><span className="meta">Criada em {formatDate(preview.created_at)}</span><br/><SafeLink url={preview.url}/></div><SafeLink url={preview.url}>Abrir prévia</SafeLink></div>}
  <form action={savePreview.bind(null,lead.id)} className="pad stack"><div className="fields">
    <Field label="URL da prévia"><input name="url" inputMode="url" required maxLength={2048} defaultValue={preview?.url}/></Field>
    <Field label="Repositório (opcional)"><input name="repository" inputMode="url" maxLength={2048} defaultValue={preview?.repository??""}/></Field>
    <Field label="Status"><Select name="status" options={previewStates} defaultValue={preview?.status??"building"}/></Field>
    <Field label="Data de envio registrado"><input type="date" name="sent_on" defaultValue={preview?.sent_on??""}/></Field>
    <Field label="Feedback" full><textarea name="feedback" maxLength={1600} defaultValue={preview?.feedback}/></Field>
    <Field label="Observações" full><textarea name="note" maxLength={1600} defaultValue={preview?.note}/></Field>
  </div><fieldset><legend className="font-bold mb-1">Checklist preenchido manualmente</legend>{checklist.map((item,i)=><label className="check" key={item}><input type="checkbox" name={"check_"+i} defaultChecked={preview?.checklist.includes(item)}/>{item}</label>)}</fieldset><Submit>Registrar prévia</Submit></form></Panel>
  <Panel title="Pedido para montar a prévia" description="Texto pronto com os dados da empresa. Copie e cole no Claude ou em outro criador de sites."><div className="pad stack">
  <Field label="Briefing com evidências e pendências"><textarea readOnly rows={13} value={brief}/></Field><CopyText value={brief} label="Copiar briefing"/>
  </div></Panel></div>;
}

export async function HistoryTab({lead,owner}:{lead:Lead;owner:boolean}) {
  const {db,org}=await context();
  const {data,error}=await db.from("audit_events").select("id,event,detail,created_at").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(80);
  if(error) throw new Error("Falha ao carregar histórico");
  const labels:Record<string,string>={"lead.created":"Empresa cadastrada","lead.stage":"Etapa atualizada","outreach.draft":"Rascunho salvo","outreach.sent":"Envio confirmado manualmente","outreach.reply":"Resposta registrada","outreach.call":"Ligação registrada","website.assessed":"Presença digital avaliada","lead.duplicate_linked":"Duplicidade vinculada","lead_contacts.insert":"Canal cadastrado","lead_contacts.update":"Canal revisado","evidence_items.insert":"Evidência adicionada","evidence_items.update":"Evidência revisada","tasks.insert":"Tarefa criada","tasks.update":"Tarefa atualizada","previews.insert":"Prévia registrada","previews.update":"Prévia atualizada","brand_assets.insert":"Material registrado","brand_assets.update":"Autorização de material revisada","offers.insert":"Oferta registrada"};
  // o robô grava várias linhas no mesmo minuto: vira um acontecimento só ("Robô leu o site · 6 informações, 8 contatos")
  const groups=new Map<string,NonNullable<typeof data>>();
  for(const row of data??[]){const key=row.created_at.slice(0,16);groups.set(key,[...(groups.get(key)??[]),row]);}
  const moments=[...groups.values()].flatMap(rows=>{
    const count=(event:string)=>rows.filter(r=>r.event===event).length;
    const plural=(n:number,one:string,many:string)=>n?n+" "+(n===1?one:many):"";
    const extra=[plural(count("evidence_items.insert"),"informação","informações"),plural(count("lead_contacts.insert"),"contato","contatos")].filter(Boolean).join(" e ");
    const main=rows.find(r=>r.event==="lead.enriched")??rows.find(r=>r.event==="lead.created");
    if(main)return [{id:main.id,at:main.created_at,title:main.event==="lead.enriched"?"Robô leu o site e pesquisou a empresa":main.detail?.source==="maps"?"Empresa cadastrada pela pesquisa no Google Maps":"Empresa cadastrada",
      note:extra?"Registrou "+extra+".":"",related:null as string|null}];
    return rows.map(r=>({id:r.id,at:r.created_at,title:labels[r.event]??"Registro de atividade",note:typeof r.detail?.reason==="string"?r.detail.reason:"",related:typeof r.detail?.related_id==="string"?r.detail.related_id:null}));
  });
  const when=(iso:string)=>new Date(iso).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
  return <div className="grid-two"><Panel title="Histórico" description="Tudo o que aconteceu com esta empresa, do mais recente para o mais antigo.">{moments.length?<ol className="timeline">{moments.map(m=><li key={m.id}><strong>{m.title}</strong>{m.note&&<p>{m.note}</p>}
  {m.related&&<Link href={leadPath(m.related)}>Ver lead relacionado</Link>}<time className="meta" dateTime={m.at}>{when(m.at)}</time></li>)}</ol>:<Empty title="Nada registrado ainda" description="Cadastro, leituras do robô, mudanças de etapa e mensagens aparecem aqui."/>}</Panel>
  {owner&&<Panel title="Revisar possível duplicação" description="Vincule dois registros relacionados sem perder os anexos, as fontes ou a trilha de auditoria."><form className="pad stack" action={linkDuplicates.bind(null,lead.id)}>
  <Field label="ID do outro lead" hint="Use o identificador da URL de detalhes."><input name="related" required maxLength={36}/></Field>
  <Field label="Justificativa da revisão"><input name="reason" required maxLength={500}/></Field><Submit>Vincular registros</Submit></form></Panel>}
  {owner&&<Panel title="Excluir cadastro" description="A confirmação remove os dados do lead e seus registros associados. As restrições de não contato são preservadas."><form action={deleteLead.bind(null,lead.id)} className="pad stack">
  <Field label="Digite o nome exato da empresa"><input name="confirmation" required maxLength={160}/></Field>
  <label className="check"><input type="checkbox" name="acknowledge" required/>Confirmo a exclusão permanente deste lead.</label><Submit style="danger">Excluir cadastro</Submit>
  </form></Panel>}</div>;
}
