"use server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { appUrl, client, identity, orgCookie, recoveryCookie, sessionCookie } from "./auth";
import { message, organizationSchema, parse } from "./forms";

const emailPassword = z.object({ email: z.email().max(254), password: z.string().min(10).max(128) });
export async function login(data: FormData) {
  const fields = parse(emailPassword, data, "/login");
  const db = await client();
  const { error } = await db.auth.signInWithPassword(fields);
  if (error) message("/login", "Confira o e-mail, a senha e a confirmação da conta.");
  redirect("/app");
}
export async function signup(data: FormData) {
  const fields = parse(emailPassword, data, "/cadastro");
  const db = await client();
  const { data: result, error } = await db.auth.signUp({
    ...fields, options: { emailRedirectTo: appUrl() + "/auth/callback" }
  });
  if (error) message("/cadastro", "Cadastro indisponível. Confira os dados e tente novamente.");
  if (result.session) redirect("/onboarding");
  message("/login", "Confira seu e-mail para confirmar a conta.", true);
}
export async function logout() {
  const db = await client();
  await db.auth.signOut({ scope: "local" });
  const jar = await cookies();
  jar.delete(orgCookie);
  jar.delete(recoveryCookie);
  redirect("/login");
}
export async function recover(data: FormData) {
  const { email } = parse(z.object({ email: z.email().max(254) }), data, "/recuperar");
  const db = await client();
  await db.auth.resetPasswordForEmail(email, { redirectTo: appUrl() + "/auth/callback?flow=recovery" });
  message("/recuperar", "Se houver uma conta com esse e-mail, você receberá as instruções.", true);
}
export async function changePassword(data: FormData) {
  await identity();
  const jar = await cookies();
  if (jar.get(recoveryCookie)?.value !== "1") message("/recuperar", "Solicite um novo link de recuperação.");
  const { password } = parse(z.object({ password: z.string().min(10).max(128) }), data, "/nova-senha");
  const db = await client();
  const { error } = await db.auth.updateUser({ password });
  if (error) message("/nova-senha", "Não foi possível atualizar a senha. Confira a política da conta.");
  jar.delete(recoveryCookie);
  await db.auth.signOut({ scope: "local" });
  message("/login", "Senha atualizada. Entre novamente.", true);
}
export async function createOrganization(data: FormData) {
  const { db } = await identity();
  const fields = parse(organizationSchema, data, "/onboarding");
  const { data: id, error } = await db.rpc("create_organization", {
    p_name: fields.name, p_responsible: fields.responsible, p_city: fields.city, p_region: fields.region,
    p_segments: fields.segments, p_message_name: fields.message_name
  });
  if (error || typeof id !== "string") message("/onboarding", "Não foi possível criar a organização.");
  (await cookies()).set(orgCookie, id, sessionCookie());
  redirect(fields.start === "integracoes" ? "/app/integracoes" : "/app/oportunidades");
}
export async function switchOrganization(data: FormData) {
  const { db, userId } = await identity();
  const { id } = parse(z.object({ id: z.uuid() }), data, "/app/configuracoes");
  const { data: membership } = await db.from("organization_members").select("role").eq("user_id", userId).eq("organization_id", id).maybeSingle();
  if (!membership) message("/app/configuracoes", "Você não tem acesso a essa organização.");
  (await cookies()).set(orgCookie, id, sessionCookie());
  redirect("/app");
}
