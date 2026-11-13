import { decodeEntities } from "./domain";

/** Como o site deve ser construído: dito explicitamente para o criador de sites não escolher sozinho. */
export const siteStack = "Tecnologia: um único arquivo index.html com HTML5 semântico, CSS moderno (variáveis, Grid, Flexbox e clamp() para tipografia fluida) e JavaScript puro só para o menu no celular, rolagem suave e animações discretas com IntersectionObserver. Sem frameworks, sem etapa de build e sem bibliotecas externas além do Google Fonts. Mobile-first e responsivo de 360px a 1440px, imagens com loading=\"lazy\" e texto alternativo, contraste WCAG AA, foco visível, meta tags de título e descrição e <meta name=\"robots\" content=\"noindex\">.";
const avoid = ["degradê roxo e azul genérico no topo", "foto de banco de imagem com sorriso perfeito", "três cartões iguais com ícone e frase vaga", "depoimentos inventados e “agende já” repetido"];
// achado que só diz o que falta não ajuda a construir o site
const empty = /^(não|nenhum|sem )|não (encontr|permite|respond|possui|tem )|fora do ar|falhou|bloque/i;
const useful = new Set(["Google Maps", "Cadastro na Receita", "Leitura do site"]);

// só a parte que vira conteúdo do site (sem HTTP, CNPJ ou porte)
function fact({ kind, observed }: { kind: string; observed: string }) {
  const t = decodeEntities(observed).trim();
  if (kind === "Leitura do site") { const title = t.match(/Título: (.+?)\.?$/)?.[1]; return title ? "título do site atual: " + title : ""; }
  if (kind === "Cadastro na Receita") { const year = t.match(/aberta em (\d{4})/)?.[1]; return year ? "no mercado desde " + year : ""; }
  return t.replace(/^Encontrada no Google Maps como /, "Google: ");
}

export type SiteFacts = {
  name: string; sector: string; place: string;
  colors: string[]; fonts: string[]; logo: boolean;
  rating?: [string, string]; address?: string; whatsapp?: string; instagram: boolean;
  facts: { kind: string; observed: string }[];
  photos?: { use: string; description: string }[]; feedStyle?: string;
};

/** Prompt do site com só o que ajuda a construir: o que não foi encontrado fica de fora em vez de virar "não encontrado". */
export const colorRoles = ["principal", "apoio", "destaque", "fundo"];
export function sitePrompt(s: SiteFacts) {
  const roles = colorRoles;
  const identity = [
    s.colors.length && "cores " + s.colors.map((c, i) => c + " (" + (roles[i] ?? "apoio") + ")").join(", "),
    s.fonts.length && "fontes " + s.fonts.slice(0, 2).join(" para títulos e ") + (s.fonts.length === 1 ? " em tudo" : " para textos"),
    s.logo && "use o logo anexado"
  ].filter(Boolean);
  const sections = ["início com a proposta em uma frase", "serviços", "sobre", s.rating && "avaliações", s.address && "como chegar com mapa", "contato"].filter(Boolean);
  const facts = s.facts.filter(f => useful.has(f.kind) && !empty.test(f.observed)).map(fact).filter(Boolean).slice(0, 5);
  const extras = [
    s.rating && "abrir com a nota " + s.rating[0] + " (" + s.rating[1] + " avaliações no Google)",
    s.whatsapp && "botão de WhatsApp (" + s.whatsapp + ") fixo no celular e no topo e rodapé",
    s.instagram && !s.photos?.length && "fotos reais do Instagram da empresa no lugar de banco de imagens",
    s.address && "endereço " + s.address + " com link de rotas"
  ].filter(Boolean);
  return [
    "Crie um site one-page para " + s.name + ", " + s.sector.toLowerCase() + " em " + s.place + ". Objetivo: transformar visitas em " + (s.whatsapp ? "conversas no WhatsApp" : "contatos") + ".",
    siteStack,
    identity.length ? "Identidade: " + identity.join("; ") + "." : "",
    s.feedStyle ? "Estilo visual que a empresa já usa no Instagram: " + s.feedStyle + "." : "",
    s.photos?.length ? "Fotos reais anexadas, na ordem: " + s.photos.map((p, i) => (i + 1) + ") " + p.use + ": " + p.description).join("; ") + ". Use essas fotos no lugar de banco de imagens, a 1 no topo." : "",
    "Seções: " + sections.join(", ") + ".",
    facts.length ? "Dados reais para usar no texto: " + facts.join(" | ") : "",
    extras.length ? "Diferenciais: " + extras.join("; ") + "." : "",
    "Direção de arte própria do segmento. Evite: " + avoid.join("; ") + ".",
    "Onde faltar um dado (serviços, equipe, preços), use um marcador entre colchetes em vez de inventar. Rodapé discreto: “Prévia de demonstração”."
  ].filter(Boolean).join("\n");
}

/** Troca a linha de referências do prompt e mantém o resto, inclusive o que foi ajustado à mão ou com a IA. */
export function withReferences(prompt: string, links: string[]) {
  const lines = prompt.split("\n").filter(l => !l.startsWith("Referências visuais:"));
  const refs = links.map(l => l.trim()).filter(Boolean);
  if (!refs.length) return lines.join("\n");
  const at = lines.findIndex(l => l.startsWith("Direção de arte"));
  lines.splice(at < 0 ? lines.length : at, 0, "Referências visuais: " + refs.join(" , ") + ". Siga o layout, o ritmo, a hierarquia e a tipografia delas (e dos prints anexados), sem copiar textos, imagens, marcas ou código.");
  return lines.join("\n");
}

const english: Record<string, string> = {
  Academia: "gym", Advocacia: "law firm", Arquitetura: "architecture studio", Barbearia: "barbershop", Cafeteria: "coffee shop", Confeitaria: "bakery",
  Construtora: "construction company", Contabilidade: "accounting firm", "Design de interiores": "interior design", "Energia solar": "solar energy", "Escola e cursos": "school",
  Estética: "aesthetic clinic", Fisioterapia: "physiotherapy clinic", Imobiliária: "real estate", "Móveis planejados": "custom furniture", Odontologia: "dental clinic",
  Oficinas: "auto repair shop", "Pet shop": "pet shop", Pilates: "pilates studio", Restaurante: "restaurant", "Salão de beleza": "beauty salon", "Serviços locais": "local business", Veterinária: "veterinary clinic"
};
/** Buscas prontas de referência do nicho (em inglês, onde as galerias têm mais resultados). */
export function referenceSearches(sector: string) {
  const q = encodeURIComponent((english[sector] ?? sector) + " website");
  return [
    { name: "Dribbble", url: "https://dribbble.com/search/" + q },
    { name: "Behance", url: "https://www.behance.net/search/projects?search=" + q },
    { name: "Pinterest", url: "https://br.pinterest.com/search/pins/?q=" + q }
  ];
}
