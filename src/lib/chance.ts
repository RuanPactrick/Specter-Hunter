/** Chance de fechar lida pela IA na última resposta do cliente. O peso é o meio da faixa que a IA usa (alta 60–80%, média 30–50%, baixa 5–20%). */
export const chances = { alta: 0.7, média: 0.4, baixa: 0.125, nenhuma: 0 } as const;
export type Chance = keyof typeof chances;

/** Acha "Chance: <faixa>" ou "Chance de fechar: <faixa>" num texto (dica da IA ou resposta salva no histórico). */
export function chanceOf(text: string): Chance | null {
  const m = text.match(/Chance(?: de fechar)?:\s*(alta|média|baixa|nenhuma)/i);
  return m ? m[1].toLowerCase() as Chance : null;
}

/** Valor em negociação e previsão (valor × chance) das empresas que têm valor informado. */
export function forecast(leads: { contract_value: number | null; chance: Chance | null }[]) {
  const priced = leads.filter(l => l.contract_value !== null);
  return {
    total: priced.reduce((sum, l) => sum + l.contract_value!, 0),
    expected: priced.reduce((sum, l) => sum + (l.chance ? l.contract_value! * chances[l.chance] : 0), 0),
    withoutChance: priced.filter(l => !l.chance).length
  };
}
