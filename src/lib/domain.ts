import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export const stages = {
  discovered: "Descoberto", review: "Em análise", qualified: "Qualificado", contact: "Contato iniciado",
  identified: "Responsável identificado", permission: "Autorização para prévia", preview: "Prévia enviada",
  meeting: "Reunião", proposal: "Proposta enviada", negotiation: "Negociação", won: "Ganho", lost: "Perdido", blocked: "Não contatar"
} as const;
export const sites = {
  owned: "Site próprio identificado", third_party: "Página de terceiros identificada", social: "Apenas redes sociais localizadas",
  not_found: "Nenhum site próprio localizado nas consultas realizadas", possible: "Possível domínio, pendente",
  unreachable: "Site identificado, temporariamente inacessível", insufficient: "Pesquisa insuficiente", conflict: "Informação conflitante"
} as const;
export const reviews = { pending: "A revisar", confirmed: "Confirmada", corrected: "Corrigida", inconclusive: "Inconclusiva", conflict: "Conflito registrado" } as const;
export const contacts = { phone: "Telefone comercial", whatsapp: "WhatsApp", email: "E-mail comercial", instagram: "Instagram", website: "Site", maps: "Google Maps" } as const;
export const previewStates = { not_started: "Não iniciada", building: "Em criação", ready: "Pronta", sent: "Enviada", review: "Em revisão", approved: "Aprovada", archived: "Arquivada" } as const;
export const taskKinds = { evidence: "Revisar evidência", contact: "Confirmar contato", preview: "Preparar prévia", follow_up: "Retornar", proposal: "Enviar proposta", meeting: "Reunião", other: "Outro" } as const;
export const criteria = {
  gap: { label: "Lacuna digital", max: 30 }, fit: { label: "Adequação comercial de um site", max: 25 },
  contact: { label: "Facilidade de contato", max: 15 }, materials: { label: "Disponibilidade de materiais", max: 15 },
  investment: { label: "Sinais públicos de investimento em comunicação", max: 15 }
} as const;
export const purposes = { confirm: "Confirmar responsável", permit: "Pedir autorização", preview: "Apresentar prévia", follow: "Acompanhar retorno", price: "Responder preço", close: "Encerrar contato" } as const;
export const checklist = ["Informações revisadas", "Contatos testados", "Materiais autorizados", "Aviso de demonstração", "Não indexada", "Responsividade revisada"];
export { regions } from "./regions";
export const sectors = ["Academia","Advocacia","Arquitetura","Barbearia","Cafeteria","Confeitaria","Construtora","Contabilidade","Design de interiores","Energia solar","Escola e cursos",
  "Estética","Fisioterapia","Imobiliária","Móveis planejados","Odontologia","Oficinas","Pet shop","Pilates","Restaurante","Salão de beleza","Serviços locais","Veterinária"];
export const offerKinds = ["Site institucional", "Landing page", "Cardápio", "Catálogo sem checkout", "Portfólio", "Página de serviços", "Página por unidade", "Reformulação de site"];
export type Stage = keyof typeof stages;
export type WebsiteStatus = keyof typeof sites;
export type Review = keyof typeof reviews;
export type ContactKind = keyof typeof contacts;
export type Criterion = keyof typeof criteria;
export type Purpose = keyof typeof purposes;
export type Lead = {
  id: string; name: string; sector: string; city: string; region: string; district: string; address: string; domain: string | null; notes: string;
  source_label: string; source_url: string | null; consulted_on: string; stage: Stage; website_status: WebsiteStatus;
  priority: "alta" | "media" | "baixa" | null; assignee_id: string | null; next_action: string; follow_up: string | null;
  loss_reason: string | null; contract_value: number | null; updated_at: string;
};
export type Evidence = {
  id: string; kind: string; observed: string; url: string | null; provider: string; source_label: string; consulted_on: string;
  method: string; excerpt: string | null; confidence: "suficiente" | "pendente" | "insuficiente"; review: Review; review_note: string | null;
  expires_at: string | null; export_allowed: boolean;
};
export const evidenceExpired = (evidence: Pick<Evidence,"expires_at">) => Boolean(evidence.expires_at && Date.parse(evidence.expires_at) <= Date.now());
export const evidenceUsable = (evidence: Pick<Evidence,"review"|"expires_at">) =>
  (evidence.review === "confirmed" || evidence.review === "corrected") && !evidenceExpired(evidence);
export type Contact = { id: string; kind: ContactKind; value: string; normalized: string; source_label: string; consulted_on: string; confirmed: boolean };
export type Assessment = { criterion: Criterion; points: number; rationale: string; evidence_id: string };
export type Preview = { id: string; url: string; repository: string | null; status: keyof typeof previewStates; sent_on: string | null; feedback: string; note: string; checklist: string[]; created_at: string };
export type Task = { id: string; title: string; lead_id: string; due: string; kind: keyof typeof taskKinds; status: "open" | "done"; assignee_id: string | null; note: string; leads?: {name: string} };
export type ResearchState = "pending" | "running" | "partial" | "completed" | "failed" | "cancelled" | "awaiting_configuration" | "limit_reached";
export const researchStates: Record<ResearchState,string> = { pending: "Pendente", running: "Em execução", partial: "Parcial", completed: "Concluída", failed: "Falhou", cancelled: "Cancelada", awaiting_configuration: "Aguardando configuração", limit_reached: "Limite atingido" };
export type ResearchJob = { id:string; state:ResearchState; city:string; region:string; districts:string; segment:string; desired:number; max_queries:number; query_count:number; attempt:number; result_count:number; error_code:string|null; created_at:string; started_at:string|null; finished_at:string|null; cancel_requested:boolean };
export const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone:"America/Sao_Paulo" }).format(new Date());
export const formatDate = (value: string | null) => value ? value.slice(0,10).split("-").reverse().join("/") : "—";
export function nameKey(input: string) {
  return input.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");
}
export function phone(input: string) {
  const parsed = parsePhoneNumberFromString(input.trim(), { defaultCountry: "BR", extract: false });
  if (!parsed?.isValid() || parsed.ext) return null;
  return { normalized: parsed.number, value: parsed.formatInternational() };
}
export function publicUrl(input: string) {
  const raw = input.trim();
  if (!raw || /[\u0000-\u001F\u007F\\]/u.test(raw)) return null;
  if (!/^https?:\/\//i.test(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^[\w.-]+\.[a-z]{2,}:\d+(?:\/|$)/i.test(raw)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname.includes(".") || /^(\d{1,3}\.){3}\d{1,3}$/.test(url.hostname) || url.hostname.endsWith(".local")) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
export function domain(input: string) {
  const value = publicUrl(input);
  return value ? new URL(value).hostname.toLowerCase().replace(/^www\./,"").replace(/\.$/,"") : null;
}
export function contactValue(kind: ContactKind, input: string) {
  if (kind === "phone" || kind === "whatsapp") return phone(input);
  if (kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim()) ? { value: input.trim(), normalized: input.trim().toLowerCase() } : null;
  const url = publicUrl(kind === "instagram" && /^@?[\w.]+$/.test(input.trim()) ? "https://www.instagram.com/" + input.trim().replace(/^@/,"") : input);
  if (!url) return null;
  if (kind === "instagram") {
    const parsed = new URL(url);
    const handle = parsed.pathname.split("/").filter(Boolean);
    if (domain(url) !== "instagram.com" || handle.length !== 1 || !/^[\w.]+$/.test(handle[0])) return null;
    return { value: "@" + handle[0], normalized: handle[0].toLowerCase() };
  }
  return { value: url, normalized: url };
}
export function score(items: Assessment[], validEvidence: Set<string>) {
  const eligible = items.filter(item => validEvidence.has(item.evidence_id));
  const observed = eligible.reduce((sum,item) => sum + item.points, 0);
  const maximum = eligible.reduce((sum,item) => sum + criteria[item.criterion].max, 0);
  return { observed, maximum, coverage: maximum, provisional: maximum < 100 };
}
export function messageTemplate(purpose: Purpose, sender: string, city: string, preview: string | null) {
  if (purpose === "preview" && !preview) return "";
  const text: Record<Purpose,string> = {
    confirm: "Olá! Sou " + sender + " e trabalho com criação de sites em " + city + ". Com quem posso conversar sobre a comunicação da empresa?",
    permit: "Olá! Sou " + sender + " e trabalho com criação de sites. Posso compartilhar uma ideia de página para a empresa?",
    preview: "Olá! Sou " + sender + ". Esta é a prévia que preparei para avaliação: " + preview + ". Posso esclarecer alguma dúvida?",
    follow: "Olá! Sou " + sender + " e gostaria de saber se faz sentido retomar a conversa sobre o site. Posso ajudar com alguma dúvida?",
    price: "Olá! Sou " + sender + ". O valor depende do escopo. Podemos alinhar as páginas, o conteúdo e o prazo antes do orçamento?",
    close: "Olá! Sou " + sender + ". Vou encerrar o contato por aqui. Agradeço a atenção."
  };
  return text[purpose];
}
export function whatsappLink(contact: Contact | undefined, content: string) {
  if (contact?.kind !== "whatsapp" || !contact.confirmed || !/^\+[1-9]\d{7,14}$/.test(contact.normalized) || !content.trim()) return null;
  return "https://wa.me/" + contact.normalized.slice(1) + "?text=" + encodeURIComponent(content);
}
/** Motivo da falha da leitura automática em palavras do usuário. */
export const readingErrors:Record<string,string>={no_domain:"sem site e sem pesquisa na web ligada",reader_failed:"erro inesperado durante a leitura",lease_exhausted:"o robô parou 3 vezes no meio da leitura",blocked:"empresa marcada como não contatar"};
/** Entidades HTML que sobram em títulos de site (ex.: &#8211;). */
export function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—" };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => code[0] === "#"
    ? String.fromCodePoint(Number(code[1].toLowerCase() === "x" ? "0" + code.slice(1) : code.slice(1)) || 32) : named[code.toLowerCase()] ?? all);
}
/** Link de ação de um canal: abrir conversa, ligar, escrever, abrir perfil. */
export function contactHref(kind: Contact["kind"], normalized: string, value: string) {
  if (kind === "whatsapp" && /^\+[1-9]\d{7,14}$/.test(normalized)) return "https://wa.me/" + normalized.slice(1);
  if (kind === "phone" && /^\+[1-9]\d{7,14}$/.test(normalized)) return "tel:" + normalized;
  if (kind === "email" && normalized.includes("@")) return "mailto:" + normalized;
  if (kind === "instagram" && /^[A-Za-z0-9_.]{1,30}$/.test(normalized)) return "https://www.instagram.com/" + normalized;
  return /^https?:\/\//i.test(value) ? value : null;
}
