import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
it("aceita o repositório em vários formatos", async () => {
  const { dispatchRepo } = await import("../src/lib/worker-kick");
  expect(dispatchRepo("RuanPactrick/Specter-Hunter")).toBe("RuanPactrick/Specter-Hunter");
  expect(dispatchRepo(" https://github.com/RuanPactrick/Specter-Hunter.git/ ")).toBe("RuanPactrick/Specter-Hunter");
  expect(dispatchRepo("\"RuanPactrick/Specter-Hunter\"")).toBe("RuanPactrick/Specter-Hunter");
  expect(dispatchRepo("", "RuanPactrick", "Specter-Hunter")).toBe("RuanPactrick/Specter-Hunter");
  expect(dispatchRepo("lixo", undefined, undefined)).toBeNull();
});
