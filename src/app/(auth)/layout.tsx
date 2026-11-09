import { Brand } from "@/components/ui";
export const dynamic = "force-dynamic";
export default function AuthLayout({ children }:{children:React.ReactNode}) {
  return <div className="auth-page"><aside className="auth-brand"><Brand/><h1>Oportunidades além do óbvio.</h1><p>Descubra empresas, investigue sua presença digital e organize sua próxima abordagem.</p></aside><main className="auth-content" id="conteudo"><div className="auth-card">{children}</div></main></div>;
}
