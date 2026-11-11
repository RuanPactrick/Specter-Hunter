// Leitura automática do site do lead, portada do prospeccao-kit-aluno (lib/site.mjs, marketing.mjs, score.mjs).
// Tudo sai do HTML público por regex. O resultado vira evidência e contato PENDENTES: quem confirma é a revisão humana.
import { contactValue, phone, publicUrl } from "./domain";
import { pageTitle, readPublicPage } from "./reader";

const agent = "SpecterHunter/0.1 (leitura de contato público do site)";
const internalPages = ["contato", "fale-conosco", "sobre", "quem-somos", "institucional"];
const junkEmail = /(sentry|wixpress|example|seuemail|email@|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|@2x|@3x)/i;

export type Marketing = { pixel_meta: boolean; pixel_google: boolean; mobile: boolean; whatsapp_button: boolean; copyright: number | null; outdated: boolean };
export type Found = { emails: string[]; phones: string[]; whatsapp: string | null; instagram: string | null; facebook: string | null; linkedin: string | null; cnpj: string | null };
export type SiteRead = { ok: true; url: string; status: number; title: string | null; found: Found; marketing: Marketing; identity?: Identity } | { ok: false; error: string; url?: string };
export type Suggestion = { points: number; maximum: number; signals: Record<string, boolean>; opportunity: "alta" | "media" | "baixa" | null; rationale: string };
type ContactRow = { kind: "email" | "phone" | "whatsapp" | "instagram"; value: string; normalized: string };
type EvidenceRow = { kind: string; observed: string; url: string | null; excerpt: string | null };

export function toText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}

export function extract(html: string): Found {
  const text = toText(html);
  const emails = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) emails.add(m[1].toLowerCase());
  for (const m of text.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g)) emails.add(m[0].toLowerCase());
  const wa = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=|web\.whatsapp\.com\/send\?phone=)(\d{10,15})/i);
  const phones = new Set<string>();
  for (const m of text.matchAll(/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g)) {
    const parsed = phone(m[0]);
    if (parsed) phones.add(parsed.normalized);
  }
  const net = (regex: RegExp) => html.match(regex)?.[0] ?? null;
  const cnpj = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0].replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") ?? null;
  return {
    emails: [...emails].filter(e => !junkEmail.test(e)).slice(0, 5),
    phones: [...phones].slice(0, 5),
    whatsapp: wa ? phone("+" + (wa[1].startsWith("55") ? wa[1] : "55" + wa[1]))?.normalized ?? null : null,
    instagram: net(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{2,30}/i),
    facebook: net(/https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.-]{2,60}/i),
    linkedin: net(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.%-]{2,60}/i),
    cnpj,
  };
}

export function marketing(html: string, year = new Date().getFullYear()): Marketing {
  // Só tag de anúncio conta: Analytics vem de fábrica em Wix e WordPress e marcaria quase todos como "já anuncia".
  const pixel_meta = /fbq\(|connect\.facebook\.net/i.test(html);
  const pixel_google = /["'`]AW-\d{6,}|googleadservices\.com|googleads\.g\.doubleclick\.net/i.test(html);
  const mobile = /<meta[^>]+name=["']?viewport\b/i.test(html);
  const whatsapp_button = /wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com/i.test(html);
  const years = [...html.matchAll(/(?:©|&copy;|copyright)[^<]{0,40}?((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)]
    .flatMap(m => [m[1], m[2]]).filter(Boolean).map(Number).filter(y => y <= year);
  const copyright = years.length ? Math.max(...years) : null;
  return { pixel_meta, pixel_google, mobile, whatsapp_button, copyright, outdated: !mobile || (copyright !== null && copyright <= year - 2) };
}

export type Identity = { colors: string[]; fonts: string[] };
const genericFonts = /^(inherit|initial|unset|sans-serif|serif|monospace|cursive|system-ui|-apple-system|blinkmacsystemfont|arial|helvetica|helvetica neue|segoe ui|roboto|times new roman|times|georgia|verdana|tahoma|ui-sans-serif|ui-serif|apple color emoji|segoe ui emoji|var\(.*)$/i;
/** Cores e fontes da marca. shortcut: só lê o HTML da página inicial (inline e <style>), não os .css externos; ler o CSS se as cores vierem vazias com frequência. */
export function identity(html: string): Identity {
  const hex = (h: string) => { const v = h.slice(1).toLowerCase(); return "#" + (v.length === 3 ? v.split("").map(c => c + c).join("") : v).toUpperCase(); };
  const gray = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return Math.max(r, g, b) - Math.min(r, g, b) < 18; };
  const count = new Map<string, number>();
  const theme = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{3,6})/i)?.[1];
  if (theme) count.set(hex(theme), 100);
  for (const m of html.matchAll(/(?:color|background(?:-color)?|fill|border(?:-color)?)\s*:\s*(#[0-9a-f]{6}\b|#[0-9a-f]{3}\b)/gi)) { const c = hex(m[1]); if (!gray(c)) count.set(c, (count.get(c) ?? 0) + 1); }
  const colors = [...count].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 4);
  const fonts = new Set<string>();
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'>]*/gi)) for (const f of m[0].matchAll(/family=([^:&;"']+)/g)) fonts.add(decodeURIComponent(f[1].replace(/\+/g, " ")));
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) { const first = m[1].split(",")[0].trim().replace(/^['"]|['"]$/g, ""); if (first && !genericFonts.test(first) && first.length < 40) fonts.add(first); }
  return { colors, fonts: [...fonts].slice(0, 3) };
}

function merge(a: Found, b: Found): Found {
  const uniq = (x: string[], y: string[]) => [...new Set([...x, ...y])].slice(0, 5);
  return { emails: uniq(a.emails, b.emails), phones: uniq(a.phones, b.phones), whatsapp: a.whatsapp ?? b.whatsapp, instagram: a.instagram ?? b.instagram,
    facebook: a.facebook ?? b.facebook, linkedin: a.linkedin ?? b.linkedin, cnpj: a.cnpj ?? b.cnpj };
}

export function internalLinks(html: string, base: string, max = 2) {
  const host = new URL(base).hostname;
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    if (!internalPages.some(p => m[1].toLowerCase().includes(p))) continue;
    try {
      const url = new URL(m[1], base);
      if (url.hostname === host && url.href.replace(/\/$/, "") !== base.replace(/\/$/, "")) links.add(url.href);
    } catch { /* href quebrado */ }
  }
  return [...links].slice(0, max);
}

/** Visita a página inicial e até 2 páginas de contato. Site fora do ar é um resultado, não uma exceção. */
export async function readSite(domain: string, read = readPublicPage): Promise<SiteRead> {
  const start = publicUrl(domain);
  if (!start) return { ok: false, error: "domínio inválido" };
  const candidates = [...new Set([start, start.replace(/^https:/, "http:")])];
  let error = "sem resposta", blockedAt: string | undefined;
  for (const candidate of candidates) {
    try {
      const page = await read(candidate, agent);
      if (page.status >= 400) { error = "HTTP " + page.status; blockedAt = page.url; continue; }
      if (!page.html) { error = "resposta sem HTML"; continue; }
      let found = extract(page.html);
      // páginas internas (contato, sobre) em paralelo
      for (const inner of await Promise.all(internalLinks(page.html, page.url).map(link => read(link, agent).catch(() => null))))
        if (inner?.html && inner.status < 400) found = merge(found, extract(inner.html));
      return { ok: true, url: page.url, status: page.status, title: pageTitle(page.html), found, marketing: marketing(page.html), identity: identity(page.html) };
    } catch (cause) { error = cause instanceof Error ? cause.message : "falha"; }
  }
  return { ok: false, error, ...(blockedAt && error.startsWith("HTTP") ? { url: blockedAt } : {}) };
}

// Pesos do kit, só os sinais que o site mostra. Reputação e endereço vêm do Maps, que aqui não é guardado.
export const weights = { site_vivo: 25, instagram: 15, email: 15, telefone: 10, whatsapp: 10, cnpj: 5, linkedin: 5 } as const;
export const labels: Record<keyof typeof weights, string> = { site_vivo: "site no ar", instagram: "Instagram", email: "e-mail", telefone: "telefone", whatsapp: "WhatsApp", cnpj: "CNPJ", linkedin: "LinkedIn" };

export function opportunity(m: Marketing | null): Suggestion["opportunity"] {
  if (!m) return null;
  if (m.pixel_meta || m.pixel_google) return "baixa";
  return m.outdated || !m.whatsapp_button ? "alta" : "media";
}

export function explainMarketing(m: Marketing, year = new Date().getFullYear()) {
  const parts = [m.pixel_meta || m.pixel_google ? "tem pixel de anúncio (" + [m.pixel_meta && "Meta", m.pixel_google && "Google Ads"].filter(Boolean).join(" e ") + ")" : "sem pixel de anúncio"];
  if (!m.mobile) parts.push("sem versão para celular");
  if (m.copyright && m.copyright <= year - 2) parts.push("rodapé parado em " + m.copyright);
  parts.push(m.whatsapp_button ? "com botão de WhatsApp" : "sem botão de WhatsApp");
  return parts.join(", ");
}

/** Sinais achados fora do site (pesquisa na web, Receita), somados à nota. */
export type Extra = { instagram?: boolean; cnpj?: boolean; ads?: boolean };
export function suggest(site: SiteRead, extra: Extra = {}): Suggestion {
  const f = site.ok ? site.found : null;
  const signals: Record<keyof typeof weights, boolean> = {
    site_vivo: site.ok || Boolean(site.url), instagram: Boolean(f?.instagram || extra.instagram), email: Boolean(f?.emails.length), telefone: Boolean(f?.phones.length),
    whatsapp: Boolean(f?.whatsapp), cnpj: Boolean(f?.cnpj || extra.cnpj), linkedin: Boolean(f?.linkedin),
  };
  const keys = Object.keys(weights) as (keyof typeof weights)[];
  const points = keys.reduce((sum, k) => sum + (signals[k] ? weights[k] : 0), 0);
  const maximum = keys.reduce((sum, k) => sum + weights[k], 0);
  const got = keys.filter(k => signals[k]).map(k => labels[k] + " +" + weights[k]);
  const missing = keys.filter(k => !signals[k]).map(k => labels[k] + " (" + weights[k] + ")");
  const rationale = points + " de " + maximum + " pontos observáveis no site." + (got.length ? " Somou: " + got.join(", ") + "." : "") + (missing.length ? " Faltou: " + missing.join(", ") + "." : "");
  // anúncio ativo na Meta vale mais que o pixel: alguém já paga pelo tráfego agora
  const level = site.ok ? (extra.ads ? "baixa" : opportunity(site.marketing)) : null;
  return { points, maximum, signals, opportunity: level, rationale: rationale + (extra.ads ? " Tem anúncio ativo na Meta." : "") };
}

/** O que o worker grava: evidências pendentes, contatos não confirmados e a nota sugerida. */
export function enrichmentPayload(site: SiteRead, extra: Extra = {}) {
  const evidence: EvidenceRow[] = [];
  const contacts: ContactRow[] = [];
  if (!site.ok) {
    // respondeu com erro HTTP (ex.: 403 de bloqueio a robôs): o site existe, só não deixou ler o conteúdo
    if (site.url && /^HTTP [0-9]{3}$/.test(site.error)) {
      evidence.push({ kind: "Leitura do site", observed: "O site está no ar (respondeu " + site.error + "), mas não permite leitura automática do conteúdo. Contatos vieram da pesquisa na web.", url: site.url, excerpt: null });
      return { evidence, contacts, suggestion: suggest(site, extra), site_status: "owned" as const, site_url: site.url };
    }
    evidence.push({ kind: "Leitura do site", observed: "A leitura automática do site não foi concluída: " + site.error + ". Isso não comprova que o site não existe.", url: null, excerpt: null });
    return { evidence, contacts, suggestion: suggest(site, extra), site_status: null, site_url: null };
  }
  const f = site.found;
  evidence.push({ kind: "Leitura do site", observed: "O site respondeu HTTP " + site.status + "." + (site.title ? " Título: " + site.title + "." : ""), url: site.url, excerpt: null });
  const add = (kind: ContactRow["kind"], raw: string) => { const c = contactValue(kind, raw); if (c) contacts.push({ kind, ...c }); };
  f.emails.forEach(e => add("email", e));
  f.phones.forEach(p => add("phone", p));
  if (f.whatsapp) add("whatsapp", f.whatsapp);
  if (f.instagram) add("instagram", f.instagram);
  const listed = [
    f.emails.length && "e-mail " + f.emails.join(", "), f.phones.length && "telefone " + f.phones.join(", "), f.whatsapp && "WhatsApp " + f.whatsapp,
    f.instagram && "Instagram " + f.instagram, f.facebook && "Facebook " + f.facebook, f.linkedin && "LinkedIn " + f.linkedin, f.cnpj && "CNPJ " + f.cnpj,
  ].filter(Boolean);
  evidence.push({ kind: "Contatos no site", observed: listed.length ? "Publicado no site: " + listed.join("; ") + "." : "Nenhum contato encontrado no HTML da página inicial e de contato.", url: site.url, excerpt: null });
  const level = opportunity(site.marketing);
  evidence.push({ kind: "Sinais de marketing", observed: "Página inicial: " + explainMarketing(site.marketing) + ". Oportunidade sugerida: " + level + ".", url: site.url, excerpt: null });
  const id = site.identity;
  if (id && (id.colors.length || id.fonts.length)) evidence.push({ kind: "Identidade visual", observed: [id.colors.length && "Cores: " + id.colors.join(", ") + ".", id.fonts.length && "Fontes: " + id.fonts.join(", ") + "."].filter(Boolean).join(" "), url: site.url, excerpt: null });
  return { evidence, contacts, suggestion: suggest(site, extra), site_status: "owned" as const, site_url: site.url };
}
export type Payload = ReturnType<typeof enrichmentPayload>;
export type { ContactRow, EvidenceRow };
