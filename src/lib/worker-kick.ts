import "server-only";
import { after } from "next/server";
import { runQueue } from "./worker-run";
/**
 * Processa a fila logo depois de responder ao clique (Ler, Ler sites, Nova pesquisa), sem esperar o cron.
 * A página que chama precisa de maxDuration=300 para o after() ter tempo.
 */
export function processSoon() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  after(() => runQueue({ until: Date.now() + 30_000 }).then(() => undefined, error => console.error("Robô após o clique parou:", error instanceof Error ? error.message : error)));
  return true;
}
