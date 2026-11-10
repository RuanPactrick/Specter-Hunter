// Busca de empresas no Google Maps pelo Apify (compass~crawler-google-places), portada do prospeccao-kit-aluno (lib/places.mjs).
// O Apify devolve o mesmo place id do Google ("ChIJ…"): a mesma empresa não entra duas vezes entre pesquisas.
import { z } from "zod";
import { domain, phone, publicUrl, today } from "./domain";
import { jsonRequest } from "./providers";

const text = z.string().max(2000).nullish();
const placesSchema = z.array(z.object({
  placeId: text, title: text, categoryName: text, address: text, neighborhood: text, city: text, phone: text, phoneUnformatted: text,
  website: text, url: text, totalScore: z.number().nullish(), reviewsCount: z.number().nullish(),
  permanentlyClosed: z.boolean().nullish(), temporarilyClosed: z.boolean().nullish(),
})).max(200);
export type Place = z.output<typeof placesSchema>[number];

/** Uma execução do ator. O Apify cobra por empresa: não pede mais que o necessário. */
export async function apifyMaps(query: string, max: number, token: string, fetcher = fetch) {
  return jsonRequest("https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    // só a lista: sem foto, sem avaliação e sem página de detalhe, que cobram à parte
    body: JSON.stringify({ searchStringsArray: [query], maxCrawledPlacesPerSearch: max, language: "pt-BR", countryCode: "br", maxImages: 0, maxReviews: 0, scrapeContacts: false }),
  }, placesSchema, fetcher, 240000);
}

// "Site" no Maps que é rede social ou agregador não vira domínio da empresa: vira só uma pista na evidência.
const notSite = ["wa.me", "api.whatsapp.com", "whatsapp.com", "instagram.com", "facebook.com", "fb.me", "linktr.ee", "linkr.bio", "bio.link", "beacons.ai",
  "linkedin.com", "youtube.com", "t.me", "twitter.com", "x.com", "tiktok.com", "business.site", "negocio.site"];
export function siteDomain(url: string | null | undefined) {
  const d = url ? domain(url) : null;
  return d && !notSite.some(s => d === s || d.endsWith("." + s)) ? d : null;
}

type Job = { segment: string; city: string; region: string };
/** O lugar do Maps vira o cadastro que o create_lead espera, mais o texto da evidência. Fechado ou sem nome fica de fora. */
export function placeToLead(p: Place, job: Job) {
  const name = p.title?.trim().slice(0, 160);
  if (!p.placeId || !name || p.permanentlyClosed || p.temporarilyClosed) return null;
  const site = siteDomain(p.website);
  const maps = p.url ? publicUrl(p.url) : null;
  const tel = phone(p.phoneUnformatted ?? p.phone ?? "");
  const contacts = [
    ...(tel ? [{ kind: "phone", value: tel.value, normalized: tel.normalized }] : []),
    ...(site ? [{ kind: "website", value: "https://" + site, normalized: "https://" + site }] : []),
    ...(maps ? [{ kind: "maps", value: maps, normalized: maps }] : []),
  ];
  const rating = p.totalScore != null && p.reviewsCount ? "nota " + p.totalScore.toFixed(1).replace(".", ",") + " com " + p.reviewsCount + " avaliações" : "sem avaliações";
  const social = !site && p.website ? "; o link cadastrado como site é rede social ou agregador (" + p.website.slice(0, 200) + ")" : "";
  return {
    place_id: p.placeId,
    lead: { name, sector: job.segment.slice(0, 100), city: (p.city?.trim() || job.city).slice(0, 100), region: job.region,
      district: (p.neighborhood ?? "").slice(0, 100), address: (p.address ?? "").slice(0, 250), domain: site,
      source_label: "Google Maps via Apify", source_url: maps, consulted_on: today(), contacts },
    observed: "Encontrada no Google Maps" + (p.categoryName ? " como " + p.categoryName : "") + ": " + rating + (p.address ? "; " + p.address : "") + (site ? "; site " + site : "; sem site no Maps") + social + ".",
  };
}
