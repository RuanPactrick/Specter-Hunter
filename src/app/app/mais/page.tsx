import { ButtonLink, Heading, Panel } from "@/components/ui";
import { logout } from "@/lib/auth-actions";
export default function More() {
  return <><Heading group="Espaço de trabalho" title="Mais"/><Panel title="Navegação"><div className="pad stack">{[["Nova pesquisa","pesquisa"],["Pipeline","pipeline"],["Prévias","previas"],["Integrações","integracoes"],["Configurações","configuracoes"]].map(([name,route])=><ButtonLink key={route} href={"/app/"+route}>{name}</ButtonLink>)}<form action={logout}><button className="btn" type="submit">Sair</button></form></div></Panel></>;
}
