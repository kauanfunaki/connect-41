"use client";

import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { defDaFonte, type FonteDaAgenda } from "@/lib/fontesDaAgenda";
import type { OrigemDasFontes } from "@/lib/agendaDoSetor";

type Props = {
  /** As fontes que a pessoa alcança, na ordem do catálogo. */
  acessiveis: readonly FonteDaAgenda[];
  ocultas: readonly FonteDaAgenda[];
  /** De onde veio a escolha: a dela ("Salvo para você"), a do setor ou a do código. */
  origem?: OrigemDasFontes;
  onAlternar: (fonte: FonteDaAgenda, ligada: boolean) => void;
  /** Sem isto, não há "Restaurar padrão" (a configuração do setor, que é o próprio padrão). */
  onRestaurar?: () => void;
  desabilitado?: boolean;
  /** O nome do grupo para o leitor de tela. */
  rotulo?: string;
};

const ORIGEM: Record<OrigemDasFontes, string | null> = {
  pessoa: "Salvo para você",
  setor: "Padrão do setor",
  codigo: null,
};

/**
 * Os botões das fontes de prazo (10/11/2026, desenho A/B aprovado pelo Kauan):
 * um por fonte, com a bolinha na cor dela, ligado com fundo azul-claro e ✓,
 * desligado só com o contorno. É `aria-pressed`, como as etiquetas do quadro
 * (TagToggleList): a cor não carrega o estado sozinha — o ✓ e o fundo vão junto.
 */
export function BotoesDeFonte({ acessiveis, ocultas, origem, onAlternar, onRestaurar, desabilitado, rotulo = "Fontes dos prazos" }: Props) {
  const fora = new Set(ocultas);
  const aviso = origem ? ORIGEM[origem] : null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-1.5">
        {acessiveis.map((chave) => {
          const def = defDaFonte(chave);
          const ligada = !fora.has(chave);
          return (
            <button
              key={chave}
              type="button"
              aria-pressed={ligada}
              disabled={desabilitado}
              title={def.descricao}
              onClick={() => onAlternar(chave, !ligada)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-fs-2 font-medium transition-colors disabled:cursor-default disabled:opacity-[var(--c41-disabled-op)] ${
                ligada
                  ? "border-brand/40 bg-brand-subtle text-fg"
                  : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg"
              }`}
            >
              <span
                aria-hidden
                className={`size-2 flex-shrink-0 rounded-full ${ligada ? "" : "opacity-50"}`}
                style={{ background: def.cor }}
              />
              {def.rotulo}
              {ligada && <Check size={13} aria-hidden className="text-brand" />}
            </button>
          );
        })}
      </div>
      {aviso && <span className="text-fs-2 text-fg-muted">{aviso}</span>}
      {origem === "pessoa" && onRestaurar && (
        <Button variant="ghost" size="xs" onClick={onRestaurar} disabled={desabilitado}>
          <RotateCcw size={12} /> Restaurar padrão
        </Button>
      )}
    </div>
  );
}
