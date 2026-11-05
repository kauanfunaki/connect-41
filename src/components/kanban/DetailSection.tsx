"use client";

import { useEffect, useRef, useState } from "react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";

/** Os atalhos do detalhe ("+ Checklist"…) abrem a seção por este evento. */
export const EVENTO_ABRIR_SECAO = "connect41:detalhe-abrir-secao";

export function abrirSecaoDoDetalhe(id: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENTO_ABRIR_SECAO, { detail: id }));
}

type Props = {
  title: string;
  /** Resumo curto à direita do título — ex.: "3", "0/7". */
  summary?: React.ReactNode;
  /** Começa aberta. Padrão é fechada, inclusive com conteúdo. */
  defaultOpen?: boolean;
  /** Para os atalhos do detalhe abrirem esta seção (05/11/2026). */
  id?: string;
  children: React.ReactNode;
};

// Seção colapsável do rodapé do detalhamento de tarefa (Subtarefas, Tarefas
// relacionadas, Checklist, Anexos, Horas apontadas).
//
// Fecha por padrão MESMO com conteúdo — as quatro seções abertas ao mesmo
// tempo empurravam a descrição e os campos da tarefa pra fora da tela, e na
// maior parte das vezes o que se quer ver ao abrir uma tarefa é o topo. O
// resumo no cabeçalho é o que evita que fechado vire "escondido".
//
// No desenho aprovado da lista longa (15/10/2026): o `BlocoRecolhivel`, com o
// resumo encostado à direita da linha. Era um abre-e-fecha escrito aqui, sem
// borda, com a contagem colada ao título.
//
// 05/11/2026: com `id`, os atalhos embaixo da descrição ("+ Checklist",
// "+ Anexo"…) abrem a seção, rolam até ela e põem o foco no primeiro campo.
export function DetailSection({ title, summary, defaultOpen = false, id, children }: Props) {
  const [aberto, setAberto] = useState(defaultOpen);
  const caixaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    function abrir(e: Event) {
      if ((e as CustomEvent<string>).detail !== id) return;
      setAberto(true);
      // Dois quadros: o primeiro monta o conteúdo, o segundo já o tem no lugar.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const caixa = caixaRef.current;
          if (!caixa) return;
          caixa.scrollIntoView({ block: "nearest", behavior: "smooth" });
          const campo = caixa.querySelector<HTMLElement>("input:not([type=hidden]), textarea");
          (campo ?? caixa.querySelector<HTMLElement>("button"))?.focus({ preventScroll: true });
        }),
      );
    }
    window.addEventListener(EVENTO_ABRIR_SECAO, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_SECAO, abrir);
  }, [id]);

  return (
    <div ref={caixaRef} id={id} className="scroll-mt-4">
      <BlocoRecolhivel titulo={title} resumo={summary} aberto={aberto} onAbertoChange={setAberto} classeDoConteudo="px-4 pb-4">
        {children}
      </BlocoRecolhivel>
    </div>
  );
}
