import { decodeEntities, type Lead } from "./domain";
import type { SiteKit } from "./site-kit";
import { colorRoles } from "./site-prompt";

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "empresa";
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]!);
type KitText = Pick<SiteKit, "colors" | "fonts" | "rating" | "place" | "feed"> & { whatsapp?: string; instagram?: string; facts: { kind: string; observed: string }[]; photoNames: { n: number; file: string }[]; logoFile?: string };

/** Os arquivos de texto da pasta: o prompt final, um guia da identidade, as cores em CSS e a paleta em imagem. */
export function kitTexts(lead: Pick<Lead, "name" | "sector" | "address">, kit: KitText, prompt: string, refs: string[]) {
  const folder = slug(lead.name) + "-site/";
  const roles = kit.colors.map((c, i) => [c, colorRoles[i] ?? "apoio-" + i] as const);
  const photo = (n: number) => kit.feed?.photos.find(p => p.n === n);
  const readme = [
    "# " + lead.name + " · pasta do site", "",
    lead.sector + " em " + kit.place + ".", "",
    "## Como usar",
    "1. Abra o criador de sites (Claude, ChatGPT, Lovable, v0...).",
    "2. Cole o conteúdo de prompt.txt.",
    "3. Anexe " + [kit.logoFile && "o logo", kit.photoNames.length && "as fotos da pasta fotos/", kit.colors.length && "paleta.svg", "os prints das referências"].filter(Boolean).join(", ") + ".", "",
    "## Identidade",
    kit.colors.length ? "Cores: " + roles.map(([c, r]) => c + " (" + r + ")").join(", ") + ". Estão em cores.css e paleta.svg." : "Cores: peça à empresa ou defina com ela.",
    kit.fonts.length ? "Fontes: " + kit.fonts.slice(0, 2).join(" (títulos), ") + (kit.fonts.length > 1 ? " (textos)" : null) + "." : null,
    kit.logoFile ? "Logo: " + kit.logoFile + "." : "Logo: não encontrado. Peça à empresa.",
    kit.feed?.style ? "Estilo do Instagram: " + kit.feed.style + "." : null, "",
    "## Dados da empresa",
    lead.address ? "Endereço: " + lead.address : null,
    kit.whatsapp ? "WhatsApp: " + kit.whatsapp : null,
    kit.instagram ? "Instagram: " + kit.instagram : null,
    kit.rating ? "Google: nota " + kit.rating[1] + " com " + kit.rating[2] + " avaliações" : null,
    ...kit.facts.map(f => "- " + f.kind + ": " + decodeEntities(f.observed).replace(/\s+/g, " ").slice(0, 300)), "",
    kit.photoNames.length ? "## Fotos (Instagram)" : null,
    ...kit.photoNames.map(p => "- fotos/" + p.file + ": " + (photo(p.n)?.use ?? "") + " · " + (photo(p.n)?.description ?? "")),
    kit.photoNames.length ? "Antes de publicar o site de verdade, peça autorização à empresa para usar as fotos." : null, "",
    refs.length ? "## Referências visuais" : null, ...refs.map(r => "- " + r)
  ].filter(l => l !== null).filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
  const css = ":root {\n" + roles.map(([c, r]) => "  --cor-" + r + ": " + c + ";").join("\n") + (kit.fonts.length ? "\n  --fonte-titulos: \"" + kit.fonts[0] + "\", sans-serif;\n  --fonte-textos: \"" + (kit.fonts[1] ?? kit.fonts[0]) + "\", sans-serif;" : "") + "\n}\n";
  const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"" + Math.max(1, roles.length) * 160 + "\" height=\"200\" font-family=\"Arial\" font-size=\"14\">"
    + roles.map(([c, r], i) => "<rect x=\"" + i * 160 + "\" width=\"160\" height=\"140\" fill=\"" + esc(c) + "\"/><text x=\"" + (i * 160 + 10) + "\" y=\"165\">" + esc(c) + "</text><text x=\"" + (i * 160 + 10) + "\" y=\"187\" fill=\"#666\">" + esc(r) + "</text>").join("") + "</svg>";
  return [
    { name: folder + "prompt.txt", data: prompt.trim() + "\n" },
    { name: folder + "LEIA-ME.md", data: readme + "\n" },
    ...(roles.length ? [{ name: folder + "cores.css", data: css }, { name: folder + "paleta.svg", data: svg }] : [])
  ];
}
export const kitFolder = (name: string) => slug(name) + "-site/";
