// Pesquisa na web do que o site não trouxe: o site de quem não informou domínio, o Instagram e o CNPJ.
// Portado do prospeccao-kit-aluno (lib/pesquisa.mjs, lib/cnpj.mjs). Achado da pesquisa é pista:
// o site só conta se o telefone bater com um do lead, e o CNPJ só se a cidade da Receita bater com a do lead.
import { z } from "zod";
import { contactValue, nameKey } from "./domain";
import { readSite, type ContactRow, type EvidenceRow, type SiteRead } from "./enrichment";
import { jsonRequest, ProviderError, type WebResult } from "./providers";

export type LeadRef = { name: string; city: string; region: string; phones: string[] };
export type Receita = { cnpj: string; razao_social: string | null; nome_fantasia: string | null; situacao: string | null; abertura: string | null;
  porte: string | null; atividade: string | null; municipio: string | null; uf: string | null; decisor: string | null };
type Deps = { search: (q: string) => Promise<WebResult[]>; read?: typeof readSite; receita?: (cnpj: string) => Promise<Receita | null> };

export const normal = (s: string) => nameKey(s.replace(/<[^>]*>/g, " ")).replace(/[^a-z0-9]+/g, " ").trim();
const generic = new Set(["clinica", "clinicas", "odontologia", "odontologica", "odonto", "consultorio", "dentista", "dr", "dra", "centro", "studio", "estudio",
  "de", "da", "do", "das", "dos", "e", "em", "ltda", "me", "the", "loja", "casa"]);
/** As palavras que identificam a marca: "Clínica OSPE" → ["ospe"]. Sem palavra própria, fica o nome inteiro. */
export function brand(name: string) {
  const parts = normal(name).split(" ").filter(p => p.length > 2 && !generic.has(p));
  return parts.length ? parts : normal(name).split(" ").filter(p => p.length > 2);
}
const notSite = ["instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "linkedin.com", "wa.me", "whatsapp.com",
  "google.com", "goo.gl", "g.page", "waze.com", "tripadvisor", "ifood.com.br", "rappi", "ubereats", "apontador.com.br", "yelp", "guiamais.com.br", "telelistas",
  "solutudo", "doctoralia", "boaconsulta", "reclameaqui", "cnpj.biz", "casadosdados", "econodata", "empresaqui", "cnpja", "cnpj.ws", "consultasocio", "jusbrasil",
  "escavador", "wikipedia", "mercadolivre", "olx.com.br", "gov.br", "infobel", "cylex", "hotfrog", "encontra", "listamais", "kekanto", "foursquare", "glassdoor",
  "indeed", "catho", "infojobs", "linktr.ee", "linkin.bio", "bio.site", "beacons.ai", "taplink"];
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Primeiro resultado cujo domínio ou título carrega a marca, fora de redes, diretórios e cadastros de CNPJ. */
export function pickSite(results: WebResult[], name: string) {
  const tokens = brand(name);
  for (const r of results) {
    const h = host(r.url);
    if (!h || notSite.some(d => h.includes(d))) continue;
    const glued = h.replace(/[^a-z0-9]/g, "");
    const target = normal(h.replace(/\./g, " ") + " " + r.title);
    if (tokens.some(t => glued.includes(t)) || tokens.every(t => target.includes(t))) return h;
  }
  return null;
}

const notProfile = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "direct", "popular"]);
/** O @ que carrega a marca: 2 pontos no @, 2 no título e trecho, 1 pela cidade. Abaixo de 2 não é dela. */
export function pickInstagram(results: WebResult[], name: string, city: string) {
  const tokens = brand(name), place = normal(city);
  const score = new Map<string, number>();
  for (const r of results) {
    const isInsta = /instagram\.com/i.test(r.url);
    const users: string[] = [];
    const fromLink = r.url.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})\/?(?:$|\?)/i)?.[1]?.toLowerCase();
    if (fromLink && !notProfile.has(fromLink)) users.push(fromLink);
    for (const m of (r.title + " " + r.description).matchAll(/\(@([A-Za-z0-9_.]{2,30})\)|@([A-Za-z0-9_.]{3,30})/g)) {
      const u = (m[1] ?? m[2]).replace(/\.$/, "").toLowerCase();
      if (!notProfile.has(u) && !users.includes(u)) users.push(u);
    }
    const text = normal(r.title + " " + r.description);
    for (const u of users) {
      if (!isInsta && !r.title.includes("@" + u)) continue;   // @ solto em site qualquer não serve
      let p = 0;
      if (tokens.some(t => u.replace(/[._]/g, "").includes(t))) p += 2;
      if (tokens.every(t => text.includes(t))) p += 2;
      if (place && text.includes(place)) p += 1;
      score.set(u, Math.max(score.get(u) ?? 0, p));
    }
  }
  const best = [...score].sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

/** Dígito verificador: descarta número torto de resultado de busca antes de consultar a Receita. */
export function validCnpj(value: string) {
  const c = value.replace(/\D/g, "");
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base: string) => {
    const w = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const rest = [...base].reduce((s, d, i) => s + Number(d) * w[i], 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}
export function cnpjCandidates(results: WebResult[]) {
  const seen = new Set<string>();
  for (const r of results) for (const m of (r.title + " " + r.description + " " + r.url).matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)) {
    const c = m[0].replace(/\D/g, "");
    if (validCnpj(c)) seen.add(c);
  }
  return [...seen].slice(0, 4);
}
export const formatCnpj = (c: string) => c.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

const brasilApi = z.object({
  cnpj: z.string(), razao_social: z.string().nullish(), nome_fantasia: z.string().nullish(), descricao_situacao_cadastral: z.string().nullish(),
  data_inicio_atividade: z.string().nullish(), porte: z.string().nullish(), cnae_fiscal_descricao: z.string().nullish(), municipio: z.string().nullish(), uf: z.string().nullish(),
  qsa: z.array(z.object({ nome_socio: z.string().nullish(), qualificacao_socio: z.string().nullish() })).max(100).nullish(),
});
/** BrasilAPI: dados públicos da Receita, sem chave. CNPJ inexistente devolve null. */
export async function receita(cnpj: string, fetcher = fetch): Promise<Receita | null> {
  try {
    const j = await jsonRequest("https://brasilapi.com.br/api/cnpj/v1/" + cnpj.replace(/\D/g, ""), { headers: { Accept: "application/json", "User-Agent": "SpecterHunter/0.1" } }, brasilApi, fetcher);
    const partners = j.qsa ?? [];
    const boss = partners.find(s => /administrador/i.test(s.qualificacao_socio ?? "")) ?? partners[0];
    return { cnpj: formatCnpj(j.cnpj), razao_social: j.razao_social ?? null, nome_fantasia: j.nome_fantasia || null, situacao: j.descricao_situacao_cadastral ?? null,
      abertura: j.data_inicio_atividade ?? null, porte: j.porte ?? null, atividade: j.cnae_fiscal_descricao ?? null, municipio: j.municipio ?? null, uf: j.uf ?? null,
      decisor: boss?.nome_socio ?? null };
  } catch (e) {
    if (e instanceof ProviderError && e.code === "not_found") return null;
    throw e;
  }
}
/** O lead não guarda CEP: confere cidade e UF da Receita com as do lead. */
export const sameCity = (lead: LeadRef, r: Receita) => Boolean(r.municipio) && normal(r.municipio!) === normal(lead.city) && (!r.uf || r.uf === lead.region);
/** Telefone do site bate com um do lead? Os 8 últimos dígitos bastam (DDD e o 9 variam na escrita). */
export function samePhone(lead: LeadRef, site: SiteRead) {
  if (!site.ok) return false;
  const tail = (t: string) => t.replace(/\D/g, "").slice(-8);
  const mine = new Set(lead.phones.map(tail).filter(t => t.length === 8));
  return [...site.found.phones, site.found.whatsapp ?? ""].some(t => t && mine.has(tail(t)));
}

/**
 * Até 4 buscas por lead, reaproveitadas entre site, Instagram e CNPJ. `site` é a leitura do domínio informado (ou null).
 * Devolve evidências e contatos pendentes, o site confirmado pelo telefone (quando não havia domínio) e os sinais para a nota.
 */
export async function researchLead(lead: LeadRef, site: SiteRead | null, deps: Deps) {
  const read = deps.read ?? readSite, lookup = deps.receita ?? receita;
  const evidence: EvidenceRow[] = [], contacts: ContactRow[] = [];
  const cache = new Map<string, WebResult[]>();
  const search = async (q: string) => { q = q.replace(/\s+/g, " ").trim(); if (!cache.has(q)) cache.set(q, await deps.search(q)); return cache.get(q)!; };
  const where = lead.city + " " + lead.region;
  const base = await search(lead.name + " " + where);
  let confirmed: SiteRead | null = null;

  if (!site?.ok) {
    const domain = pickSite([...base, ...(await search(lead.name + " " + where + " site oficial"))], lead.name);
    if (domain) {
      const candidate = await read(domain);
      if (samePhone(lead, candidate)) {
        confirmed = candidate;
        evidence.push({ kind: "Site achado na pesquisa", observed: "A pesquisa na web achou " + domain + " e o telefone publicado nele confere com um telefone do lead.", url: candidate.ok ? candidate.url : null, excerpt: null });
      } else {
        evidence.push({ kind: "Possível domínio", observed: "A pesquisa na web achou " + domain + ", mas " + (candidate.ok ? "nenhum telefone dele confere com os do lead" : "o site não respondeu") + ". Confirme antes de usar.", url: "https://" + domain, excerpt: null });
      }
    }
  }

  const current = confirmed ?? site;
  let instagram = current?.ok ? current.found.instagram : null;
  if (!instagram) {
    const user = pickInstagram([...base, ...(await search("site:instagram.com " + lead.name + " " + lead.city))], lead.name, lead.city);
    if (user) {
      instagram = "https://www.instagram.com/" + user;
      const c = contactValue("instagram", instagram);
      if (c) contacts.push({ kind: "instagram", ...c });
      evidence.push({ kind: "Instagram achado na pesquisa", observed: "A pesquisa na web indica o perfil @" + user + ". O vínculo com a empresa não foi conferido.", url: instagram, excerpt: null });
    }
  }

  let fromSite = current?.ok ? current.found.cnpj?.replace(/\D/g, "") ?? null : null;
  if (fromSite && !validCnpj(fromSite)) fromSite = null;
  let company: Receita | null = null, note: string | null = null;
  if (fromSite) {
    company = await lookup(fromSite);
    if (company && !sameCity(lead, company)) note = "O CNPJ publicado no site está registrado em " + company.municipio + "/" + company.uf + ", fora da cidade do lead.";
    if (!company) note = "O CNPJ " + formatCnpj(fromSite) + " publicado no site não consta na Receita.";
  } else {
    const tried = cnpjCandidates([...base, ...(await search("CNPJ " + lead.name + " " + lead.city))]);
    for (const c of tried) {
      const r = await lookup(c);
      if (r && sameCity(lead, r)) { company = r; break; }
    }
    if (!company && tried.length) note = "A pesquisa achou " + tried.length + " CNPJ, nenhum registrado na cidade do lead.";
  }
  if (company && !note) {
    evidence.push({ kind: "Cadastro na Receita", url: "https://brasilapi.com.br/api/cnpj/v1/" + company.cnpj.replace(/\D/g, ""), excerpt: null,
      observed: [company.cnpj + " (" + (fromSite ? "publicado no site" : "achado na pesquisa, cidade confere") + ")", company.razao_social && "razão social " + company.razao_social,
        company.nome_fantasia && "fantasia " + company.nome_fantasia, company.situacao && "situação " + company.situacao, company.abertura && "aberta em " + company.abertura.slice(0, 4),
        company.porte && "porte " + company.porte, company.atividade && "atividade " + company.atividade, company.decisor && "sócio-administrador " + company.decisor].filter(Boolean).join("; ") + "." });
  } else if (note) evidence.push({ kind: "CNPJ não confirmado", observed: note, url: null, excerpt: null });

  return { evidence, contacts, site: confirmed, extra: { instagram: Boolean(instagram), cnpj: Boolean(company && !note) }, searches: cache.size };
}
