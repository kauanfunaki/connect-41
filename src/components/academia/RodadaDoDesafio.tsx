"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { comecarDesafioAction } from "@/app/(app)/academia/actions";
import { formatarPrecisao } from "@/lib/academia/ranking";
import { SEQUENCIA_MINIMA_DA_CHAMA, diasEmTexto, type Sequencia } from "@/lib/academia/sequencia";
import type { DesafioDeHoje, ResultadoDoEnvio, RodadaServida } from "@/lib/academia/tipos";
import { ChamaDaSequencia, EVENTO_DA_SEQUENCIA } from "./ChamaDaSequencia";
import { RodadaDeDigitacao } from "./RodadaDeDigitacao";

type RodadaDeTexto = Extract<RodadaServida, { teste: "digitacao" | "numeros" }>;

function FraseDaSequencia({ sequencia }: { sequencia: Sequencia }) {
  if (sequencia.atual === 0) return <p className="text-ui text-fg-secondary">Faça o desafio hoje para começar uma sequência.</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-ui text-fg-secondary">
      <ChamaDaSequencia dias={sequencia.atual} />
      {sequencia.folgaUsada && <span className="text-helper text-fg-muted">A folga desta semana já foi usada.</span>}
      {sequencia.maior > sequencia.atual && <span className="text-helper text-fg-muted">Sua maior: {diasEmTexto(sequencia.maior)}.</span>}
    </p>
  );
}

/**
 * O desafio do dia (Fase 2, 11/11/2026, pedido do Kauan): 1 minuto de
 * digitação, o mesmo texto para todo mundo no dia, uma vez por dia. Fazer
 * conta a sequência; o resultado não entra no ranking do mês.
 */
export function RodadaDoDesafio({ inicial, motivoSemTeste }: { inicial: DesafioDeHoje; motivoSemTeste: string | null }) {
  const [rodada, setRodada] = useState<RodadaDeTexto | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoEnvio | null>(null);
  const [erro, setErro] = useState("");
  const [comecando, iniciar] = useTransition();
  const router = useRouter();
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!resultado) return;
    titulo.current?.focus();
    if (resultado.ok && resultado.desafio) {
      // O chapéu do topo atualiza a chama sem recarregar a página.
      window.dispatchEvent(new CustomEvent(EVENTO_DA_SEQUENCIA, { detail: resultado.desafio.sequencia.atual }));
      router.refresh();
    }
  }, [resultado, router]);

  function comecar() {
    setErro("");
    iniciar(async () => {
      const r = await comecarDesafioAction();
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      if (r.teste === "digitacao" || r.teste === "numeros") setRodada(r);
    });
  }

  if (rodada && !resultado) return <RodadaDeDigitacao rodada={rodada} onFim={setResultado} />;

  const voltar = (
    <Button href="/academia" variant="ghost" className="min-h-11 sm:min-h-0">
      <ArrowLeft size={14} aria-hidden /> Voltar à Academia
    </Button>
  );

  if (resultado) {
    return (
      <Card as="section" aria-labelledby="desafio-resultado" className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
        <h2 id="desafio-resultado" ref={titulo} tabIndex={-1} className="text-section font-semibold text-fg focus:outline-none">
          {resultado.ok ? "Desafio de hoje feito!" : "O desafio não valeu desta vez"}
        </h2>
        {resultado.ok ? (
          <>
            <p className="text-ui text-fg-secondary">
              <span className="font-semibold text-fg tabular-nums">{resultado.ppm ?? 0} PPM</span> com{" "}
              <span className="font-semibold text-fg tabular-nums">{formatarPrecisao(resultado.precisao)}%</span> de precisão. Amanhã tem outro texto.
            </p>
            {resultado.desafio && <FraseDaSequencia sequencia={resultado.desafio.sequencia} />}
          </>
        ) : (
          <Aviso tom="atencao">{resultado.erro} A tentativa de hoje já foi usada; amanhã tem outro desafio.</Aviso>
        )}
        <div className="flex flex-wrap gap-2">
          <Button href="/academia/testes" className="min-h-11 sm:min-h-0">Treinar nos testes</Button>
          {voltar}
        </div>
      </Card>
    );
  }

  return (
    <Card as="section" aria-labelledby="desafio-titulo" className="mx-auto flex max-w-2xl flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 flex-shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning-fg">
          <CalendarCheck size={20} />
        </span>
        <div>
          <h2 id="desafio-titulo" className="text-section font-semibold text-fg">Desafio do dia</h2>
          <p className="text-ui text-fg-secondary">
            1 minuto de digitação, com o mesmo texto para toda a equipe hoje. Uma vez por dia: fazer conta a sua sequência de dias. Não entra no ranking do mês.
          </p>
        </div>
      </div>
      <FraseDaSequencia sequencia={inicial.sequencia} />
      <p className="text-helper text-fg-muted">
        Sábado e domingo não quebram a sequência, e um dia útil perdido por semana é perdoado. A sequência aparece no chapéu do topo a partir de {SEQUENCIA_MINIMA_DA_CHAMA} dias.
      </p>

      {motivoSemTeste ? (
        <Aviso tom="info">{motivoSemTeste}</Aviso>
      ) : inicial.feitoHoje ? (
        <Aviso tom="sucesso">
          Você já fez o desafio de hoje{inicial.resultado ? `: ${inicial.resultado.ppm} PPM com ${formatarPrecisao(inicial.resultado.precisao)}% de precisão` : ""}. Amanhã tem outro!
        </Aviso>
      ) : inicial.usadoHoje ? (
        <Aviso tom="neutro">Você começou o desafio de hoje e não terminou. A tentativa do dia já foi usada: amanhã tem outro.</Aviso>
      ) : !inicial.disponivel ? (
        <Aviso tom="neutro">Ainda não há textos de digitação para o desafio. Peça a quem administra a Academia para cadastrar.</Aviso>
      ) : null}
      {erro && <Aviso>{erro}</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        {!motivoSemTeste && !inicial.usadoHoje && inicial.disponivel && (
          <Button onClick={comecar} disabled={comecando} className="min-h-11 sm:min-h-0">
            <Play size={14} aria-hidden /> {comecando ? "Preparando…" : "Começar o desafio"}
          </Button>
        )}
        {voltar}
      </div>
    </Card>
  );
}
