import Link from "next/link";
import { ButtonLink, Empty, Field, Notice, Pairs, Panel, SafeLink, Select, Tag } from "./ui";
import { Submit } from "./submit";
import { MessageEditor } from "./message-editor";
import { confirmed, evidenceOptions } from "./lead-evidence";
import { deleteLead } from "@/lib/privacy-actions";
import { context } from "@/lib/auth";
import { leadPath, loadContacts, loadEvidence, loadPreview } from "@/lib/data";
import { checklist, contactHref, contacts, decodeEntities, evidenceExpired, evidenceUsable, formatDate, offerKinds, previewStates, purposes, today, type Lead, type Purpose } from "@/lib/domain";
import { salesAngle } from "@/lib/insights";
import { aiConfig } from "@/lib/assistive";
import { refineMessage, refinePrompt } from "@/lib/assistive-action";
import { PromptEditor } from "./prompt-editor";
import { addContact, confirmContact, linkDuplicates, outreach, saveOffer, savePreview } from "@/lib/lead-actions";

const contactOrder=["whatsapp","phone","email","instagram","website","maps"] as const;
const actionLabel={whatsapp:"Abrir conversa",phone:"Ligar",email:"Escrever e-mail",instagram:"Abrir perfil",website:"Abrir site",maps:"Abrir no Maps"} as const;
const origin=(label:string)=>label==="Leitura automática do site"?"achado pelo robô (site e pesquisa)":label==="Google Maps via Apify"?"do Google Maps":label;
export async function ContactsTab({lead,filter}:{lead:Lead;filter:string}) {
  const all=await loadContacts(lead.id);
  const blocked=lead.stage==="blocked";
  const rows=filter==="pendentes"?all.filter(c=>!c.confirmed):filter==="confirmados"?all.filter(c=>c.confirmed):all;
  const best=all.find(c=>c.kind==="whatsapp"&&c.confirmed)??all.find(c=>c.kind==="whatsapp")??all.find(c=>c.kind==="phone");
  const phone=all.find(c=>c.kind==="phone"&&c!==best&&c.confirmed)??all.find(c=>c.kind==="phone"&&c!==best);
  const email=all.find(c=>c.kind==="email");
  const highlight=[best&&{c:best,label:"Melhor canal",main:true},phone&&{c:phone,label:"Telefone"},email&&{c:email,label:"E-mail"}].filter(Boolean) as {c:typeof all[number];label:string;main?:boolean}[];
  const chip=(key:string,label:string,n:number)=><Link className={"btn small"+((filter||"")===key?" primary":"")} href={leadPath(lead.id,"contatos")+(key?"&f="+key:"")} aria-current={(filter||"")===key?"page":undefined}>{label} {n}</Link>;
  return <div className="contacts-columns"><div className="stack">{blocked&&<Notice tone="warning">Empresa marcada como não contatar: os atalhos de contato ficam desligados.</Notice>}
  {highlight.length>0&&<div className="contact-highlights">{highlight.map(({c,label,main})=>{const href=blocked?null:contactHref(c.kind,c.normalized,c.value);return <article key={c.id} className={"panel contact-card"+(main?" best":"")}>
    <div className="contact-card-head"><span className="eyebrow">{label}</span>{c.confirmed?<Tag tone="success">Confirmado</Tag>:<Tag tone="warning">A confirmar</Tag>}</div>
    <strong className="contact-card-value">{contacts[c.kind]}<br/>{c.value}</strong><span className="meta">{origin(c.source_label)} · {formatDate(c.consulted_on)}</span>
    <div className="actions">{href&&<a className={"btn small"+(main?" primary":"")} href={href} target="_blank" rel="noopener noreferrer">{actionLabel[c.kind]}</a>}
    {!c.confirmed&&<form action={confirmContact.bind(null,lead.id,c.id,true)}><button className="btn small" type="submit">É deles</button></form>}</div></article>;})}</div>}
  <section className="panel"><div className="list-head"><h2>Todos os canais</h2><div className="actions" role="group" aria-label="Filtrar canais">{chip("","Todos",all.length)}{chip("pendentes","A confirmar",all.filter(c=>!c.confirmed).length)}{chip("confirmados","Confirmados",all.filter(c=>c.confirmed).length)}</div></div>
  {rows.length?rows.sort((x,y)=>contactOrder.indexOf(x.kind)-contactOrder.indexOf(y.kind)).map(c=>{const href=blocked?null:contactHref(c.kind,c.normalized,c.value);return <div className="channel-row" key={c.id}>
    <span className="channel-kind">{contacts[c.kind]}</span>
    <strong className="channel-value">{c.kind==="maps"?"Ficha no Google Maps":c.value}</strong>
    <span className="channel-origin meta">{origin(c.source_label)} · {formatDate(c.consulted_on)}</span>
    <span className="channel-state">{c.confirmed?<Tag tone="success">Confirmado</Tag>:<Tag tone="warning">A confirmar</Tag>}</span>
    <span className="channel-actions">{href&&<a className={"btn small"+(c.kind==="whatsapp"?" primary":"")} href={href} target="_blank" rel="noopener noreferrer">{actionLabel[c.kind]}</a>}
      <form action={confirmContact.bind(null,lead.id,c.id,!c.confirmed)}><button className="btn small ghost" type="submit" title={c.confirmed?"Voltar para a confirmar":"Marque quando tiver certeza de que o canal é da empresa"}>{c.confirmed?"Desfazer":"Confirmar"}</button></form></span>
  </div>;}):<Empty title={all.length?"Nada neste filtro":"Nenhum canal ainda"} description={all.length?"Escolha outro filtro.":"Peça a leitura automática no topo ou adicione um canal ao lado."}/>}</section></div>
  <aside className="stack"><section className="panel side-card"><h2>Adicionar contato</h2><form className="stack" action={addContact.bind(null,lead.id)}>
  <Field label="Tipo"><Select name="kind" options={contacts}/></Field>
  <Field label="Contato" hint="Telefone com DDD, e-mail, @ do Instagram ou endereço do site."><input name="value" maxLength={2048} required/></Field>
  <Field label="Onde achou"><input name="source_label" maxLength={200} required placeholder="Ex.: cartão de visita, ligação"/></Field>
  <input type="hidden" name="consulted_on" value={today()}/>
  <label className="check"><input type="checkbox" name="confirmed"/>Já confirmei que é da empresa</label><Submit style="small">Adicionar</Submit></form></section></aside></div>;
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
  const ai=aiConfig();
  const draft=events.data?.find(e=>e.kind==="draft");
  const activeDraft=draft && typeof draft.purpose==="string" && Object.hasOwn(purposes,draft.purpose) ? {purpose:draft.purpose as Purpose,content:String(draft.content)}:undefined;
  const previewUrl=preview&&["ready","sent","review","approved"].includes(preview.status)?preview.url:null;
  return <div className="approach-workflow"><div className="approach-layout"><div className="stack approach-main">
  {lead.stage==="blocked"?<Notice tone="warning">Lead na lista de não contato. As ações e sugestões ficam bloqueadas até revisão pelo proprietário.</Notice>:<section className="panel pad">
  <MessageEditor sender={org.message_name} city={lead.city} preview={previewUrl} contact={whats?.confirmed?whats:undefined} draft={activeDraft} action={outreach.bind(null,lead.id)}
    facts={salesAngle(facts).hooks.map(h=>h.title.toLowerCase())}
    refine={ai?refineMessage.bind(null,lead.id):undefined} aiName={ai?.provider==="openai"?"OpenAI":"Gemini"}
    unlock={whats&&!whats.confirmed?<div className="unlock"><span><strong>WhatsApp {whats.value}</strong> veio do robô e ainda não foi confirmado.</span><button className="btn small" type="submit" formAction={confirmContact.bind(null,lead.id,whats.id,true,"abordagem")} formNoValidate>Confirmar e liberar</button></div>
      :!whats?<Notice>Nenhum WhatsApp encontrado. Copie a mensagem e use telefone ou e-mail da aba Contatos.</Notice>:null}/></section>}
  <Panel title="Conversa com a empresa">{events.data?.length?events.data.map(e=><div className="row" key={e.id}><div className="min-w-0 wrap-break-word"><strong>{{draft:"Rascunho",sent:"Envio confirmado",reply:"Resposta recebida",call:"Ligação realizada"}[String(e.kind)]??"Registro"}</strong><p>{e.content}</p><p className="meta">{e.channel} · {formatDate(e.created_at)}</p></div></div>):<Empty title="Sem interações" description="Os registros aparecem aqui após salvar um rascunho ou confirmar uma interação."/>}</Panel></div>
  <div className="stack approach-side"><Panel title="O que usar na conversa" description="Comece pelos fatos confirmados. Achados pendentes precisam ser conferidos."><div className="pad stack">
  {facts.length?<><ul className="fact-list">{facts.slice(0,4).map(e=><li key={e.id}><strong>{e.kind}</strong> {confirmed(e)?<Tag tone="success">Confirmado</Tag>:<Tag tone="warning">A conferir</Tag>}<p>{decodeEntities(e.observed)}</p><p className="meta">{e.source_label} · consultado em {formatDate(e.consulted_on)}</p></li>)}</ul>
  {facts.length>4&&<details className="disclosure"><summary>Ver mais {facts.length-4} achados</summary><div className="inner"><ul className="fact-list">{facts.slice(4).map(e=><li key={e.id}><strong>{e.kind}</strong> {confirmed(e)?<Tag tone="success">Confirmado</Tag>:<Tag tone="warning">A conferir</Tag>}<p>{decodeEntities(e.observed)}</p><p className="meta">{e.source_label} · consultado em {formatDate(e.consulted_on)}</p></li>)}</ul></div></details>}</>:<p className="muted">Peça a leitura automática no Resumo para trazer fatos atuais sobre a empresa.</p>}
  <ButtonLink href={leadPath(lead.id,"fontes")}>Revisar evidências</ButtonLink></div></Panel>
</div></div>
  <Panel title="Oferta recomendada" description="Organize uma proposta comercial com uma evidência confirmada." className="approach-offer">{offers.data?.map(row=><div className="row !block" key={row.id}><details className="disclosure"><summary>{row.kind}</summary><div className="inner">
  <Pairs items={[["Problema",row.problem],["Evidência",verified.find(e=>e.id===row.evidence_id)?.source_label??"Revisão necessária"],["Solução",row.solution],["Benefício esperado",row.benefit],["Escopo",row.scope],["Perguntas",row.questions],["Objeções",row.objections]]}/>
  </div></details></div>)}
  <div className="pad stack">{lead.stage==="blocked"?<p className="muted">Elaboração indisponível para este lead.</p>:verified.length?<details className="disclosure"><summary>Elaborar oferta</summary><form action={saveOffer.bind(null,lead.id)} className="inner stack">
  <Field label="Tipo de projeto"><Select name="kind" options={offerKinds}/></Field>
  <Field label="Evidência confirmada"><Select name="evidence_id" options={evidenceOptions(verified)}/></Field>
  {([["problem","Problema observado"],["solution","Solução"],["benefit","Benefício esperado"],["scope","Escopo mínimo"],["questions","Perguntas de qualificação"],["objections","Possíveis objeções"]] as const).map(([name,label])=><Field key={name} label={label}><textarea name={name} required maxLength={name==="benefit"?1000:1200}/></Field>)}
  <Submit>Salvar oferta</Submit></form></details>:<p className="muted">Adicione uma evidência confirmada para embasar a oferta.</p>}</div>
  </Panel></div>;
}

const avoid=["Degradê roxo e azul genérico no topo","Foto de banco de imagem com sorriso perfeito","Três cartões iguais com ícone e frase vaga","Depoimentos inventados e “Agende já” repetido"];
export async function PreviewTab({lead,materials}:{lead:Lead;materials:React.ReactNode}) {
  const [preview,evidence,channels]=await Promise.all([loadPreview(lead.id),loadEvidence(lead.id),loadContacts(lead.id)]);
  const live=evidence.filter(e=>!evidenceExpired(e)&&e.review!=="inconclusive"&&e.review!=="conflict");
  const find=(k:string)=>live.find(e=>e.kind===k);
  const ident=find("Identidade visual"),maps=find("Google Maps"),ig=find("Perfil do Instagram"),logo=find("Logo");
  const blockedSite=/não permite leitura/.test(find("Leitura do site")?.observed??"");
  const noBrand=blockedSite?"O site bloqueia leitura automática. Peça à empresa ou pegue do Instagram.":null;
  const colors=ident?.observed.match(/#[0-9A-F]{6}/gi)??[];
  const fonts=ident?.observed.match(/Fontes: ([^.]+)\./)?.[1].split(/,\s*/)??[];
  const rating=maps?.observed.match(/nota ([\d,]+) com (\d+) avalia/);
  const whats=channels.find(c=>c.kind==="whatsapp");
  const roles=["principal","apoio","destaque","fundo"];
  const differentials=[rating&&"Abrir com a nota "+rating[1]+" ("+rating[2]+" avaliações) e trechos reais das avaliações",(lead.address||maps)&&"Mostrar o endereço com mapa e “como chegar”",whats&&"Botão de WhatsApp direto no topo e no rodapé",ig&&"Usar fotos reais do Instagram, sem banco de imagens"].filter(Boolean) as string[];
  const facts=evidence.filter(evidenceUsable);
  const prompt=[
    "Crie o site de "+lead.sector.toLowerCase()+": "+lead.name+", "+[lead.district,lead.city+" – "+lead.region].filter(Boolean).join(", ")+".",
    colors.length||fonts.length?"Identidade: "+[colors.length&&"cores "+colors.map((c,i)=>c+" ("+(roles[i]??"apoio")+")").join(", "),fonts.length&&"fontes "+fonts.join(" e ")].filter(Boolean).join("; ")+". Use o logo enviado.":"Identidade: [cores e fontes da marca a confirmar]. Use o logo enviado.",
    rating?"Abra com a nota "+rating[1]+" ("+rating[2]+" avaliações).":"",
    "Seções: início, serviços, sobre a equipe, avaliações, como chegar e contato"+(whats?" com WhatsApp "+whats.value:"")+".",
    facts.length?"Fatos confirmados para usar: "+facts.slice(0,6).map(e=>e.kind+": "+decodeEntities(e.observed)).join(" | "):"",
    "Diferenciais: "+(differentials.join("; ")||"[a definir]")+".",
    "Evite: "+avoid.join("; ").toLowerCase()+".",
    "Identifique como prévia de demonstração, sem indexação, usando só materiais autorizados."
  ].filter(Boolean).join("\n");
  const sent=preview&&["sent","review","approved"].includes(preview.status);
  const ai=aiConfig();
  return <div className="preview-flow">
  <section className="panel pad stack"><div className="list-head"><h2>Como montar a prévia</h2><span className="meta">Coletar a identidade, estudar o nicho, gerar um prompt completo e só então montar o site.</span></div>
    <ol className="flow-steps"><li className={ident?"done":"now"}><i/>1 · Identidade da empresa</li><li className={ident&&!preview?"now":preview?"done":""}><i/>2 · Referências do nicho</li><li className={preview?"done":""}><i/>3 · Prompt do site</li><li className={sent?"done":preview?"now":""}><i/>4 · Montar a prévia</li><li className={sent?"now":""}><i/>5 · Enviar e acompanhar</li></ol></section>
  <section className="panel pad stack"><div className="list-head"><span className="step-n">1</span><div className="grow"><h2>Identidade da empresa</h2><p className="meta">Coletado do site e do Google Maps. Ajuste o que estiver errado antes de gerar o prompt.</p></div></div>
    <div className="identity-grid">
      <article className="blk"><div className="blk-h"><strong>Logo</strong><span className="meta">{logo?(/instagram/i.test(logo.observed)?"Instagram":"site"):"site e Instagram"}</span></div>{logo?.url?<div className="logo-row">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem externa (site ou Instagram), sem otimização do Next */}
        <img src={logo.url} alt={"Logo de "+lead.name} referrerPolicy="no-referrer"/><a href={logo.url} target="_blank" rel="noopener noreferrer" className="meta-link">Abrir imagem ↗</a></div>:<p className="muted">Não encontrado. Peça o logo à empresa.</p>}</article>
      <article className="blk"><div className="blk-h"><strong>Cores</strong><span className="meta">site</span></div>{colors.length?<div className="swatches">{colors.map((c,i)=><div key={c} className="sw"><i style={{background:c}}/><b>{c}</b><span>{roles[i]??"apoio"}</span></div>)}</div>:<p className="muted">{noBrand??"Não encontradas no site. Peça as cores à empresa ou use as do logo."}</p>}</article>
      <article className="blk"><div className="blk-h"><strong>Fontes</strong><span className="meta">site</span></div>{fonts.length?fonts.map((f,i)=><div key={f} className="font-row"><span style={{fontFamily:f}}>{f}</span><span className="meta">{i?"textos":"títulos"}</span></div>):<p className="muted">{noBrand??"Não encontradas no site."}</p>}</article>
      <article className="blk"><div className="blk-h"><strong>Endereço e referências</strong><span className="meta">Google Maps</span></div><p>{lead.address||"Endereço não informado"}</p></article>
      <article className="blk"><div className="blk-h"><strong>Tom e diferenciais</strong><span className="meta">avaliações</span></div><p>{rating?"Nota "+rating[1]+" com "+rating[2]+" avaliações no Google.":"Sem avaliações coletadas."}</p><p className="meta">{rating&&Number(rating[1].replace(",","."))>=4.5?"Tom sugerido: confiável e acolhedor.":"Defina o tom com a empresa."}</p></article>
    </div></section>
  <section className="panel pad stack"><div className="list-head"><span className="step-n">2</span><div className="grow"><h2>Referências do nicho</h2><p className="meta">O padrão dos sites do segmento, para fazer algo diferente dele.</p></div></div>
    <div className="refs-grid"><div className="blk bad"><strong>Evitar: cara de site feito por IA</strong><ul>{avoid.map(a=><li key={a}>{a}</li>)}</ul></div>
      <div className="blk good"><strong>Diferencial desta prévia</strong>{differentials.length?<ul>{differentials.map(d=><li key={d}>{d}</li>)}</ul>:<p className="muted">Peça a leitura automática para trazer avaliações, endereço e Instagram.</p>}</div></div>
    <p className="meta">A busca automática de sites de referência do segmento ainda não está ligada.</p></section>
  <section className="panel pad stack"><div className="list-head"><span className="step-n">3</span><div className="grow"><h2>Prompt do site</h2><p className="meta">Gerado automaticamente com tudo o que sabemos da empresa. Refine com o Gemini até ficar do seu jeito.</p></div></div>
    <PromptEditor initial={prompt} refine={ai&&lead.stage!=="blocked"?refinePrompt.bind(null,lead.id):undefined} aiName={ai?.provider==="openai"?"OpenAI":"Gemini"}/></section>
  <details className="panel disclosure"><summary>Depois de montar: link da prévia, conferência, arquivos e retorno {preview&&<Tag tone="info">{previewStates[preview.status]}</Tag>}</summary><div className="inner stack">
  {preview&&<div className="row"><div><span className="meta">Criada em {formatDate(preview.created_at)}</span><br/><SafeLink url={preview.url}/></div><SafeLink url={preview.url}>Abrir prévia</SafeLink></div>}
  <form action={savePreview.bind(null,lead.id)} className="stack"><div className="fields">
    <Field label="Link da prévia"><input name="url" inputMode="url" required maxLength={2048} defaultValue={preview?.url}/></Field>
    <Field label="Situação"><Select name="status" options={previewStates} defaultValue={preview?.status??"building"}/></Field>
    <Field label="Repositório (opcional)"><input name="repository" inputMode="url" maxLength={2048} defaultValue={preview?.repository??""}/></Field>
    <Field label="Data de envio"><input type="date" name="sent_on" defaultValue={preview?.sent_on??""}/></Field>
    <Field label="Retorno da empresa" full><textarea name="feedback" maxLength={1600} defaultValue={preview?.feedback}/></Field>
    <Field label="Observações" full><textarea name="note" maxLength={1600} defaultValue={preview?.note}/></Field>
  </div><fieldset><legend className="font-bold mb-1">Antes de enviar, confira</legend>{checklist.map((item,i)=><label className="check" key={item}><input type="checkbox" name={"check_"+i} defaultChecked={preview?.checklist.includes(item)}/>{item}</label>)}</fieldset><Submit>Salvar prévia</Submit></form>
  {materials}</div></details></div>;
}

const isoDaysAgo=(days:number)=>new Date(Date.now()-days*86400000).toISOString();
const hoursSince=(iso:string)=>Math.round((Date.now()-Date.parse(iso))/3600000);
export async function HistoryTab({lead,owner,filter}:{lead:Lead;owner:boolean;filter:string}) {
  const {db,org,userId}=await context();
  const {data,error}=await db.from("audit_events").select("id,event,detail,created_at,created_by").eq("organization_id",org.id).eq("lead_id",lead.id).order("created_at",{ascending:false}).limit(120);
  if(error) throw new Error("Falha ao carregar histórico");
  const labels:Record<string,string>={"lead.created":"Empresa cadastrada","lead.stage":"Etapa atualizada","outreach.draft":"Rascunho de mensagem salvo","outreach.sent":"Mensagem enviada","outreach.reply":"Resposta da empresa registrada","outreach.call":"Ligação registrada","website.assessed":"Presença digital avaliada","lead.duplicate_linked":"Duplicidade vinculada","lead_contacts.insert":"Canal cadastrado","lead_contacts.update":"Canal confirmado ou revisado","evidence_items.insert":"Informação adicionada","evidence_items.update":"Informação conferida","tasks.insert":"Tarefa criada","tasks.update":"Tarefa atualizada","previews.insert":"Prévia registrada","previews.update":"Prévia atualizada","brand_assets.insert":"Arquivo da empresa guardado","brand_assets.update":"Autorização de arquivo revisada","offers.insert":"Oferta registrada"};
  const all=data??[];
  // o robô grava várias linhas no mesmo minuto: vira um acontecimento só ("Robô leu o site · 6 informações, 8 contatos")
  const groups=new Map<string,typeof all>();
  for(const row of all){const key=row.created_at.slice(0,16)+(row.created_by??"robo");groups.set(key,[...(groups.get(key)??[]),row]);}
  type Moment={id:string;at:string;title:string;note:string;related:string|null;actor:"robo"|"voce"|"equipe";kind:"conversa"|"robo"|"etapa"|"outro"};
  const moments:Moment[]=[...groups.values()].flatMap(rows=>{
    const actor=!rows[0].created_by?"robo":rows[0].created_by===userId?"voce":"equipe";
    const count=(event:string)=>rows.filter(r=>r.event===event).length;
    const plural=(n:number,one:string,many:string)=>n?n+" "+(n===1?one:many):"";
    const extra=[plural(count("evidence_items.insert"),"informação","informações"),plural(count("lead_contacts.insert"),"contato","contatos")].filter(Boolean).join(" e ");
    const main=rows.find(r=>r.event==="lead.enriched")??rows.find(r=>r.event==="lead.created");
    if(main)return [{id:main.id,at:main.created_at,actor,kind:"robo",related:null,title:main.event==="lead.enriched"?"Robô leu o site e pesquisou a empresa":main.detail?.source==="maps"?"Empresa cadastrada pela pesquisa no Google Maps":"Empresa cadastrada",note:extra?"Registrou "+extra+".":""}];
    return rows.map(r=>({id:r.id,at:r.created_at,actor,related:typeof r.detail?.related_id==="string"?r.detail.related_id:null,
      kind:r.event.startsWith("outreach.")?"conversa":r.event==="lead.stage"?"etapa":actor==="robo"?"robo":"outro",
      title:labels[r.event]??"Registro de atividade",note:typeof r.detail?.reason==="string"?r.detail.reason:""}));
  });
  const shown=filter==="conversas"?moments.filter(m=>m.kind==="conversa"):filter==="robo"?moments.filter(m=>m.actor==="robo"):filter==="etapas"?moments.filter(m=>m.kind==="etapa"):moments;
  const zone={timeZone:"America/Sao_Paulo"};
  const dayKey=(iso:string)=>new Date(iso).toLocaleDateString("pt-BR",{...zone,day:"2-digit",month:"long"});
  const todayKey=dayKey(isoDaysAgo(0)),yesterdayKey=dayKey(isoDaysAgo(1));
  const days=new Map<string,Moment[]>();for(const m of shown){const k=dayKey(m.at);days.set(k,[...(days.get(k)??[]),m]);}
  const time=(iso:string)=>new Date(iso).toLocaleTimeString("pt-BR",{...zone,hour:"2-digit",minute:"2-digit"});
  const oldest=all.at(-1)?.created_at,newest=all[0]?.created_at;
  const ago=(iso?:string)=>{if(!iso)return "—";const h=hoursSince(iso);return h<1?"agora":h<24?h+" h":Math.round(h/24)+" dias";};
  const chip=(key:string,label:string)=><Link className={"btn small"+((filter||"")===key?" primary":"")} href={leadPath(lead.id,"historico")+(key?"&f="+key:"")} aria-current={(filter||"")===key?"page":undefined}>{label}</Link>;
  const who={robo:["ROBÔ","bot"],voce:["VC","me"],equipe:["EQ","team"]} as const;
  return <div className="history-columns"><section className="panel history-feed">
    <div className="list-head"><h2 className="grow">Tudo o que aconteceu</h2><div className="actions" role="group" aria-label="Filtrar histórico">{chip("","Tudo")}{chip("conversas","Conversas")}{chip("robo","Robô")}{chip("etapas","Mudanças de etapa")}</div></div>
    {shown.length?[...days].map(([day,list])=><div key={day}><h3 className="day">{day===todayKey?"Hoje · ":day===yesterdayKey?"Ontem · ":""}{day}</h3>
      {list.map(m=><div className="event" key={m.id}><span className={"actor "+who[m.actor][1]} aria-label={m.actor==="robo"?"Robô":m.actor==="voce"?"Você":"Equipe"}>{who[m.actor][0]}</span>
        <div className="min-w-0"><strong>{m.title}</strong>{m.note&&<p className="meta">{m.note}</p>}{m.related&&<Link href={leadPath(m.related)}>Ver registro relacionado</Link>}
          {m.title.startsWith("Robô leu")&&<Link href={leadPath(lead.id)} className="meta-link">Ver o que encontrou</Link>}</div>
        <time className="meta" dateTime={m.at}>{time(m.at)}</time></div>)}</div>)
    :<Empty title="Nada por aqui" description={moments.length?"Escolha outro filtro.":"Cadastro, leituras do robô, mudanças de etapa e mensagens aparecem aqui."}/>}
  </section><aside className="stack">
    <section className="panel side-card"><h2>Em números</h2><div className="num-grid">
      <div className="num"><strong>{ago(oldest)}</strong><span>na carteira</span></div>
      <div className="num"><strong>{all.filter(r=>r.event==="outreach.sent").length}</strong><span>mensagens enviadas</span></div>
      <div className="num"><strong>{all.filter(r=>r.event==="lead.enriched").length}</strong><span>leituras do robô</span></div>
      <div className="num"><strong>{ago(newest)}</strong><span>desde a última ação</span></div></div></section>
    {owner&&<details className="panel disclosure"><summary>Mais opções</summary><div className="inner stack">
    <section><h3>É a mesma empresa de outro cadastro</h3><p className="meta">Vincule registros relacionados sem perder anexos ou fontes.</p><form className="stack" action={linkDuplicates.bind(null,lead.id)}>
    <Field label="ID do outro registro" hint="Use o identificador da URL de detalhes."><input name="related" required maxLength={36}/></Field>
    <Field label="Justificativa"><input name="reason" required maxLength={500}/></Field><Submit style="small">Vincular registros</Submit></form></section>
    <section className="danger-zone"><h3>Excluir esta empresa</h3><p className="meta">Remove os dados desta empresa e seus registros. Restrições de não contato são preservadas.</p><form action={deleteLead.bind(null,lead.id)} className="stack">
    <Field label="Digite o nome exato da empresa"><input name="confirmation" required maxLength={160}/></Field>
    <label className="check"><input type="checkbox" name="acknowledge" required/>Confirmo a exclusão permanente.</label><Submit style="danger">Excluir cadastro</Submit>
    </form></section></div></details>}
  </aside></div>;
}
