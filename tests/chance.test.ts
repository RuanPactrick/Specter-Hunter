import { expect, test } from "vitest";
import { chanceOf, forecast } from "../src/lib/chance";

test("lê a chance da dica da IA e da resposta salva no histórico", () => {
  expect(chanceOf("Chance: média (30 a 50%) — pediu prazo")).toBe("média");
  expect(chanceOf("quanto custa?\n\nChance de fechar: Alta (60 a 80%) — pediu preço")).toBe("alta");
  expect(chanceOf("já temos site")).toBeNull();
});

test("previsão soma valor × chance e conta quem tem valor sem chance", () => {
  const plan = forecast([
    { contract_value: 1000, chance: "alta" }, { contract_value: 2000, chance: "nenhuma" },
    { contract_value: 500, chance: null }, { contract_value: null, chance: "alta" }
  ]);
  expect(plan).toEqual({ total: 3500, expected: 700, withoutChance: 1 });
});
