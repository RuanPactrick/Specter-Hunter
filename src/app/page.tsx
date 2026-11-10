import Link from "next/link";
import type { Metadata } from "next";
import { Building2, ClipboardCheck, MessageSquareText, ScanSearch } from "lucide-react";
import { Brand } from "@/components/ui";
// Página pública de verdade: diz o que o produto é antes de pedir login (e carrega a tag do Search Console, ver layout.tsx).
// Só ela é indexável; o app e as telas de acesso continuam fora das buscas.
export const metadata: Metadata = { title: "Specter Hunter · prospecção para quem cria sites", robots: { index: true, follow: false } };
const steps = [
  [Building2, "Encontre empresas", "Escolha o segmento e a cidade. As empresas do Google Maps entram na sua carteira, sem repetidas."],
  [ScanSearch, "Veja a presença digital", "O sistema lê o site de cada empresa e procura Instagram e CNPJ para você conferir."],
  [ClipboardCheck, "Revise com critério", "Nada vira verdade sem a sua revisão. Cada contato e cada evidência esperam confirmação."],
  [MessageSquareText, "Organize a abordagem", "Pipeline, tarefas, prévias e modelos de mensagem. O envio é sempre feito por você."],
] as const;
export default function Home() {
  return <div className="landing">
    <header className="landing-hero"><div className="landing-wrap">
      <nav className="landing-top" aria-label="Acesso"><Brand/><div className="actions"><Link className="btn landing-ghost" href="/login">Entrar</Link><Link className="btn primary" href="/cadastro">Criar conta</Link></div></nav>
      <div className="landing-copy"><p className="kicker">Prospecção para quem cria sites</p><h1>Oportunidades além do óbvio.</h1>
        <p>Descubra empresas da sua cidade, entenda como está a presença digital de cada uma e organize a próxima abordagem num lugar só.</p>
        <div className="actions"><Link className="btn primary" href="/cadastro">Começar agora</Link><Link className="btn landing-ghost" href="/login">Já tenho conta</Link></div></div>
    </div></header>
    <main id="conteudo" className="landing-wrap landing-main">
      <h2>Como funciona</h2>
      <ol className="landing-steps">{steps.map(([Icon, title, text]) => <li key={title} className="panel pad"><Icon size={22} aria-hidden="true"/><h3>{title}</h3><p className="muted">{text}</p></li>)}</ol>
      <p className="muted landing-note">Ferramenta de uso interno para equipes comerciais. O acesso é por conta com e-mail confirmado. Não pedimos dados de cartão nem fazemos disparo de mensagens.</p>
    </main>
  </div>;
}
