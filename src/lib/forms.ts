import { z } from "zod";
import { redirect } from "next/navigation";
import { regions, publicUrl } from "./domain";

export const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
export const optionalText = (max: number) => z.string().trim().max(max).default("");
export const optionalUrl = z.string().trim().max(2048).default("").transform((value, ctx) => {
  if (!value) return null;
  const url = publicUrl(value);
  if (!url) { ctx.addIssue({ code: "custom", message: "Informe uma URL pública HTTP ou HTTPS." }); return z.NEVER; }
  return url;
});
export const optionalDate = z.union([z.iso.date(), z.literal("")]).default("").transform(value => value || null);
export const on = z.preprocess(value => value === "on" || value === true, z.boolean());
export const organizationSchema = z.object({
  name:text(120), responsible:text(120), city:text(100), region:z.enum(regions), segments:optionalText(500), message_name:text(100), start:z.enum(["manual","integracoes"]).default("manual")
});
export const leadSchema = z.object({
  name:text(160), sector:text(100), city:text(100), region:z.enum(regions), district:optionalText(100), address:optionalText(250),
  website:optionalUrl, instagram:optionalText(2048), maps:optionalUrl, phone:optionalText(60), email:z.union([z.email().max(254),z.literal("")]).default(""),
  notes:optionalText(2500), source_label:text(200), source_url:optionalUrl, consulted_on:z.iso.date(), override:on
});
export function message(path: string, description: string, success = false): never {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(success ? "ok" : "msg", description);
  redirect(url.pathname + url.search);
}
export function parse<T extends z.ZodType>(schema:T, data:FormData, path:string):z.output<T> {
  const result = schema.safeParse(Object.fromEntries(data));
  if (!result.success) message(path, "Confira os campos. " + (result.error.issues[0]?.message ?? ""));
  return result.data;
}
export function saveError(path: string, error: {code?:string} | null) {
  if (!error) return;
  const messages: Record<string,string> = {
    P2001:"O registro está na lista de exclusão ou de não contato.", P2002:"Possível duplicação. Revise a carteira. Confirme no formulário se for outra unidade.",
    P2003:"O lead não está disponível nesta organização.", P2004:"A organização já tem uma pesquisa ativa. Acompanhe ou cancele a execução existente.",
    P2005:"O limite diário de consultas da organização foi atingido.", "23503":"O registro relacionado não pertence a este lead ou organização.",
    "23505":"Esse registro já existe.", "42501":"Você não tem permissão para esta operação.",
    "22023":"Revise os dados, os motivos informados e a evidência selecionada.", "23514":"Revise os valores e os campos obrigatórios."
  };
  message(path, messages[error.code ?? ""] ?? "Não foi possível concluir a operação. Revise os dados e tente novamente.");
}
