import type { ReactNode } from "react";
import Link from "next/link";
import { Building2, Check, ExternalLink, Globe, Mail, MapPin, Megaphone, MessageCircle, Phone, Sparkles, X } from "lucide-react";
import { Notice, Tag } from "./ui";
import { Refresh } from "./refresh";
import { reviewEvidence } from "@/lib/lead-actions";
import { labels, weights } from "@/lib/enrichment";
import { brief, marketingChecks, metrics, salesAngle } from "@/lib/insights";
import { leadPath, type Reading } from "@/lib/data";
import { contactHref, contacts as contactNames, decodeEntities, evidenceExpired, formatDate, readingErrors, type Contact, type Evidence, type Lead } from "@/lib/domain";
export type { Reading };

const InstagramIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".5" /></svg>;
// cada cartão mostra a evidência mais recente de um destes tipos (gravados pela leitura automática e pelo Maps)
const cards: { title: string; kinds: string[]; icon: ReactNode; empty: string }[] = [
  { title: "Site", kinds: ["Leitura do site"], icon: <Globe size={18} />, empty: "O site ainda não foi lido." },
  { title: "Instagram", kinds: ["Perfil do Instagram", "Instagram achado na pesquisa"], icon: <InstagramIcon />, empty: "Nenhum perfil encontrado." },
  { title: "Google Maps", kinds: ["Google Maps"], icon: <MapPin size={18} />, empty: "Sem dados do Google Maps." },
  { title: "Empresa (CNPJ)", kinds: ["Cadastro na Receita"], icon: <Building2 size={18} />, empty: "CNPJ não encontrado." },
  { title: "Anúncios na Meta", kinds: ["Anúncios na Meta"], icon: <Megaphone size={18} />, empty: "Anúncios ainda não conferidos." },
  { title: "Marketing do site", kinds: ["Sinais de marketing"], icon: <Sparkles size={18} />, empty: "Sem análise do site." },
];
const isConfirmed = (e: Evidence) => e.review === "confirmed" || e.review === "corrected";
const reviewTag = (e: Evidence) => isConfirmed(e) ? <Tag tone="success">Confirmado</Tag> : e.review === "pending" ? <Tag tone="warning">A conferir</Tag> : <Tag>Não confere</Tag>;
const linkLabel = (url: string) => url.includes("facebook.com/ads") ? "Abrir biblioteca" : url.includes("brasilapi") ? "Ver na Receita" : url.includes("google.com/maps") ? "Abrir no Maps" : url.includes("instagram.com") ? "Abrir perfil" : "Abrir site";
export const pickFinding = (evidence: Evidence[], kinds: string[]) => kinds.map(k => evidence.find(e => e.kind === k && !evidenceExpired(e))).find(Boolean);

function Finding({ lead, title, icon, empty, item }: { lead: Lead; title: string; icon: ReactNode; empty: string; item?: Evidence }) {
  const nums = item ? metrics(item.kind, item.observed) : [];
  const checks = item?.kind === "Sinais de marketing" ? marketingChecks(item.observed) : null;
  const handle = item?.observed.match(/^@[\w.]+/)?.[0];
  return <article className={"finding" + (item ? "" : " missing")}>
    <header><span className="finding-icon" aria-hidden="true">{icon}</span><h3>{title}{handle && <span className="muted"> {handle}</span>}</h3>{item && reviewTag(item)}</header>
    {item ? <>
      {nums.length > 0 && <div className="fmetrics">{nums.map(m => <div className="fmetric" key={m.label}><strong className={m.alert ? "alert" : ""}>{m.value}</strong><span>{m.label}</span></div>)}</div>}
      {checks ? <ul className="checks">{checks.map(c => <li key={c.text} className={c.ok ? "ok" : "no"}><span aria-hidden="true">{c.ok ? "✓" : "!"}</span>{c.text}</li>)}</ul>
        : nums.length ? brief(item.kind, item.observed) && <p className="finding-brief">{brief(item.kind, item.observed)}</p> : <p>{decodeEntities(item.observed)}</p>}
      <div className="finding-foot">{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="link-btn"><ExternalLink size={14} aria-hidden="true" />{linkLabel(item.url)}</a>}
        {item.review === "pending" && <form action={reviewEvidence.bind(null, lead.id, item.id)} className="inline">
          <input type="hidden" name="observed" value={item.observed} /><input type="hidden" name="back" value="resumo" />
          <button className="btn small" name="review" value="confirmed" title="O dado confere com a empresa"><Check size={14} aria-hidden="true" />Confere</button>
          <button className="btn small ghost" name="review" value="inconclusive" title="O dado é de outra empresa ou está errado"><X size={14} aria-hidden="true" />Não confere</button>
        </form>}</div>
    </> : <p className="muted">{empty}</p>}
  </article>;
}

/** Cartão escuro com o argumento de venda montado só com o que o robô achou. */
export function SalesAngle({ evidence }: { evidence: Evidence[] }) {
  const angle = salesAngle(evidence.filter(e => !evidenceExpired(e) && e.review !== "inconclusive" && e.review !== "conflict"));
  return <section className="angle" aria-label="Argumento de venda">
    <div className="angle-head"><span className="angle-icon" aria-hidden="true"><Sparkles size={18} /></span><h2>Argumento de venda</h2>{angle.hooks.length > 0 && <span className="angle-chance">Chance de vender: {angle.chance}</span>}</div>
    <p>{angle.summary}</p>
    {angle.hooks.length > 0 && <div className="angle-hooks">{angle.hooks.map(h => <div key={h.title}><strong>{h.title}</strong><span>{h.detail}</span></div>)}</div>}
  </section>;
}

/** O que encontramos: andamento da leitura, quanto já foi conferido e os achados em cartões com números. */
export function Findings({ lead, evidence, reading }: { lead: Lead; evidence: Evidence[]; reading: Reading | null }) {
  const busy = reading?.state === "pending" || reading?.state === "running";
  const items = cards.map(c => pickFinding(evidence, c.kinds));
  const found = items.filter(Boolean) as Evidence[];
  const checked = found.filter(e => e.review !== "pending").length;
  const stopped = evidence.find(e => e.kind === "Pesquisa interrompida" && !evidenceExpired(e));
  const expired = [...new Set(evidence.filter(evidenceExpired).map(e => e.kind))];
  const status = reading?.state === "running" ? "Lendo agora: " + (reading.step ?? "começando") + "…"
    : reading?.state === "pending" ? "Na fila de leitura. O robô começa em até 1 minuto."
    : reading?.state === "failed" ? "A última leitura falhou: " + (readingErrors[reading.error_code ?? ""] ?? reading.error_code) + "."
    : !reading ? "O robô ainda não leu esta empresa. Use “Ler de novo” no topo." : null;
  return <section className="findings" aria-label="O que encontramos">
    <Refresh active={busy} />
    <div className="findings-head"><h2>O que encontramos</h2>
      {found.length > 0 && <div className="findings-progress"><div className="bar"><span style={{ width: (checked / found.length) * 100 + "%" }} /></div><span className="meta">{checked} de {found.length} conferidos</span></div>}
      {found.length > checked && <Link className="btn small" href={leadPath(lead.id, "fontes") + "&f=pendentes"}>Conferir os {found.length - checked} pendentes</Link>}
    </div>
    {status && <p className="muted">{status}</p>}
    {stopped && <Notice tone="warning">{stopped.observed}</Notice>}
    {expired.length > 0 && <Notice tone="warning">Achados vencidos não entram no resumo nem na abordagem: {expired.slice(0, 5).join(", ")}. <Link href={leadPath(lead.id, "fontes")}>Confira as fontes</Link>.</Notice>}
    <div className="findings-grid">{cards.map((c, i) => <Finding key={c.title} lead={lead} title={c.title} icon={c.icon} empty={c.empty} item={items[i]} />)}</div>
  </section>;
}

/** Como a nota sugerida foi calculada, item por item. */
export function ScoreBreakdown({ reading }: { reading: Reading | null }) {
  const s = reading?.suggestion;
  if (!s) return null;
  const keys = Object.keys(weights) as (keyof typeof weights)[];
  return <section className="panel side-card"><h2>Como a nota foi calculada</h2>
    <div className="score-bars">{keys.map(k => { const on = Boolean(s.signals?.[k]); return <div key={k} className={on ? "" : "off"}>
      <span>{labels[k].replace(/^\w/, c => c.toUpperCase())}{on ? "" : " · não encontrado"}</span><strong>{on ? "+" + weights[k] : "0 de " + weights[k]}</strong>
      <i><b style={{ width: on ? "100%" : "0" }} /></i></div>; })}</div>
    {s.opportunity && <p className="meta">Chance de vender um site: <strong>{s.opportunity}</strong>. Quanto pior a presença digital, maior a chance.</p>}
  </section>;
}

const icons: Partial<Record<Contact["kind"], ReactNode>> = { whatsapp: <MessageCircle size={16} />, phone: <Phone size={16} />, email: <Mail size={16} /> };
/** Melhor canal em destaque e os outros logo abaixo, prontos para usar. */
export function TalkNow({ lead, channels }: { lead: Lead; channels: Contact[] }) {
  const usable = lead.stage === "blocked" ? [] : channels.filter(c => ["whatsapp", "phone", "email"].includes(c.kind));
  const best = usable.find(c => c.kind === "whatsapp" && c.confirmed) ?? usable.find(c => c.kind === "whatsapp") ?? usable.find(c => c.confirmed) ?? usable[0];
  const rest = usable.filter(c => c !== best).slice(0, 3);
  return <section className="panel side-card"><h2>Falar agora</h2>
    {lead.stage === "blocked" ? <p className="muted">Empresa marcada como não contatar.</p> : !best ? <p className="muted">Nenhum telefone, WhatsApp ou e-mail encontrado ainda.</p> : <>
      <div className="best-channel"><span className="eyebrow">Melhor canal</span><strong>{contactNames[best.kind]} {best.value}</strong>
        <span className="meta">{best.source_label} · {best.confirmed ? "confirmado" : "ainda não confirmado"}</span>
        {contactHref(best.kind, best.normalized, best.value) && <a className="btn primary small" href={contactHref(best.kind, best.normalized, best.value)!} target="_blank" rel="noopener noreferrer">{best.kind === "whatsapp" ? "Abrir conversa" : best.kind === "phone" ? "Ligar" : "Escrever"}</a>}</div>
      {rest.length > 0 && <ul className="channel-list">{rest.map(c => { const href = contactHref(c.kind, c.normalized, c.value); return <li key={c.id}>
        {href ? <a href={href} target="_blank" rel="noopener noreferrer">{icons[c.kind]}<span>{c.value}</span></a> : <span>{icons[c.kind]}{c.value}</span>}{c.confirmed && <Tag tone="success">Confirmado</Tag>}</li>; })}</ul>}
    </>}
    {channels.length > 0 && <Link href={leadPath(lead.id, "contatos")} className="meta-link">Ver os {channels.length} contatos</Link>}
  </section>;
}
export { formatDate };
