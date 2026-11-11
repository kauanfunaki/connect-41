"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ROTULO_CURTO_DO_TESTE, TESTES, nomeDoMes, type Teste } from "@/lib/academia/regras";
import type { ResumoDaAcademia } from "@/lib/academia/tipos";
import { ListaDoRanking } from "./TabelaDoRanking";

/**
 * "Ranking de {mês}" ao lado do Início (10/11/2026): os 5 primeiros e a linha
 * de quem olha, um teste por vez, e o prêmio do mês. Os três rankings já vêm
 * prontos do servidor; trocar o teste não vai ao banco.
 */
export function RankingDoInicio({ resumo }: { resumo: ResumoDaAcademia }) {
  const [teste, setTeste] = useState<Teste>(resumo.melhorPosicao?.teste ?? "digitacao");
  const mes = nomeDoMes(resumo.mes);
  const r = resumo.testes[teste];
  return (
    <section aria-labelledby="ranking-do-mes-titulo" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-xs">
      <h2 id="ranking-do-mes-titulo" className="text-body font-semibold text-fg">
        Ranking de {mes}
      </h2>
      <SegmentedControl
        label="Teste do ranking"
        active={teste}
        onChange={setTeste}
        tocavel
        className="self-start"
        items={TESTES.map((t) => ({ key: t, label: ROTULO_CURTO_DO_TESTE[t] }))}
      />
      {!resumo.aparece ? (
        <p className="text-ui text-fg-muted">
          Você escolheu não aparecer no ranking, e por isso também não vê o dos colegas. Seus números continuam nos cartões ao lado.
        </p>
      ) : r.topo.length === 0 ? (
        <p className="text-ui text-fg-muted">Ninguém fez {ROTULO_CURTO_DO_TESTE[teste].toLowerCase()} valendo em {mes} ainda. Que tal ser a primeira pessoa?</p>
      ) : (
        <ListaDoRanking teste={teste} topo={r.topo} eu={r.eu} rotulo={`Ranking de ${ROTULO_CURTO_DO_TESTE[teste]} em ${mes}`} />
      )}
      {(resumo.premio || resumo.premioDaEvolucao) && (
        <p className="flex items-start gap-1.5 rounded-md bg-surface-2 px-3 py-2 text-ui text-fg-secondary">
          <Gift size={15} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />
          <span>
            {resumo.premio && (
              <span className="block">
                <span className="font-medium text-fg">Prêmio do mês:</span> {resumo.premio}
              </span>
            )}
            {resumo.premioDaEvolucao && (
              <span className="block">
                <span className="font-medium text-fg">Maior evolução:</span> {resumo.premioDaEvolucao}
              </span>
            )}
          </span>
        </p>
      )}
      <Button href={`/academia/ranking?teste=${teste}`} variant="secondary" size="sm" className="self-start min-h-11 sm:min-h-0">
        Ver o ranking completo
      </Button>
    </section>
  );
}
