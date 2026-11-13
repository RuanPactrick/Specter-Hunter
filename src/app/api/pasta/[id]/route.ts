import { z } from "zod";
import { loadLead } from "@/lib/data";
import { readPublicImage } from "@/lib/reader";
import { feedPhotoFiles } from "@/lib/feed-store";
import { loadSiteKit } from "@/lib/site-kit";
import { kitFolder, kitTexts } from "@/lib/kit-files";
import { zip } from "@/lib/zip";

const kinds = new Set(["Google Maps", "Cadastro na Receita", "Leitura do site", "Perfil do Instagram", "Identidade visual"]);
/** Prévia → "Baixar pasta do site": prompt final (como está na tela), logo, cores, fotos escolhidas e um guia. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await request.formData().catch(() => null);
  const input = z.object({ prompt: z.string().trim().min(1).max(4000), refs: z.string().max(600) })
    .safeParse({ prompt: form?.get("prompt"), refs: form?.get("refs") ?? "" });
  if (!z.uuid().safeParse(id).success || !input.success) return new Response("Pedido inválido.", { status: 400 });
  const lead = await loadLead(id); // só a organização do usuário enxerga a empresa
  const kit = await loadSiteKit(lead);
  const folder = kitFolder(lead.name);
  const [logo, photos] = await Promise.all([
    kit.logo?.url ? readPublicImage(kit.logo.url).catch(() => null) : null,
    kit.photos.length ? feedPhotoFiles(kit.org.id, lead.id) : []
  ]);
  const files = [
    ...kitTexts(lead, { colors: kit.colors, fonts: kit.fonts, rating: kit.rating, place: kit.place, feed: kit.feed, whatsapp: kit.whats?.value, instagram: kit.ig?.url ?? undefined,
      facts: kit.live.filter(e => kinds.has(e.kind)), photoNames: photos, logoFile: logo ? "logo." + logo.ext : undefined },
      input.data.prompt, input.data.refs.split("\n").map(r => r.trim()).filter(Boolean)),
    ...(logo ? [{ name: folder + "logo." + logo.ext, data: logo.bytes }] : []),
    ...photos.map(p => ({ name: folder + "fotos/" + p.file, data: p.bytes }))
  ];
  return new Response(zip(files), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=\"" + folder.slice(0, -1) + ".zip\"", "Cache-Control": "private, no-store" } });
}
