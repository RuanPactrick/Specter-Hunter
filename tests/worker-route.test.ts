import { afterEach, expect, it } from "vitest";
afterEach(() => { delete process.env.CRON_SECRET; });
it("a rota do robô só aceita o Vercel Cron com o CRON_SECRET", async () => {
  const { GET } = await import("../src/app/api/worker/route");
  expect((await GET(new Request("https://x/api/worker"))).status).toBe(401);
  process.env.CRON_SECRET = "segredo-de-teste";
  expect((await GET(new Request("https://x/api/worker", { headers: { authorization: "Bearer errado" } }))).status).toBe(401);
});
