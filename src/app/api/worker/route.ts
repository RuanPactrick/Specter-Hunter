import { runQueue } from "../../../lib/worker-run";
// a pesquisa no Maps pode levar até 4 min; só pega item novo no primeiro minuto para caber nos 300 s
export const maxDuration = 300;
export const dynamic = "force-dynamic";
/** Chamada pelo Vercel Cron a cada minuto (vercel.json). O Vercel manda "Authorization: Bearer CRON_SECRET". */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) return new Response("Não autorizado", { status: 401 });
  const done = await runQueue({ until: Date.now() + 50_000 });
  return Response.json({ done });
}
