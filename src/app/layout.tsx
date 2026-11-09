import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default:"Specter Hunter", template:"%s · Specter Hunter" }, description:"Descubra empresas, investigue sua presença digital e organize sua próxima abordagem.", robots: { index:false, follow:false }, icons:"/favicon.svg" };
export default function Layout({ children }: Readonly<{children:React.ReactNode}>) {
  return <html lang="pt-BR"><body><a className="skip" href="#conteudo">Ir para o conteúdo</a>{children}</body></html>;
}
