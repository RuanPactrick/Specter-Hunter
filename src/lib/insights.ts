import { decodeEntities, type Evidence } from "./domain";

/** Números que o robô escreve no texto das evidências, para mostrar como métricas. */
export type Metric = { value: string; label: string; alert?: boolean };
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function metrics(kind: string, observed: string): Metric[] {
  const t = decodeEntities(observed);
  const out: Metric[] = [];
  if (kind === "Perfil do Instagram") {
    const f = t.match(/([\d.,]+(?: mil| mi)?) seguidores/); if (f) out.push({ value: f[1], label: "seguidores" });
    const p = t.match(/(\d+) posts? nos últimos 30 dias/); const idle = t.match(/Último post há (\d+) dias/);
    if (p) out.push({ value: p[1], label: "posts em 30 dias", alert: p[1] === "0" });
    else if (idle) out.push({ value: idle[1] + " dias", label: "sem postar", alert: true });
    const e = t.match(/\(([\d,]+)% de engajamento\)/); if (e) out.push({ value: e[1] + "%", label: "engajamento", alert: num(e[1]) < 1 });
  } else if (kind === "Google Maps") {
    const r = t.match(/nota ([\d,]+) com (\d+) avalia/);
    if (r) out.push({ value: r[1] + " ★", label: "nota média" }, { value: r[2], label: "avaliações" });
  } else if (kind === "Leitura do site") {
    if (/respondeu HTTP 2\d\d/.test(t)) out.push({ value: "No ar", label: "site respondeu" });
    else if (/está no ar/.test(t)) out.push({ value: "No ar", label: "bloqueia leitura", alert: true });
    else out.push({ value: "Sem resposta", label: "leitura falhou", alert: true });
  } else if (kind === "Sinais de marketing") {
    const y = t.match(/rodapé parado em (\d{4})/); if (y) out.push({ value: y[1], label: "última atualização", alert: true });
  } else if (kind === "Cadastro na Receita") {
    const s = t.match(/situação ([^;]+)/i); if (s) out.push({ value: s[1].trim().toLowerCase().replace(/^\w/, c => c.toUpperCase()), label: "situação" });
    const a = t.match(/aberta em (\d{4})/); if (a) out.push({ value: a[1], label: "aberta em" });
  } else if (kind === "Anúncios na Meta") {
    const n = t.match(/(\d+)(?: ou mais)? anúncios? ativos?/);
    out.push(n ? { value: n[1], label: "anúncios ativos" } : { value: "Nenhum", label: "anúncio ativo" });
  }
  return out.slice(0, 3);
}

/** Itens do texto "Página inicial: tem pixel..., rodapé parado em 2021, com botão de WhatsApp." como lista ✓/!. */
export function marketingChecks(observed: string) {
  const body = decodeEntities(observed).replace(/^Página inicial:\s*/, "").replace(/\. Oportunidade sugerida:.*$/, "");
  return body.split(/,\s*/).filter(Boolean).map(text => ({ text: text.charAt(0).toUpperCase() + text.slice(1), ok: !/^(sem|rodapé parado)/i.test(text) }));
}

/** Uma frase de venda e até 3 ganchos tirados do que o robô achou. Nada inventado: só o que está nas evidências. */
export function salesAngle(evidence: Evidence[]) {
  const find = (k: string) => evidence.find(e => e.kind === k);
  const hooks: { title: string; detail: string }[] = [];
  const mk = find("Sinais de marketing"), ig = find("Perfil do Instagram"), maps = find("Google Maps"), site = find("Leitura do site"), ads = find("Anúncios na Meta");
  const year = mk?.observed.match(/rodapé parado em (\d{4})/)?.[1];
  if (year) hooks.push({ title: "Site desatualizado", detail: "Rodapé de " + year + " · fonte: site" });
  else if (mk && /sem versão para celular/.test(mk.observed)) hooks.push({ title: "Site sem versão para celular", detail: "fonte: site" });
  if (site && !/respondeu HTTP 2\d\d|está no ar/.test(site.observed)) hooks.push({ title: "Site fora do ar ou ausente", detail: "fonte: leitura do site" });
  const eng = ig?.observed.match(/\(([\d,]+)% de engajamento\)/)?.[1], fol = ig?.observed.match(/([\d.,]+(?: mil| mi)?) seguidores/)?.[1];
  if (eng && num(eng) < 1) hooks.push({ title: eng + "% de engajamento", detail: (fol ? fol + " seguidores · " : "") + "fonte: Instagram" });
  else if (ig && /perfil parado/.test(ig.observed)) hooks.push({ title: "Instagram parado", detail: "fonte: Instagram" });
  if (ads && /^Nenhum anúncio/.test(ads.observed)) hooks.push({ title: "Sem anúncios ativos", detail: "fonte: Biblioteca da Meta" });
  const rate = maps?.observed.match(/nota ([\d,]+) com (\d+) avalia/);
  if (rate && num(rate[1]) >= 4.5) hooks.push({ title: "Nota " + rate[1] + " no Maps", detail: rate[2] + " avaliações · use como elogio" });
  const weak = hooks.some(h => /desatualizado|fora do ar|celular|engajamento|parado/i.test(h.title));
  const praise = rate && num(rate[1]) >= 4.5;
  const summary = !hooks.length ? "Ainda não há achados suficientes para montar o argumento. Peça a leitura automática."
    : praise && weak ? "Empresa com boa reputação, mas a presença digital não acompanha. O assunto é modernizar, não começar do zero."
    : weak ? "A presença digital tem falhas visíveis. Mostre o ganho de corrigir isso, com um exemplo concreto."
    : "Presença digital já razoável. Aborde com uma melhoria específica, não com um site novo.";
  return { summary, hooks: hooks.slice(0, 3), chance: weak ? (praise ? "média" : "alta") : "baixa" };
}

/** Linha curta para mostrar junto dos números (o texto completo fica em Fontes). null = os números bastam. */
export function brief(kind: string, observed: string): string | null {
  const t = decodeEntities(observed);
  if (kind === "Leitura do site") { const title = t.match(/Título: (.+?)\.?$/)?.[1]; return title ? "“" + title + "”" : t; }
  if (kind === "Google Maps") return t.split("; ")[1]?.replace(/, Brasil$/, "") ?? null;
  if (kind === "Cadastro na Receita") { const name = t.match(/razão social ([^;]+)/)?.[1]; const cnpj = t.match(/^[\d./-]{18}/)?.[0]; return [name, cnpj].filter(Boolean).join(" · ") || null; }
  if (kind === "Perfil do Instagram" || kind === "Anúncios na Meta") return null;
  return t;
}
