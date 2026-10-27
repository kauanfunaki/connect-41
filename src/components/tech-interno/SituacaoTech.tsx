"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { mudarSituacaoTech } from "@/app/(app)/tech/controle-interno/actions";
import { SITUACOES } from "@/lib/tech-interno/regras";
import { CORES_DA_SITUACAO } from "@/lib/tech-interno/cores";

type Situacao = keyof typeof SITUACOES;
type Props = { id: string; titulo: string; status: Situacao; version: number; podeEditar: boolean; forma?: "celula" | "selo" };

// A situação muda na própria lista, no Kanban e na Agenda (26/10/2026); o servidor
// grava quem mudou e o valor anterior no histórico do item.
export function SituacaoTech({ id, titulo, status, version, podeEditar, forma = "celula" }: Props) {
  const router = useRouter(), toast = useToast(), [pendente, iniciar] = useTransition(), [atual, setAtual] = useState(status);
  const cor = CORES_DA_SITUACAO[atual], celula = forma === "celula";
  const caixa = celula ? "flex h-full w-full items-center justify-center gap-1.5 px-3 text-ui" : "inline-flex h-7 max-w-full items-center gap-1 whitespace-nowrap rounded-md px-2.5 text-helper";
  if (!podeEditar) return <span className={`${caixa} font-semibold${celula ? " absolute inset-0" : ""}`} style={{ backgroundColor: cor.fundo, color: cor.tinta }}>{SITUACOES[atual]}</span>;
  function mudar(proxima: Situacao, fechar: () => void) {
    fechar();
    if (proxima === atual || pendente) return;
    const anterior = atual; setAtual(proxima);
    iniciar(async () => {
      try {
        const r = await mudarSituacaoTech(id, proxima, version);
        if ("error" in r) { setAtual(anterior); toast.error(r.error); return; }
        toast.success(`Situação alterada para ${SITUACOES[proxima]}.`); router.refresh();
      } catch { setAtual(anterior); toast.error("Não foi possível confirmar a mudança. Atualize a página antes de tentar novamente."); }
    });
  }
  return <div className={celula ? "absolute inset-0 [&>span]:flex [&>span]:h-full [&>span]:w-full" : "inline-flex max-w-full min-w-0 [&>span]:max-w-full"}>
    <Popover width={200} aria-label={`Situação de ${titulo}`} trigger={({ open, toggle }) => <button type="button" onClick={toggle} disabled={pendente} aria-haspopup="menu" aria-expanded={open}
      aria-label={`Situação de ${titulo}: ${SITUACOES[atual]}. Alterar`} title="Alterar situação"
      className={`${caixa} cursor-pointer font-semibold transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-80`}
      style={{ backgroundColor: cor.fundo, color: cor.tinta }}><span className="truncate">{SITUACOES[atual]}</span><ChevronDown size={celula ? 15 : 13} aria-hidden className="shrink-0 opacity-70" /></button>}>
      {({ close }) => <div role="menu" className="flex flex-col gap-1">{(Object.keys(SITUACOES) as Situacao[]).map(s => <button key={s} type="button" role="menuitemradio" aria-checked={s === atual} autoFocus={s === atual}
        onClick={() => mudar(s, close)} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-ui text-fg hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none">
        <span aria-hidden className="size-3.5 shrink-0 rounded-sm" style={{ backgroundColor: CORES_DA_SITUACAO[s].fundo }} /><span className="flex-1">{SITUACOES[s]}</span>{s === atual && <Check size={14} aria-hidden className="text-brand" />}
      </button>)}</div>}
    </Popover>
  </div>;
}
