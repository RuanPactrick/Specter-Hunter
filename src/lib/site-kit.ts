import "server-only";
import { context } from "./auth";
import { loadContacts, loadEvidence } from "./data";
import { evidenceExpired, type Lead } from "./domain";
import { readFeed } from "./feed-photos";
import { feedPhotoUrls } from "./feed-store";
import { sitePrompt } from "./site-prompt";

/** Tudo o que a Prévia sabe da empresa para montar o site: usado na tela e na pasta para baixar. */
export async function loadSiteKit(lead: Lead) {
  const [evidence, channels, { org }] = await Promise.all([loadEvidence(lead.id), loadContacts(lead.id), context()]);
  const live = evidence.filter(e => !evidenceExpired(e) && e.review !== "inconclusive" && e.review !== "conflict");
  const find = (k: string) => live.find(e => e.kind === k);
  const ident = find("Identidade visual"), maps = find("Google Maps"), ig = find("Perfil do Instagram"), logo = find("Logo");
  const blockedSite = /não permite leitura/.test(find("Leitura do site")?.observed ?? "");
  const feed = readFeed(find("Fotos do Instagram")?.observed);
  const photos = feed?.photos.length ? await feedPhotoUrls(org.id, lead.id) : [];
  const siteColors = ident?.observed.match(/#[0-9A-F]{6}/gi) ?? [];
  // sem cores no site, a paleta que se repete no feed do Instagram serve de identidade
  const colors = siteColors.length ? siteColors : feed?.palette ?? [];
  const fonts = ident?.observed.match(/Fontes: ([^.]+)\./)?.[1].split(/,\s*/) ?? [];
  const rating = maps?.observed.match(/nota ([\d,]+) com (\d+) avalia/);
  const whats = channels.find(c => c.kind === "whatsapp");
  const place = [lead.district, lead.city + " – " + lead.region].filter(Boolean).join(", ");
  const prompt = sitePrompt({ name: lead.name, sector: lead.sector, place, colors, fonts, logo: Boolean(logo?.url),
    rating: rating ? [rating[1], rating[2]] : undefined, address: lead.address || undefined, whatsapp: whats?.value, instagram: Boolean(ig), facts: live,
    photos: feed?.photos.filter(p => photos.some(u => u.n === p.n)), feedStyle: feed?.style || undefined });
  return { org, live, ident, maps, ig, logo, blockedSite, feed, photos, siteColors, colors, fonts, rating, whats, place, prompt };
}
export type SiteKit = Awaited<ReturnType<typeof loadSiteKit>>;

