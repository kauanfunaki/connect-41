"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PRIORIDADES, ROTULOS_PRIORIDADE } from "@/lib/chamados/regras";

export function ControlesBuscaChamados() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const qAtual = searchParams.get("q") ?? "";
  const prioridadeAtual = searchParams.get("prioridade") ?? "";
  const [q, setQ] = useState(qAtual);
  const [prioridade, setPrioridade] = useState(prioridadeAtual);

  useEffect(() => {
    const valor = q.trim();
    if (valor === qAtual) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams(queryString);
      if (valor) params.set("q", valor); else params.delete("q");
      params.delete("pagina");
      const sufixo = params.toString();
      router.replace(`/chamados${sufixo ? `?${sufixo}` : ""}`, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, qAtual, queryString, router]);

  function mudarPrioridade(valor: string) {
    setPrioridade(valor);
    const params = new URLSearchParams(queryString);
    const busca = q.trim();
    if (busca) params.set("q", busca); else params.delete("q");
    if (valor) params.set("prioridade", valor); else params.delete("prioridade");
    params.delete("pagina");
    const sufixo = params.toString();
    router.replace(`/chamados${sufixo ? `?${sufixo}` : ""}`, { scroll: false });
  }

  return <div role="search" className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
    <Input className="min-w-52 flex-1" aria-label="Buscar chamados" placeholder="Buscar chamados..." value={q} onChange={e => setQ(e.target.value)} />
    <Select className="w-full sm:w-48" aria-label="Prioridade" value={prioridade} onChange={e => mudarPrioridade(e.target.value)}><option value="">Todas as prioridades</option>{PRIORIDADES.map(p => <option key={p} value={p}>{ROTULOS_PRIORIDADE[p]}</option>)}</Select>
  </div>;
}
