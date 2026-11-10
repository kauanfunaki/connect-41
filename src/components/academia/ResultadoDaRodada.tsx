"use client";

import { useEffect, useRef } from "react";
import { RotateCcw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { ROTULO_DO_NIVEL, ROTULO_DO_TESTE, ehDeDigitar, type Teste } from "@/lib/academia/regras";
import { formatarPrecisao } from "@/lib/academia/ranking";
import type { ResultadoDoEnvio } from "@/lib/academia/tipos";

const segundos = (ms: number) => `${Math.round(ms / 1000)} s`;

/**
 * O resultado da rodada (10/11/2026): os números que o servidor conferiu, se
 * valeu para o ranking e os próximos passos. O foco vai para o título, para o
 * leitor de tela anunciar o resultado assim que ele aparece.
 */
export function ResultadoDaRodada({ teste, resultado, onDeNovo }: { teste: Teste; resultado: ResultadoDoEnvio; onDeNovo: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);

  if (!resultado.ok) {
    return (
      <Card as="section" aria-labelledby="resultado-titulo" className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
        <h2 id="resultado-titulo" ref={titulo} tabIndex={-1} className="text-section font-semibold text-fg focus:outline-none">
          Sem resultado desta vez
        </h2>
        <Aviso tom="atencao">{resultado.erro}</Aviso>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onDeNovo} className="min-h-11 sm:min-h-0">
            <RotateCcw size={14} aria-hidden /> Escolher outra rodada
          </Button>
          <Button href="/academia/testes" variant="ghost" className="min-h-11 sm:min-h-0">
            Voltar aos testes
          </Button>
        </div>
      </Card>
    );
  }

  const numeros = ehDeDigitar(teste)
    ? [
        { rotulo: "Palavras por minuto", valor: String(resultado.ppm ?? 0) },
        { rotulo: "Precisão", valor: `${formatarPrecisao(resultado.precisao)}%` },
        { rotulo: "Tempo", valor: segundos(resultado.duracaoMs) },
      ]
    : [
        { rotulo: "Acertos", valor: `${resultado.acertos ?? 0} de ${resultado.total ?? 0}` },
        { rotulo: "Precisão", valor: `${formatarPrecisao(resultado.precisao)}%` },
        { rotulo: "Tempo", valor: segundos(resultado.duracaoMs) },
      ];

  return (
    <Card as="section" aria-labelledby="resultado-titulo" className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <div>
        <h2 id="resultado-titulo" ref={titulo} tabIndex={-1} className="text-section font-semibold text-fg focus:outline-none">
          {ROTULO_DO_TESTE[teste]} · {ROTULO_DO_NIVEL[resultado.nivel]}
        </h2>
        <p className="text-ui text-fg-secondary">
          {resultado.valendo ? "Valeu para o ranking do mês: fica o seu melhor resultado." : "Treino livre: não entra no ranking."}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <dt className="text-helper text-fg-muted">{n.rotulo}</dt>
            <dd className="text-metric font-semibold text-fg tabular-nums">{n.valor}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onDeNovo} className="min-h-11 sm:min-h-0">
          <RotateCcw size={14} aria-hidden /> {resultado.valendo ? "Fazer outra rodada" : "Treinar de novo"}
        </Button>
        <Button href={`/academia/ranking?teste=${teste}`} variant="secondary" className="min-h-11 sm:min-h-0">
          <Trophy size={14} aria-hidden /> Ver o ranking
        </Button>
      </div>
    </Card>
  );
}
