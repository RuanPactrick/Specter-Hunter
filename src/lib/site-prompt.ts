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

// direção de arte por segmento: clima, tipografia, layout e o elemento que faz o dono parar e olhar
const directions: [RegExp, string][] = [
  [/odonto|dent/i, "clínico-premium e acolhedor: branco quente, muito respiro e um tom de marca forte; serifada elegante nos títulos com sans limpa nos textos; fotos reais da equipe e do consultório em destaque. Elemento assinatura: comparação antes e depois com slider arrastável e selo da nota do Google ao lado da chamada principal."],
  [/estética|beleza|salão|spa|sobrancelha|unha/i, "editorial de revista de beleza: tons nude e um acento sofisticado, tipografia serifada grande e fina, fotos em recortes altos e assimétricos. Elemento assinatura: galeria em mosaico com zoom suave e lista de procedimentos com duração e indicação."],
  [/barbearia/i, "urbano e marcante: fundo escuro, tipografia condensada enorme, textura sutil e detalhes em dourado ou cor da marca. Elemento assinatura: tabela de cortes em estilo cardápio e faixa com o horário de hoje."],
  [/advoca|jurídic|contab/i, "sóbrio e confiável: azul-petróleo ou verde-escuro com neutros, serifada clássica nos títulos, grid editorial com bastante texto bem diagramado. Elemento assinatura: áreas de atuação escritas como as dúvidas reais do cliente, com resposta curta."],
  [/restaurante|cafeteria|confeitaria|padaria|bar|pizzaria|hamburgueria|doceria/i, "apetitoso e quente: fotos grandes de comida com cor, tipografia com personalidade, fundo creme. Elemento assinatura: cardápio em abas com destaques da casa e o horário de funcionamento sempre visível."],
  [/academia|pilates|fisio|crossfit|personal/i, "energia e movimento: contraste alto, tipografia bold em itálico, fotos com ação e diagonais. Elemento assinatura: grade de modalidades e horários e chamada para aula experimental."],
  [/pet|veterin/i, "carinhoso e alegre: cores vivas porém suaves, cantos arredondados, fotos de animais em destaque. Elemento assinatura: serviços com ícones desenhados à mão e faixa de emergência ou horário estendido, se houver."],
  [/imobili|constru|arquitet|interiores|móveis|marcenaria/i, "arquitetônico: grid amplo, fotos em tela cheia, linhas finas e tipografia geométrica. Elemento assinatura: portfólio com filtro por tipo de projeto e números grandes (obras, anos, m²)."],
  [/solar|energia/i, "técnico e otimista: azul profundo com amarelo solar, números grandes, ilustrações limpas. Elemento assinatura: simulador simples de economia (valor da conta de luz → economia estimada, identificada como estimativa)."],
  [/escola|curso|idioma|educa/i, "acolhedor e organizado: cores claras com um acento vibrante, tipografia amigável. Elemento assinatura: cursos em cartões com nível, duração e próxima turma."],
  [/oficina|auto|mecânic/i, "robusto e direto: grafite com laranja ou vermelho, tipografia condensada, fotos da oficina real. Elemento assinatura: lista de serviços com prazo médio e botão de orçamento pelo WhatsApp."]
];
const direction = (sector: string) => directions.find(([r]) => r.test(sector))?.[1]
  ?? "moderno e com cara própria do segmento: escolha uma paleta e um par de fontes que combinem com o público, layout com ritmo (seções de fundo claro e de cor da marca alternadas). Elemento assinatura: um bloco visual inesperado ligado ao serviço principal da empresa.";

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
  const facts = s.facts.filter(f => useful.has(f.kind) && !empty.test(f.observed)).map(fact).filter(Boolean).slice(0, 5);
  const content = decodeEntities(s.facts.find(f => f.kind === "Conteúdo do site")?.observed ?? "");
  const line = (label: string) => content.match(new RegExp("^" + label + ": (.+)$", "m"))?.[1];
  const services = line("Itens e serviços"), hours = line("Horário"), images = line("Imagens");
  const followers = s.facts.find(f => f.kind === "Perfil do Instagram")?.observed.match(/([\d.,]+(?: mil)?) seguidores/)?.[1];
  const since = s.facts.find(f => f.kind === "Cadastro na Receita")?.observed.match(/aberta em (\d{4})/)?.[1];
  const city = s.place.split(",").pop()!.split("–")[0].trim();
  const wa = s.whatsapp?.replace(/\D/g, "");
  const cta = s.whatsapp ? "Chamar no WhatsApp" : "Entrar em contato";
  const proof = [s.rating && "nota " + s.rating[0] + " ★ com " + s.rating[1] + " avaliações no Google", since && "desde " + since, followers && followers + " seguidores no Instagram"].filter(Boolean);
  const hero = s.photos?.[0] ? "a foto 1 anexada (" + s.photos[0].description + ") em destaque" : images ? "uma das imagens do site atual em destaque" : "uma composição tipográfica forte com a cor da marca (sem foto de banco de imagens)";
  return [
    "Crie um site one-page de demonstração para " + s.name + ", " + s.sector.toLowerCase() + " em " + s.place + ". A prévia precisa impressionar o dono no primeiro segundo: ao abrir no celular ele deve pensar \"esse é o site que eu queria ter\". Objetivo de negócio: transformar visitas em " + (s.whatsapp ? "conversas no WhatsApp" : "contatos") + ".",
    "",
    "## Tecnologia",
    siteStack.replace(/^Tecnologia: /, "") + " Entregue o arquivo completo, sem resumir nem omitir trechos.",
    "",
    "## Identidade da marca",
    s.colors.length ? "- Cores da empresa: " + s.colors.map((c, i) => c + " (" + (colorRoles[i] ?? "apoio") + ")").join(", ") + ". Use a principal com confiança em fundos de seção e reserve a mais viva para botões e detalhes." : "- Crie uma paleta própria a partir da direção de arte abaixo: até 3 cores e neutros, com contraste AA.",
    s.fonts.length ? "- Fontes: " + s.fonts[0] + " nos títulos e " + (s.fonts[1] ?? s.fonts[0]) + " nos textos (Google Fonts)." : "- Escolha um par de fontes do Google Fonts que combine com a direção de arte (uma com personalidade para títulos, uma legível para textos).",
    s.logo ? "- Use o logo anexado no cabeçalho e no rodapé." : "- Sem logo: monte um logotipo tipográfico com o nome da empresa.",
    s.feedStyle ? "- Estilo que a empresa já usa no Instagram (mantenha a coerência): " + s.feedStyle + "." : null,
    s.photos?.length ? "- Fotos reais anexadas, na ordem: " + s.photos.map((p, i) => (i + 1) + ") " + p.use + ": " + p.description).join("; ") + ". Use essas fotos no lugar de banco de imagens." : null,
    "",
    "## Direção de arte",
    "Clima: " + direction(s.sector) + (s.colors.length || s.fonts.length ? " As cores e fontes reais da empresa, acima, têm prioridade sobre as sugeridas aqui." : ""),
    "Evite: " + avoid.join("; ") + ".",
    "",
    facts.length || content || proof.length ? "## Conteúdo real da empresa (use, reescreva melhor e não invente)" : null,
    facts.length ? "- Dados: " + facts.join(" | ") : null,
    proof.length ? "- Provas para destacar: " + proof.join("; ") + "." : null,
    content ? "- Conteúdo do site atual, para reaproveitar e reescrever com mais força (as imagens podem ser usadas pelo link):\n" + content.split("\n").map(l => "  " + l).join("\n") : null,
    "",
    "## Estrutura, seção por seção",
    "1. Topo: título curto e específico sobre o maior ganho de quem procura " + s.sector.toLowerCase() + " em " + city + " (nada genérico como \"qualidade e excelência\"), subtítulo com uma prova real, botão principal \"" + cta + "\" e um secundário para os serviços; " + hero + ".",
    "2. Faixa de confiança logo abaixo do topo: " + (proof.length ? proof.join(" · ") : "[números da empresa: anos de mercado, clientes atendidos]") + ".",
    "3. Serviços: " + (services ? "a partir de: " + services + "." : "[serviços da empresa].") + " Cada um com o benefício em uma linha e um botão para perguntar no WhatsApp; varie o layout (destaque o principal), nada de cartões todos iguais.",
    "4. Sobre: a história e o jeito de atender da empresa" + (since ? ", com o tempo de mercado desde " + since : "") + (s.photos?.some(p => /sobre/.test(p.use)) ? ", usando a foto marcada como \"sobre\"" : "") + ". Texto humano, em primeira pessoa do plural.",
    "5. Como funciona: 3 passos simples do primeiro contato até o atendimento.",
    "6. Avaliações: " + (s.rating ? "selo grande com a nota " + s.rating[0] + " e " + s.rating[1] + " avaliações, e espaço para 3 depoimentos reais [colar avaliações do Google]." : "espaço para 3 depoimentos reais [colar avaliações do Google]."),
    "7. Perguntas frequentes: 4 ou 5 dúvidas típicas de quem procura " + s.sector.toLowerCase() + ", com respostas curtas e honestas (sem preços inventados).",
    "8. Onde estamos: " + (s.address ? s.address + ", com mapa do Google Maps incorporado pelo endereço e botão de rotas" : "[endereço] com mapa e botão de rotas") + (hours ? "; horário: " + hours : "; [horário de atendimento]") + ".",
    "9. Chamada final com o botão \"" + cta + "\" e rodapé com contatos, " + (s.instagram ? "link do Instagram, " : "") + "e a frase discreta \"Prévia de demonstração\".",
    "",
    "## Detalhes que surpreendem",
    "- " + (wa ? "Botão flutuante do WhatsApp com mensagem pronta (https://wa.me/" + wa + "?text=" + encodeURIComponent("Olá! Vi o site e quero saber mais") + "), " : "Botão de contato flutuante, ") + "cabeçalho que encolhe ao rolar e menu do celular em tela cheia.",
    "- Entradas suaves das seções com IntersectionObserver, números que contam ao aparecer" + (s.rating ? " (nota e avaliações)" : "") + ", hover e foco bem desenhados, respeitando prefers-reduced-motion.",
    "- Ritmo visual: alterne seções claras e de cor da marca, use uma tipografia grande no topo e imagens com recorte e proporção cuidadosos.",
    "- Textos em português do Brasil, específicos para " + s.name + " e " + city + ", frases curtas e nada de lorem ipsum.",
    "",
    "## Regras",
    "- Onde faltar um dado (serviços, equipe, preços, depoimentos), use um marcador entre colchetes no lugar certo em vez de inventar.",
    "- Não invente avaliações, prêmios, números ou serviços que não estejam acima."
  ].filter(l => l !== null).filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Troca a linha de referências do prompt e mantém o resto, inclusive o que foi ajustado à mão ou com a IA. */
export function withReferences(prompt: string, links: string[]) {
  const lines = prompt.split("\n").filter(l => !l.startsWith("Referências visuais:"));
  const refs = links.map(l => l.trim()).filter(Boolean);
  if (!refs.length) return lines.join("\n");
  // logo depois do título "## Direção de arte" (ou antes da linha antiga "Direção de arte...", em prompts editados)
  const heading = lines.findIndex(l => l.startsWith("## Direção de arte")), old = lines.findIndex(l => l.startsWith("Direção de arte"));
  const at = heading >= 0 ? heading + 1 : old >= 0 ? old : lines.length;
  lines.splice(at, 0, "Referências visuais: " + refs.join(" , ") + ". Siga o layout, o ritmo, a hierarquia e a tipografia delas (e dos prints anexados), sem copiar textos, imagens, marcas ou código.");
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
