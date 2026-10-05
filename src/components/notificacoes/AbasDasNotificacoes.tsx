"use client";

import { ABAS, type AbaOuTodas } from "@/lib/notificacoes/catalogo";

/**
 * As quatro abas por natureza, em trilho com a ativa em pílula (referência do
 * Searcheye), cada uma com a contagem de não lidas. No sino e no celular da
 * central; no desktop da central elas viram a coluna da esquerda.
 *
 * Sem barra de rolagem (02/10/2026): com "99+" em duas abas, o trilho passava
 * da largura do sino e aparecia uma barra embaixo. O espaço ficou mais justo
 * para caber, e se ainda assim não couber, rola sem mostrar a barra.
 */
export function AbasDasNotificacoes({
  ativa,
  contagens,
  onEscolher,
}: {
  /** `null` quando a central está nas arquivadas (05/10/2026): nenhuma aba acesa. */
  ativa: AbaOuTodas | null;
  /** `null` enquanto carrega: as abas aparecem sem número. */
  contagens: Record<AbaOuTodas, number> | null;
  onEscolher: (aba: AbaOuTodas) => void;
}) {
  return (
    <div role="tablist" aria-label="Tipos de notificação" className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5 overflow-x-auto scroll-x-hidden">
      {ABAS.map((a) => {
        const eAtiva = a.chave === ativa;
        const n = contagens?.[a.chave] ?? 0;
        return (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={eAtiva}
            title={a.descricao}
            onClick={() => onEscolher(a.chave)}
            className={`flex-1 min-w-fit inline-flex items-center justify-center gap-1 h-8 px-2 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              eAtiva ? "bg-surface-elevated text-fg shadow-[var(--c41-shadow-xs)]" : "text-fg-muted hover:text-fg"
            }`}
          >
            {a.rotulo}
            {n > 0 && (
              <span
                className={`min-w-4 h-4 px-1 rounded-full text-[10px] leading-none font-semibold tabular-nums inline-flex items-center justify-center ${
                  eAtiva ? "bg-brand text-on-brand" : "bg-surface text-fg-secondary border border-border"
                }`}
              >
                {n > 99 ? "99+" : n}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
