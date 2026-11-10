import { context } from "@/lib/auth";
import { readingErrors } from "@/lib/domain";

export type FeedItem = { id: string; name: string; state: "pending" | "running" | "done" | "failed"; step: string | null;
  error: string | null; points: number | null; maximum: number | null; contacts: number; site: boolean; at: string };

/** Andamento da leitura automática: o que está na fila, o que está sendo lido agora e o que terminou nos últimos 30 minutos. */
export async function GET() {
  const { db, org } = await context();
  const since = new Date(Date.now() - 30 * 60000).toISOString();
  const { data, error } = await db.from("enrichment_requests").select("lead_id,state,step,error_code,suggestion,requested_at,finished_at")
    .eq("organization_id", org.id).or("state.in.(pending,running),finished_at.gte." + since).order("requested_at").limit(60);
  if (error) return Response.json({ items: [] }, { status: 503 });
  const ids = (data ?? []).map(r => r.lead_id);
  const [leads, contacts] = ids.length ? await Promise.all([
    db.from("leads").select("id,name").eq("organization_id", org.id).in("id", ids),
    db.from("lead_contacts").select("lead_id").eq("organization_id", org.id).eq("source_label", "Leitura automática do site").in("lead_id", ids).limit(1000)
  ]) : [{ data: [] }, { data: [] }];
  const names = new Map((leads.data ?? []).map(l => [l.id, String(l.name)]));
  const items: FeedItem[] = (data ?? []).map(r => ({
    id: r.lead_id, name: names.get(r.lead_id) ?? "Empresa", state: r.state, step: r.step,
    error: r.error_code ? readingErrors[r.error_code] ?? r.error_code : null,
    points: r.suggestion?.points ?? null, maximum: r.suggestion?.maximum ?? null,
    contacts: (contacts.data ?? []).filter(c => c.lead_id === r.lead_id).length,
    site: Boolean(r.suggestion?.signals?.site_vivo), at: r.finished_at ?? r.requested_at
  }));
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
