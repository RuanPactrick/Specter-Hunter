"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Clock, LoaderCircle } from "lucide-react";
import type { FeedItem } from "@/app/api/leitura/route";

const time = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Painel ao vivo da leitura: quem está sendo lido agora e em que etapa, quem está na fila e o resultado de quem terminou. */
export function ReadingFeed() {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const finished = useRef<number | null>(null);
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const data: { items: FeedItem[] } | null = await fetch("/api/leitura", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (stop) return;
      const list = data?.items ?? [];
      setItems(list);
      const done = list.filter(i => i.state === "done" || i.state === "failed").length;
      // uma empresa terminou: atualiza a tabela (nota, presença) sem recarregar a página toda a cada segundo
      if (finished.current !== null && done > finished.current) router.refresh();
      finished.current = done;
      if (list.some(i => i.state === "pending" || i.state === "running")) timer = setTimeout(load, 3000);
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, [router]);
  if (!items?.length || hidden) return null;
  const running = items.filter(i => i.state === "running");
  const waiting = items.filter(i => i.state === "pending");
  const ended = items.filter(i => i.state === "done" || i.state === "failed").sort((a, b) => b.at.localeCompare(a.at));
  const active = running.length + waiting.length > 0;
  const stalled = !running.length && waiting.length > 0;
  return <section className="panel reading-feed" aria-live="polite" aria-label="Andamento da leitura dos sites">
    <header className="reading-head">
      <div><strong>{active ? "Lendo os sites" : "Leitura concluída"}</strong>
        <span className="meta"> · {ended.length} de {items.length} {items.length === 1 ? "empresa" : "empresas"} {active ? "prontas" : "lidas"}</span></div>
      {!active && <button type="button" className="btn small" onClick={() => setHidden(true)}>Ocultar</button>}
    </header>
    <div className="reading-bar" role="progressbar" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={ended.length}><span style={{ width: (ended.length / items.length) * 100 + "%" }} /></div>
    {stalled && <p className="reading-note"><Clock size={14} aria-hidden="true" /> Aguardando o robô começar. Ele confere a fila a cada 5 minutos e lê uma empresa por vez, de 1 a 3 minutos cada.</p>}
    <ol className="reading-list">
      {running.map(i => <li key={i.id} className="now"><LoaderCircle size={16} className="spin" aria-hidden="true" />
        <div><strong>Lendo agora: {i.name}</strong><span>{i.step ?? "Começando a leitura"}…</span></div></li>)}
      {waiting.map((i, n) => <li key={i.id} className="wait"><Clock size={16} aria-hidden="true" />
        <div><strong>{i.name}</strong><span>{n === 0 && running.length ? "Próxima da fila" : (n + 1) + "ª na fila"}</span></div></li>)}
      {ended.map(i => <li key={i.id} className={i.state}>{i.state === "done" ? <CircleCheck size={16} aria-hidden="true" /> : <CircleX size={16} aria-hidden="true" />}
        <div><Link href={"/app/oportunidades/" + i.id + "?aba=presenca"}><strong>{i.state === "done" ? "Terminou" : "Falhou"}: {i.name}</strong></Link>
          <span>{time(i.at)} · {i.state === "done"
            ? [i.points !== null && "nota sugerida " + i.points + "/" + i.maximum, i.site ? "site no ar" : "site não lido", i.contacts + (i.contacts === 1 ? " contato novo" : " contatos novos")].filter(Boolean).join(" · ")
            : i.error ?? "erro desconhecido"}</span></div></li>)}
    </ol>
  </section>;
}
