"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, UserCheck } from "lucide-react";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Select } from "@/components/ui/Select";

// A busca escolhe onde procurar (26/10/2026): no chamado, no setor solicitante
// ou no responsável. "Atribuídos a mim" mora aqui junto, como um filtro a mais.
const ESCOPOS = { chamado: "Título, descrição ou protocolo…", setor: "Nome do setor solicitante…", responsavel: "Nome do responsável…" } as const;
type Escopo = keyof typeof ESCOPOS;
export function ControlesBuscaChamados({ atribuidos }: { atribuidos: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const qAtual = searchParams.get("q") ?? "";
  const emAtual: Escopo = (searchParams.get("em") ?? "") in ESCOPOS ? searchParams.get("em") as Escopo : "chamado";
  const meus = searchParams.get("meus") === "1";
  const [q, setQ] = useState(qAtual);
  const [em, setEm] = useState<Escopo>(emAtual);

  function ir(alteracoes: Record<string, string | null>) {
    const params = new URLSearchParams(queryString);
    for (const [key, value] of Object.entries(alteracoes)) { if (value) params.set(key, value); else params.delete(key); }
    params.delete("pagina");
    const sufixo = params.toString();
    router.replace(`/chamados${sufixo ? `?${sufixo}` : ""}`, { scroll: false });
  }
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

  return <div role="search" className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
    <Select compact className="w-full sm:w-40" aria-label="Buscar em" value={em} onChange={e => { const valor = e.target.value as Escopo; setEm(valor); ir({ q: q.trim() || null, em: valor === "chamado" ? null : valor }); }}><option value="chamado">Chamado</option><option value="setor">Setor</option><option value="responsavel">Responsável</option></Select>
    <CampoDeBusca compact className="min-w-52 flex-1" aria-label="Buscar chamados" placeholder={ESCOPOS[em]} value={q} onChange={e => setQ(e.target.value)} />
    {atribuidos && <button type="button" aria-pressed={meus} onClick={() => ir({ meus: meus ? null : "1" })} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-helper font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${meus ? "border-brand/40 bg-brand/10 text-brand" : "border-border-strong text-fg-secondary hover:bg-surface-hover hover:text-fg"}`}>{meus ? <Check size={14} aria-hidden /> : <UserCheck size={14} aria-hidden />}Atribuídos a mim</button>}
  </div>;
}
