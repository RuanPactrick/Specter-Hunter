import "server-only";
import { createClient } from "@supabase/supabase-js";

// As fotos do feed não são material autorizado (brand_assets exige autorização), então ficam numa pasta própria,
// gravada e lida pelo servidor com a chave de serviço depois de conferir que o usuário é da organização.
const bucket = "specter-materials";
const folder = (org: string, lead: string) => org + "/" + lead + "/instagram";
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from(bucket) : null;
}
const ext = (mime: string) => mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

/** Troca as fotos guardadas da empresa pelas novas (1.jpg, 2.jpg... na ordem da análise). */
export async function saveFeedPhotos(org: string, lead: string, files: { mime: string; bytes: Uint8Array }[]) {
  const store = admin();
  if (!store) throw new Error("no_service_key");
  const old = await store.list(folder(org, lead), { limit: 50 });
  if (old.data?.length) await store.remove(old.data.map(f => folder(org, lead) + "/" + f.name));
  for (const [i, f] of files.entries()) {
    const up = await store.upload(folder(org, lead) + "/" + (i + 1) + "." + ext(f.mime), f.bytes, { contentType: f.mime, upsert: true, cacheControl: "3600" });
    if (up.error) throw new Error("storage");
  }
}

/** Links temporários (1 hora) das fotos guardadas, na ordem 1, 2, 3... */
export async function feedPhotoUrls(org: string, lead: string) {
  const store = admin();
  if (!store) return [];
  const { data } = await store.list(folder(org, lead), { limit: 50 });
  const names = (data ?? []).map(f => f.name).filter(n => /^\d+\.(jpg|png|webp)$/.test(n)).sort((a, b) => parseInt(a) - parseInt(b));
  if (!names.length) return [];
  const signed = await store.createSignedUrls(names.map(n => folder(org, lead) + "/" + n), 3600);
  return (signed.data ?? []).flatMap((s, i) => s.signedUrl ? [{ n: parseInt(names[i]), url: s.signedUrl }] : []);
}

/** As fotos guardadas em si, para a pasta do site. */
export async function feedPhotoFiles(org: string, lead: string) {
  const store = admin();
  if (!store) return [];
  const { data } = await store.list(folder(org, lead), { limit: 50 });
  const names = (data ?? []).map(f => f.name).filter(n => /^\d+\.(jpg|png|webp)$/.test(n));
  const files = await Promise.all(names.map(async name => {
    const { data: blob } = await store.download(folder(org, lead) + "/" + name);
    return blob ? [{ n: parseInt(name), file: name, bytes: new Uint8Array(await blob.arrayBuffer()) }] : [];
  }));
  return files.flat().sort((a, b) => a.n - b.n);
}
