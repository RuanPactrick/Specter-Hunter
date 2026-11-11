import Link from "next/link";
import { MessageCircle, Phone, RefreshCw } from "lucide-react";
import { Avatar, Tag } from "./ui";
import { Submit } from "./submit";
import { requestEnrichment } from "@/lib/research-actions";
import { moveLead } from "@/lib/lead-actions";
import { searchEnabled } from "@/lib/providers";
import { leadPath, loadContacts, loadEvidence, loadReading } from "@/lib/data";
import { contactHref, evidenceExpired, formatDate, stages, type Lead } from "@/lib/domain";

function since(iso: string | null) {
  if (!iso) return null;
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 60 ? "há " + min + " min" : min < 1440 ? "há " + Math.round(min / 60) + " h" : "há " + Math.round(min / 1440) + " dias";
}
/** Anel da nota da presença digital (pontos de 0 ao máximo). */
export function ScoreRing({ points, maximum, size = 64 }: { points: number; maximum: number; size?: number }) {
  const c = 2 * Math.PI * 26, filled = maximum ? (points / maximum) * c : 0;
  return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={"Nota " + points + " de " + maximum}>
    <circle cx="32" cy="32" r="26" fill="none" stroke="#E6ECE6" strokeWidth="7" />
    <circle cx="32" cy="32" r="26" fill="none" stroke="#176B56" strokeWidth="7" strokeLinecap="round" strokeDasharray={filled + " " + c} transform="rotate(-90 32 32)" />
    <text x="32" y="38" textAnchor="middle" fontWeight="800" fontSize="18" fill="#17231D">{points}</text></svg>;
}
export const leadTabs = { resumo: "Resumo", contatos: "Contatos", abordagem: "Abordagem", previa: "Prévia do site", fontes: "Fontes", historico: "Histórico" } as const;
export type LeadTab = keyof typeof leadTabs;

/** Cabeçalho fixo da ficha: identidade, nota, ações principais, próximo passo e abas com contadores. */
export async function LeadHeader({ lead, active, owners }: { lead: Lead; active: LeadTab; owners: Record<string, string> }) {
  const [evidence, channels, reading] = await Promise.all([loadEvidence(lead.id), loadContacts(lead.id), loadReading(lead.id)]);
  const blocked = lead.stage === "blocked";
  const whats = channels.find(c => c.kind === "whatsapp" && c.confirmed) ?? channels.find(c => c.kind === "whatsapp");
  const phone = channels.find(c => c.kind === "phone" && c.confirmed) ?? channels.find(c => c.kind === "phone");
  const whatsHref = !blocked && whats ? contactHref(whats.kind, whats.normalized, whats.value) : null;
  const phoneHref = !blocked && phone ? contactHref(phone.kind, phone.normalized, phone.value) : null;
  const pending = evidence.filter(e => e.review === "pending" && !evidenceExpired(e) && e.kind !== "Cadastro").length;
  const s = reading?.suggestion;
  const readAgo = reading?.state === "done" ? since(reading.finished_at) : null;
  const canRead = Boolean(lead.domain) || searchEnabled();
  const busy = reading?.state === "pending" || reading?.state === "running";
  const counts: Partial<Record<LeadTab, { n: string; warn?: boolean }>> = { contatos: channels.length ? { n: String(channels.length) } : undefined, fontes: pending ? { n: pending + " a conferir", warn: true } : undefined };
  const quality = !s ? null : s.points >= 60 ? "Presença forte" : s.points >= 30 ? "Presença média" : "Presença fraca";
  return <>
    <header className="lead-head panel">
      <div className="lead-head-main">
        <Avatar name={lead.name} large />
        <div className="lead-head-id">
          <div className="lead-head-title"><h1>{lead.name}</h1><Tag tone={blocked ? "error" : "info"}>{stages[lead.stage]}</Tag>{readAgo && <Tag>Lida pelo robô {readAgo}</Tag>}{busy && <Tag tone="warning">Lendo agora…</Tag>}</div>
          <p className="muted">{[lead.sector, [lead.district, lead.city + " – " + lead.region].filter(Boolean).join(", ")].join(" · ")}{lead.domain && <> · <a href={"https://" + lead.domain} target="_blank" rel="noopener noreferrer">{lead.domain}</a></>}</p>
        </div>
        {s && <div className="lead-head-score"><ScoreRing points={s.points} maximum={s.maximum} /><div><strong>{quality}</strong><span className="meta">{s.points} de {s.maximum} pontos</span></div></div>}
        <div className="lead-head-actions">
          {canRead && <form action={requestEnrichment.bind(null, lead.id)}><Submit style=""><RefreshCw size={16} aria-hidden="true" />{busy ? "Lendo…" : "Ler de novo"}</Submit></form>}
          {whatsHref ? <a className="btn primary" href={whatsHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />Chamar no WhatsApp</a>
            : !blocked && <Link className="btn primary" href={leadPath(lead.id, "abordagem")}><MessageCircle size={16} aria-hidden="true" />Abordagem e contato</Link>}
        </div>
      </div>
      {!blocked && <div className="lead-next">
        <span className="lead-next-label">Próximo passo</span>
        <span className="lead-next-text"><strong>{lead.next_action || "Defina o próximo passo no Resumo"}</strong>
          <span className="muted">{lead.follow_up ? " · retorno em " + formatDate(lead.follow_up) : ""}{lead.assignee_id ? " · com " + (owners[lead.assignee_id] ?? "membro da equipe").replace("Minha responsabilidade", "você") : ""}</span></span>
        <form action={moveLead.bind(null, lead.id, "lead")} className="lead-next-form">
          <label>Etapa <select name="stage" defaultValue={lead.stage}>{Object.entries(stages).filter(([k]) => k !== "blocked").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <Submit style="small">Mudar etapa</Submit>
        </form>
      </div>}
      <nav className="lead-tabs" aria-label="Seções da empresa">{(Object.keys(leadTabs) as LeadTab[]).map(key => <Link key={key} href={leadPath(lead.id, key)} aria-current={active === key ? "page" : undefined}>
        {leadTabs[key]}{counts[key] && <span className={"count" + (counts[key]!.warn ? " warn" : "")}>{counts[key]!.n}</span>}</Link>)}</nav>
    </header>
    {!blocked && (whatsHref || phoneHref || canRead) && <div className="lead-mobile-actions" aria-label="Ações rápidas">
      {whatsHref && <a className="btn primary" href={whatsHref} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
      {phoneHref && <a className="btn" href={phoneHref}><Phone size={16} aria-hidden="true" />Ligar</a>}
      {canRead && <form action={requestEnrichment.bind(null, lead.id)}><Submit style=""><RefreshCw size={16} aria-hidden="true" />Ler</Submit></form>}
    </div>}
  </>;
}
