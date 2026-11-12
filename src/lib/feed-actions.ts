"use server";
import { context } from "./auth";
import { leadPath, loadContacts, loadEvidence, loadLead } from "./data";
import { today } from "./domain";
import { message } from "./forms";
import { aiConfig, geminiFallbacks } from "./assistive";
import { apifyProfile, feedImages, instagramUser } from "./social";
import { analyzeFeed, downloadImage, feedText, pickPhotos } from "./feed-photos";
import { saveFeedPhotos } from "./feed-store";

/** Prévia → "Analisar fotos do Instagram": busca o feed, o Gemini escolhe as fotos e lê a identidade, e as escolhidas ficam guardadas. */
export async function analyzeFeedPhotos(id: string) {
  const path = leadPath(id, "previa");
  const [lead, evidence, channels, { db, org }] = await Promise.all([loadLead(id), loadEvidence(id), loadContacts(id), context()]);
  if (lead.stage === "blocked") message(path, "Empresa marcada como não contatar.");
  const ai = aiConfig(), token = process.env.APIFY_TOKEN;
  if (ai?.provider !== "gemini") message(path, "A análise de fotos usa o Gemini: cadastre GEMINI_API_KEY e ENABLE_ASSISTIVE_AI=true na Vercel.");
  if (!token) message(path, "Cadastre APIFY_TOKEN na Vercel para buscar as fotos do Instagram.");
  const user = [...evidence.filter(e => /Instagram/.test(e.kind)).map(e => e.url), ...channels.filter(c => c.kind === "instagram").map(c => c.value)]
    .map(instagramUser).find(Boolean);
  if (!user) message(path, "Nenhum Instagram da empresa encontrado. Cadastre o @ na aba Contatos e tente de novo.");
  const reservation = await db.rpc("reserve_live_lookup", { p_org: org.id, p_provider: "gemini", p_operation: "assist", p_ref: id });
  if (reservation.error) message(path, reservation.error.code === "P2005" ? "A cota de consultas da IA foi atingida. Tente mais tarde." : "Não foi possível reservar a consulta da IA.");

  let outcome: { text: string; files: { mime: string; bytes: Uint8Array }[] } | string;
  try {
    const posts = feedImages(await apifyProfile(user, token));
    const images = (await Promise.all(posts.map(p => downloadImage(p.image)))).filter(i => i !== null);
    if (!images.length) outcome = "O Instagram @" + user + " não tem fotos públicas para analisar (perfil privado, sem posts ou fora do ar).";
    else {
      const analysis = await analyzeFeed(images, { name: lead.name, sector: lead.sector }, ai.key, [ai.model, ...geminiFallbacks]);
      const picked = pickPhotos(analysis);
      outcome = { text: feedText(analysis, picked), files: picked.map(p => images[p.index]) };
    }
  } catch (cause) {
    console.error("Análise do feed falhou:", cause instanceof Error ? cause.message : cause);
    outcome = cause instanceof Error && cause.message === "provider_429" ? "O limite da IA foi atingido. Tente em alguns minutos." : "Não foi possível analisar as fotos agora. Tente de novo.";
  }
  if (typeof outcome === "string") message(path, outcome);
  try { await saveFeedPhotos(org.id, id, outcome.files); }
  catch { message(path, "As fotos foram analisadas, mas o armazenamento recusou. Confira SUPABASE_SERVICE_ROLE_KEY na Vercel."); }
  const { error } = await db.from("evidence_items").insert({ organization_id: org.id, lead_id: id, kind: "Fotos do Instagram", observed: outcome.text,
    url: "https://www.instagram.com/" + user, source_label: "Instagram @" + user + " · análise do Gemini", consulted_on: today(),
    method: "Fotos públicas dos últimos posts analisadas pelo Gemini", confidence: "pendente" });
  if (error) message(path, "As fotos foram guardadas, mas a análise não foi salva. Tente de novo.");
  message(path, outcome.files.length + " fotos do feed escolhidas e identidade visual lida.", true);
}
