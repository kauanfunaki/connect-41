"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, UserCheck } from "lucide-react";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Select } from "@/components/ui/Select";
import type { EscopoDaBusca } from "@/lib/chamados/acesso";

// A busca escolhe onde procurar (26/10/2026): no chamado, em quem abriu, no
// setor solicitante ou no responsável. "Atribuídos a mim" mora aqui junto, como
// um filtro a mais. Cada papel recebe só os escopos dele (`escoposDaBusca`);
// com um só, a escolha nem aparece.
const ESCOPOS: Record<EscopoDaBusca, { rotulo: string; dica: string }> = {
  chamado: { rotulo: "Chamado", dica: "Título, descrição ou protocolo…" }, solicitante: { rotulo: "Solicitante", dica: "Nome de quem abriu…" },
  setor: { rotulo: "Setor", dica: "Nome do setor solicitante…" }, responsavel: { rotulo: "Responsável", dica: "Nome do responsável…" },
};
export function ControlesBuscaChamados({ atribuidos, escopos }: { atribuidos: boolean; escopos: EscopoDaBusca[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const qAtual = searchParams.get("q") ?? "";
  const emAtual = escopos.find(e => e === searchParams.get("em")) ?? "chamado";
  const meus = searchParams.get("meus") === "1";
  const [q, setQ] = useState(qAtual);
  const [em, setEm] = useState<EscopoDaBusca>(emAtual);

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
    {escopos.length > 1 && <Select compact className="w-full sm:w-40" aria-label="Buscar em" value={em} onChange={e => { const valor = e.target.value as EscopoDaBusca; setEm(valor); ir({ q: q.trim() || null, em: valor === "chamado" ? null : valor }); }}>{escopos.map(e => <option key={e} value={e}>{ESCOPOS[e].rotulo}</option>)}</Select>}
    <CampoDeBusca compact className="min-w-52 flex-1" aria-label="Buscar chamados" placeholder={ESCOPOS[em].dica} value={q} onChange={e => setQ(e.target.value)} />
    {atribuidos && <button type="button" aria-pressed={meus} onClick={() => ir({ meus: meus ? null : "1" })} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-helper font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${meus ? "border-brand/40 bg-brand/10 text-brand" : "border-border-strong text-fg-secondary hover:bg-surface-hover hover:text-fg"}`}>{meus ? <Check size={14} aria-hidden /> : <UserCheck size={14} aria-hidden />}Atribuídos a mim</button>}
  </div>;
}
