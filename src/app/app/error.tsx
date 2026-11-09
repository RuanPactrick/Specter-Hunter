"use client";
import { Notice } from "@/components/ui";
export default function ErrorScreen({ reset }:{reset:()=>void}) {
  return <section className="panel pad stack"><h1>Não foi possível abrir esta tela</h1><Notice tone="error">A leitura falhou. Seus registros existentes foram preservados. Tente novamente.</Notice><button className="btn" onClick={reset}>Tentar novamente</button></section>;
}
