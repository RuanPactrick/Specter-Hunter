import Link from "next/link";
import { supabaseConfig } from "@/lib/auth";
export const dynamic = "force-dynamic";
// A página inicial responde 200 em vez de redirecionar no servidor: o Google Search Console lê a tag de
// verificação aqui (ver layout.tsx). Quem abre o site é levado ao app na hora pelo refresh.
export default function Home() {
  const target = supabaseConfig() ? "/app" : "/configurar";
  return <><meta httpEquiv="refresh" content={"0;url=" + target}/><main id="conteudo" className="pad"><Link href={target}>Abrir o Specter Hunter</Link></main></>;
}
