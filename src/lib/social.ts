// Instagram e anúncios da Meta pelo Apify, portados do prospeccao-kit-aluno (lib/instagram.mjs, lib/anuncios.mjs).
// Perfil parado há meses é argumento de venda; anúncio ativo diz que alguém já cuida do tráfego.
import { z } from "zod";
import type { EvidenceRow } from "./enrichment";
import { jsonRequest } from "./providers";
import { brand, normal } from "./research";

const day = 86_400_000;
export const adsPerCompany = 5;   // o ator cobra por anúncio devolvido: para dizer "anuncia", 5 bastam
// Corta por caractere: cortar no meio de um emoji deixa surrogate solto e o Postgres recusa o jsonb inteiro.
const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]|\x00/g;
export const cut = (t: string | null | undefined, n: number) => Array.from(String(t ?? "").replace(lone, "")).slice(0, n).join("");

/** "https://www.instagram.com/clinica.ospe/?hl=pt" → "clinica.ospe". Link de post, reel ou explorar não é perfil. */
export function instagramUser(link: string | null | undefined) {
  const u = String(link ?? "").match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/i)?.[1]?.toLowerCase();
  return u && !["p", "reel", "reels", "explore", "stories", "tv", "accounts", "direct"].includes(u) ? u : null;
}

async function apifyRun<T>(actor: string, input: unknown, schema: z.ZodType<T>, token: string, fetcher = fetch) {
  return jsonRequest("https://api.apify.com/v2/acts/" + actor + "/run-sync-get-dataset-items", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(input),
  }, schema, fetcher, 90000);
}

const text = z.string().max(5000).nullish();
const profileSchema = z.array(z.object({
  username: text, fullName: text, followersCount: z.number().nullish(), followsCount: z.number().nullish(), postsCount: z.number().nullish(),
  verified: z.boolean().nullish(), isBusinessAccount: z.boolean().nullish(), businessCategoryName: text, biography: text, externalUrl: text, error: text,
  latestPosts: z.array(z.object({ timestamp: text, likesCount: z.number().nullish(), commentsCount: z.number().nullish() })).max(50).nullish(),
})).max(5);
export type RawProfile = z.output<typeof profileSchema>[number];
export const apifyProfile = async (user: string, token: string, fetcher = fetch) =>
  (await apifyRun("apify~instagram-profile-scraper", { usernames: [user] }, profileSchema, token, fetcher)).find(p => p.username?.toLowerCase() === user) ?? null;

export type Profile = { user: string; name: string | null; followers: number; posts: number | null; bio: string | null; link: string | null;
  lastPost: string | null; idleDays: number | null; posts30: number; likes: number | null; comments: number | null };
/** O perfil cru vira o que a prospecção usa. `null` se não existe ou é privado. */
export function summarizeProfile(p: RawProfile | null, now = Date.now()): Profile | null {
  if (!p || p.error || p.followersCount == null || !p.username) return null;
  const posts = (p.latestPosts ?? []).filter(x => x.timestamp && !Number.isNaN(Date.parse(x.timestamp))).sort((a, b) => b.timestamp!.localeCompare(a.timestamp!));
  const last = posts[0]?.timestamp ?? null;
  const avg = (k: "likesCount" | "commentsCount") => { const v = posts.map(x => x[k]).filter((n): n is number => n != null && n >= 0); return v.length ? Math.round(v.reduce((s, n) => s + n, 0) / v.length) : null; };
  return { user: p.username.toLowerCase(), name: cut(p.fullName, 200) || null, followers: p.followersCount, posts: p.postsCount ?? null, bio: cut(p.biography, 500) || null,
    link: p.externalUrl || null, lastPost: last, idleDays: last ? Math.floor((now - Date.parse(last)) / day) : null,
    posts30: posts.filter(x => now - Date.parse(x.timestamp!) <= 30 * day).length, likes: avg("likesCount"), comments: avg("commentsCount") };
}

/** O @ que veio da pesquisa é mesmo da empresa? Marca no @ ou no nome/bio, o site no link da bio ou o telefone na bio. */
export function profileMatches(p: Profile, name: string, domain: string | null, phones: string[]) {
  const tokens = brand(name);
  const all = normal(p.user + " " + (p.name ?? "") + " " + (p.bio ?? "") + " " + (p.link ?? ""));
  if (tokens.some(t => p.user.replace(/[._]/g, "").includes(t)) || tokens.every(t => all.includes(t))) return true;
  if (domain && (p.link ?? "").toLowerCase().includes(domain)) return true;
  const bio = (p.bio ?? "").replace(/\D/g, "");
  return phones.some(t => { const tail = t.replace(/\D/g, "").slice(-8); return tail.length === 8 && bio.includes(tail); });
}

const thousands = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(".", ",").replace(/,0$/, "") + " mi" : n >= 1000 ? (n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(".", ",").replace(/,0$/, "") + " mil" : String(n);
/** "2,3 mil seguidores, 412 posts. Último post há 94 dias: perfil parado." */
export function explainProfile(p: Profile) {
  let t = thousands(p.followers) + " seguidores, " + (p.posts ?? "?") + " posts.";
  if (p.idleDays == null) t += " Nenhum post visível.";
  else if (p.idleDays > 30) t += " Último post há " + p.idleDays + " dias: perfil parado.";
  else t += " " + p.posts30 + " post" + (p.posts30 === 1 ? "" : "s") + " nos últimos 30 dias.";
  if (p.likes != null && p.followers > 0) t += " Média de " + p.likes + " curtidas por post (" + (((p.likes + (p.comments ?? 0)) / p.followers) * 100).toFixed(1).replace(".", ",") + "% de engajamento).";
  if (!p.link) t += " Sem link na bio.";
  return t;
}

export const adsLibraryUrl = (name: string) => "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all&search_type=keyword_exact_phrase&q=" + encodeURIComponent('"' + name + '"');
const card = z.object({ linkUrl: text, caption: text, body: text });
const adsSchema = z.array(z.object({
  adArchiveID: z.union([z.string(), z.number()]).nullish(), adArchiveId: z.union([z.string(), z.number()]).nullish(), pageName: text, startDateFormatted: text,
  publisherPlatform: z.array(z.string().max(60)).max(10).nullish(),
  snapshot: z.object({ pageName: text, linkUrl: text, caption: text, cards: z.array(card).max(20).nullish(), body: z.object({ text }).nullish() }).nullish(),
})).max(adsPerCompany * 4);
export type RawAd = z.output<typeof adsSchema>[number];
/** Busca pelo NOME: a empresa costuma anunciar com outra página (a do dono, a da agência). Cada anúncio passa por isCompanyAd. */
export const apifyAds = (name: string, token: string, fetcher = fetch) =>
  apifyRun("apify~facebook-ads-scraper", { startUrls: [{ url: adsLibraryUrl(name) }], resultsLimit: adsPerCompany, activeStatus: "active" }, adsSchema, token, fetcher);

export function isCompanyAd(ad: RawAd, name: string, domain: string | null, instagram: string | null) {
  const s = ad.snapshot ?? {};
  const page = normal(s.pageName ?? ad.pageName ?? "");
  const tokens = brand(name);
  if (tokens.length && tokens.every(t => page.includes(t))) return true;
  const links = [s.linkUrl, s.caption, ...(s.cards ?? []).flatMap(c => [c.linkUrl, c.caption])].map(x => String(x ?? "").toLowerCase()).join(" ");
  if (domain && links.includes(domain)) return true;
  return Boolean(instagram && page.replace(/ /g, "") === instagram.replace(/[._]/g, ""));
}
export function summarizeAds(ads: RawAd[], name: string, domain: string | null, instagram: string | null) {
  const valid = ads.filter(a => a.adArchiveID ?? a.adArchiveId);
  const mine = valid.filter(a => isCompanyAd(a, name, domain, instagram));
  const pageOf = (a: RawAd) => cut(a.snapshot?.pageName ?? a.pageName, 120);
  return { active: mine.length, atLimit: mine.length >= adsPerCompany, pages: [...new Set(mine.map(pageOf).filter(Boolean))],
    since: mine.map(a => a.startDateFormatted).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
    citedBy: [...new Set(valid.filter(a => !mine.includes(a)).map(pageOf).filter(Boolean))].slice(0, 5) };
}
export function explainAds(r: ReturnType<typeof summarizeAds>, name: string) {
  if (!r.active) return "Nenhum anúncio ativo com o nome \"" + name + "\" na Biblioteca da Meta." + (r.citedBy.length ? " O nome aparece em anúncio de outra página (" + r.citedBy.join(", ") + "), que não conta." : "") + " Pode anunciar com um nome bem diferente: confira antes de afirmar na abordagem.";
  const count = r.atLimit ? adsPerCompany + " ou mais anúncios ativos" : r.active + " anúncio" + (r.active === 1 ? "" : "s") + " ativo" + (r.active === 1 ? "" : "s");
  const since = r.since && /^\d{4}-\d{2}-\d{2}/.test(r.since) ? ", rodando desde " + r.since.slice(8, 10) + "/" + r.since.slice(5, 7) + "/" + r.since.slice(0, 4) : "";
  return "Anuncia agora: " + count + " na Meta" + since + ", pela página " + r.pages.join(", ") + ". Alguém já cuida do tráfego.";
}

// undefined = não consultado (cota ou Apify fora): não vira evidência, para não afirmar "não anuncia" sem ter olhado
type Deps = { profile: (user: string) => Promise<RawProfile | null | undefined>; ads: (name: string) => Promise<RawAd[] | undefined> };
/**
 * Lê o perfil (se há @) e procura anúncios pelo nome. `fromSearch`: o @ veio da pesquisa, então só fica se o perfil for da empresa.
 * Devolve as evidências, se o @ foi descartado e quantos anúncios ativos a empresa tem.
 */
export async function socialLead(lead: { name: string; phones: string[] }, instagram: string | null, fromSearch: boolean, domain: string | null, deps: Deps) {
  const evidence: EvidenceRow[] = [];
  const user = instagramUser(instagram);
  let dropped = false;
  const raw = user ? await deps.profile(user) : undefined;
  if (user && raw !== undefined) {
    const p = summarizeProfile(raw);
    if (!p) evidence.push({ kind: "Perfil do Instagram", observed: "O perfil @" + user + " não foi encontrado, é privado ou foi removido.", url: "https://www.instagram.com/" + user, excerpt: null });
    else if (fromSearch && !profileMatches(p, lead.name, domain, lead.phones)) {
      dropped = true;
      evidence.push({ kind: "Instagram descartado", observed: "O perfil @" + user + " achado na pesquisa (" + (p.name ?? "sem nome") + ") não mostra a marca, o site nem o telefone da empresa.", url: "https://www.instagram.com/" + user, excerpt: null });
    } else evidence.push({ kind: "Perfil do Instagram", observed: "@" + user + ": " + explainProfile(p), url: "https://www.instagram.com/" + user, excerpt: p.bio ? cut(p.bio, 300) : null });
  }
  const rawAds = await deps.ads(lead.name);
  const ads = rawAds ? summarizeAds(rawAds, lead.name, domain, dropped ? null : user) : null;
  if (ads) evidence.push({ kind: "Anúncios na Meta", observed: explainAds(ads, lead.name), url: adsLibraryUrl(lead.name), excerpt: null });
  return { evidence, dropped, adsActive: ads?.active ?? 0 };
}
