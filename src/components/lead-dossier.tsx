import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ExternalLink, Globe, Mail, MapPin, Megaphone, MessageCircle, Phone, ScanSearch, Sparkles, X } from "lucide-react";
import { Notice, Tag } from "./ui";
import { Submit } from "./submit";
import { Refresh } from "./refresh";
import { reviewEvidence } from "@/lib/lead-actions";
import { requestEnrichment } from "@/lib/research-actions";
import { searchEnabled } from "@/lib/providers";
import { labels, weights, type Suggestion } from "@/lib/enrichment";
import { contactHref, contacts as contactNames, decodeEntities, evidenceExpired, formatDate, readingErrors, type Contact, type Evidence, type Lead } from "@/lib/domain";
import { leadPath } from "@/lib/data";

export type Reading = { state: "pending" | "running" | "done" | "failed"; step: string | null; error_code: string | null; suggestion: Suggestion | null; finished_at: string | null };
// cada cartão mostra a evidência mais recente de um destes tipos (gravados pela leitura automática e pelo Maps)
const cards: { title: string; kinds: string[]; icon: ReactNode; empty: string }[] = [
  { title: "Site", kinds: ["Leitura do site"], icon: <Globe size={18} />, empty: "O site ainda não foi lido." },
  { title: "Instagram", kinds: ["Perfil do Instagram", "Instagram achado na pesquisa"], icon: <span className="glyph">IG</span>, empty: "Nenhum perfil encontrado." },
  { title: "Google Maps", kinds: ["Google Maps"], icon: <MapPin size={18} />, empty: "Sem dados do Google Maps." },
  { title: "Empresa (CNPJ)", kinds: ["Cadastro na Receita"], icon: <span className="glyph">CNPJ</span>, empty: "CNPJ não encontrado." },
  { title: "Anúncios na Meta", kinds: ["Anúncios na Meta"], icon: <Megaphone size={18} />, empty: "Anúncios ainda não conferidos." },
  { title: "Marketing do site", kinds: ["Sinais de marketing"], icon: <Sparkles size={18} />, empty: "Sem análise do site." },
];
const reviewTag = (e: Evidence) => e.review === "confirmed" || e.review === "corrected" ? <Tag tone="success">Confirmado</Tag>
  : e.review === "pending" ? <Tag tone="warning">A conferir</Tag> : <Tag>Não confere</Tag>;
const linkLabel = (url: string) => url.includes("facebook.com/ads") ? "Abrir Biblioteca de anúncios" : url.includes("brasilapi") ? "Ver na Receita" : url.includes("google.com/maps") ? "Abrir no Maps" : "Abrir";

function Finding({ lead, title, icon, empty, item }: { lead: Lead; title: string; icon: ReactNode; empty: string; item?: Evidence }) {
  return <article className={"finding" + (item ? "" : " missing")}>
    <header><span className="finding-icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{item && reviewTag(item)}</header>
    {item ? <>
      <p>{decodeEntities(item.observed)}</p>
      <p className="meta">{item.source_label} · consultado em {formatDate(item.consulted_on)}</p>
      <div className="finding-foot">{item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="link-btn"><ExternalLink size={14} aria-hidden="true" />{linkLabel(item.url)}</a>}
        {item.review === "pending" && <form action={reviewEvidence.bind(null, lead.id, item.id)} className="inline">
          <input type="hidden" name="observed" value={item.observed} /><input type="hidden" name="back" value="resumo" />
          <button className="btn small" name="review" value="confirmed" title="O dado confere com a empresa"><Check size={14} aria-hidden="true" />Confere</button>
          <button className="btn small ghost" name="review" value="inconclusive" title="O dado é de outra empresa ou está errado"><X size={14} aria-hidden="true" />Não confere</button>
        </form>}</div>
    </> : <p className="muted">{empty}</p>}
  </article>;
}

const icons: Partial<Record<Contact["kind"], ReactNode>> = { whatsapp: <MessageCircle size={15} />, phone: <Phone size={15} />, email: <Mail size={15} /> };
/** Topo do resumo: o que a leitura achou, em cartões, com os canais prontos para usar e a nota explicada. */
export function Dossier({ lead, evidence, channels, reading }: { lead: Lead; evidence: Evidence[]; channels: Contact[]; reading: Reading | null }) {
  const busy = reading?.state === "pending" || reading?.state === "running";
  const pick = (kinds: string[]) => kinds.map(k => evidence.find(e => e.kind === k && !evidenceExpired(e))).find(Boolean);
  const stopped = evidence.find(e => e.kind === "Pesquisa interrompida" && !evidenceExpired(e));
  const guess = evidence.find(e => e.kind === "Possível domínio" && e.review === "pending" && !evidenceExpired(e));
  const expired = [...new Set(evidence.filter(evidenceExpired).map(e => e.kind))];
  const s = reading?.suggestion;
  const usable = lead.stage === "blocked" ? [] : channels.filter(c => ["whatsapp", "phone", "email"].includes(c.kind));
  return <section className="dossier" aria-label="O que encontramos sobre a empresa">
    <Refresh active={busy} />
    <div className="dossier-head">
      <div><h2>O que encontramos</h2>
        <p className="muted">{reading?.state === "done" ? "Leitura automática de " + formatDate(reading.finished_at) + ". Confira cada item: \"Confere\" usa o dado na abordagem e na nota."
          : reading?.state === "running" ? "Lendo agora: " + (reading.step ?? "começando") + "…"
          : reading?.state === "pending" ? "Na fila de leitura. O robô começa em até 5 minutos."
          : reading?.state === "failed" ? "A última leitura falhou: " + (readingErrors[reading.error_code ?? ""] ?? reading.error_code) + "."
          : "O robô ainda não leu esta empresa. Ele lê o site, procura Instagram, CNPJ e anúncios."}</p></div>
      {(lead.domain || searchEnabled()) && <form action={requestEnrichment.bind(null, lead.id)}><Submit style={reading ? "" : "primary"}><ScanSearch size={16} aria-hidden="true" />{busy ? "Lendo…" : reading ? "Ler de novo" : "Ler agora"}</Submit></form>}
    </div>
    {stopped && <Notice tone="warning">{stopped.observed}</Notice>}
    {guess && <Notice>{guess.observed}</Notice>}
    {expired.length>0&&<Notice tone="warning">Achados vencidos não entram no resumo nem na abordagem: {expired.slice(0,5).join(", ")}. <Link href={leadPath(lead.id,"evidencias")}>Confira as fontes</Link>.</Notice>}
    <div className="dossier-primary">
      {s && <article className="finding score">
        <header><span className="finding-icon" aria-hidden="true"><Sparkles size={18} /></span><h3>Nota da presença digital</h3></header>
        <p className="score-big"><strong>{s.points}</strong> / {s.maximum}</p>
        <ul className="signals">{(Object.keys(weights) as (keyof typeof weights)[]).map(k => <li key={k} className={s.signals?.[k] ? "yes" : "no"}>
          {s.signals?.[k] ? <Check size={14} aria-label="tem" /> : <X size={14} aria-label="não tem" />}{labels[k]} <span className="meta">+{weights[k]}</span></li>)}</ul>
        {s.opportunity && <p className="meta">Chance de vender um site: <strong>{s.opportunity}</strong> (quanto pior a presença digital, maior a chance).</p>}
      </article>}
      <article className="finding">
        <header><span className="finding-icon" aria-hidden="true"><Phone size={18} /></span><h3>Como falar com a empresa</h3></header>
        {lead.stage === "blocked" ? <p className="muted">Empresa marcada como não contatar.</p> : usable.length ? <ul className="channel-list">{usable.slice(0, 6).map(c => {
          const href = contactHref(c.kind, c.normalized, c.value);
          return <li key={c.id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{icons[c.kind]}<span>{c.value}</span></a> : <span>{icons[c.kind]}{c.value}</span>}
            <span className="meta">{contactNames[c.kind]}{c.confirmed ? " · confirmado" : ""}</span></li>;
        })}</ul> : <p className="muted">Nenhum telefone, WhatsApp ou e-mail encontrado.</p>}
        {usable.length > 6 && <p className="meta">E mais {usable.length - 6} na aba Contatos.</p>}
      </article>
    </div>
    <section className="dossier-grid" aria-label="Achados por fonte">
      {cards.map(c => <Finding key={c.title} lead={lead} title={c.title} icon={c.icon} empty={c.empty} item={pick(c.kinds)} />)}
    </section>
  </section>;
}
