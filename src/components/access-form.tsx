import Link from "next/link";
import { changePassword, login, recover, signup } from "@/lib/auth-actions";
import { supabaseConfig } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Field, Flash, Panel, type Search } from "./ui";
import { Submit } from "./submit";
const modes = { login:["Entrar","Entrar",login], signup:["Criar conta","Criar conta",signup], recover:["Recuperar senha","Enviar instruções",recover], reset:["Definir nova senha","Atualizar senha",changePassword] } as const;
export function AccessForm({ mode, params }:{mode:keyof typeof modes;params:Search}) {
  if(!supabaseConfig()) redirect("/configurar");
  const [title,button,action] = modes[mode];
  return <Panel title={title}><form action={action} className="pad stack"><Flash params={params}/>{mode!=="reset" && <Field label="E-mail"><input type="email" name="email" autoComplete="email" maxLength={254} required/></Field>}{mode!=="recover" && <Field label="Senha" hint={mode==="login"?undefined:"Use pelo menos 10 caracteres."}><input type="password" name="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={10} maxLength={128} required/></Field>}<Submit>{button}</Submit><div className="actions spread">{mode==="login"?<><Link href="/cadastro">Criar conta</Link><Link href="/recuperar">Esqueci minha senha</Link></>:<Link href="/login">Voltar para entrar</Link>}</div></form></Panel>;
}
