"use client";

// Histórico preservado (o `showHistory` do Connect Tributário): uma linha por
// gravação, da mais nova para a mais antiga. "Abrir esta versão" carrega os
// dados como rascunho não salvo — a versão atual só muda ao salvar.

import { History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDateTime } from "@/lib/format";
import { PAINEL, TEXTO_DE_APOIO, TITULO_DA_SECAO } from "./estilos";

export type VersaoNaTela = { id: string; revisao: number; acao: string; motor: string; createdAt: Date; autor: string | null };

type Props = {
  versoes: VersaoNaTela[];
  revisaoAtual: number;
  abrindo: string | null;
  onAbrir: (versaoId: string) => void;
};

export function HistoricoDaAvaliacao({ versoes, revisaoAtual, abrindo, onAbrir }: Props) {
  return (
    <section className={PAINEL}>
      <div>
        <h2 className={TITULO_DA_SECAO}>Histórico preservado</h2>
        <p className={TEXTO_DE_APOIO}>
          Cada gravação guarda uma foto dos dados e das premissas. Abrir uma versão antiga carrega os valores como rascunho; ela só
          vira a atual quando você salva.
        </p>
      </div>
      {versoes.length === 0 ? (
        <EmptyState icon={<History />} title="Nenhuma versão ainda" description="Salve a avaliação para começar o histórico." />
      ) : (
        <ul className="divide-y divide-border">
          {versoes.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-fg">
                  <b>Revisão {v.revisao}</b> · {v.acao}
                  {v.revisao === revisaoAtual && <span className="text-fg-muted"> · atual</span>}
                </p>
                <p className="text-helper text-fg-muted">
                  {formatInstantDateTime(v.createdAt)}
                  {v.autor ? ` · ${v.autor}` : ""} · motor {v.motor}
                </p>
              </div>
              {v.revisao !== revisaoAtual && (
                <Button variant="secondary" size="sm" loading={abrindo === v.id} loadingLabel="Abrindo…" onClick={() => onAbrir(v.id)}>
                  Abrir esta versão
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
