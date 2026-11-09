import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

export const orgCookie = "specter_org";
export const recoveryCookie = "specter_recovery";
export type Organization = { id: string; name: string; city: string; region: string; segments: string; message_name: string; retention_days: number };
export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
export async function client() {
  const config = supabaseConfig();
  if (!config) redirect("/configurar");
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try { for (const { name, value, options } of values) jar.set(name, value, options); }
        catch { /* Server Components read cookies. Proxy handles session refresh. */ }
      }
    }
  });
}
export const identity = cache(async () => {
  const db = await client();
  const { data, error } = await db.auth.getClaims();
  if (error || !data?.claims.sub) redirect("/login?msg=sessao");
  return { db, userId: data.claims.sub, email: String(data.claims.email ?? "") };
});
export const context = cache(async () => {
  const auth = await identity();
  const { data, error } = await auth.db.from("organization_members")
    .select("role,organizations!inner(id,name,city,region,segments,message_name,retention_days)")
    .eq("user_id", auth.userId).order("created_at");
  if (error) throw new Error("Falha ao carregar organizações");
  const memberships = (data ?? []) as unknown as { role: "owner" | "member"; organizations: Organization }[];
  if (!memberships.length) redirect("/onboarding");
  const preferred = (await cookies()).get(orgCookie)?.value;
  const active = memberships.find(entry => entry.organizations.id === preferred) ?? memberships[0];
  return { ...auth, org: active.organizations, role: active.role, memberships };
});
export function appUrl() {
  const candidate = z.url({ protocol: /^https?$/ }).safeParse(process.env.APP_URL || "http://localhost:3000");
  if (!candidate.success) throw new Error("APP_URL inválida");
  return new URL(candidate.data).origin;
}
export function sessionCookie() {
  return { httpOnly: true, sameSite: "lax" as const, secure: appUrl().startsWith("https:"), path: "/" };
}
