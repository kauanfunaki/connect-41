"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: string;
  /** Resumo curto ao lado do título quando a seção está fechada — ex.: "3", "0/7 · 0%". */
  summary?: React.ReactNode;
  /** Começa aberta. Padrão é fechada, inclusive com conteúdo. */
  defaultOpen?: boolean;
  children: React.ReactNode;
};

// Seção colapsável do rodapé do detalhamento de tarefa (Subtarefas, Tarefas
// relacionadas, Checklist, Anexos), no formato do ClickUp: sem cartão nem
// borda em volta, só um cabeçalho clicável com contagem.
//
// Fecha por padrão MESMO com conteúdo — as quatro seções abertas ao mesmo
// tempo empurravam a descrição e os campos da tarefa pra fora da tela, e na
// maior parte das vezes o que se quer ver ao abrir uma tarefa é o topo. A
// contagem no cabeçalho é o que evita que fechado vire "escondido".
export function DetailSection({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 py-2.5 text-left group"
      >
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-fg-muted transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[13px] font-semibold text-fg group-hover:text-brand transition-colors">{title}</span>
        {summary != null && <span className="text-[11px] text-fg-muted tnum">{summary}</span>}
      </button>

      {open && <div className="pb-4 pl-[22px]">{children}</div>}
    </div>
  );
}
