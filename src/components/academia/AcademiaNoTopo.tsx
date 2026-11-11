"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Gift, GraduationCap } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { Selo } from "@/components/ui/Selo";
import { resumoDoPainelAction } from "@/app/(app)/academia/actions";
import { ROTULO_CURTO_DO_TESTE, TESTES, nomeDoMes } from "@/lib/academia/regras";
import { resultadoEmTexto } from "@/lib/academia/ranking";
import { SEQUENCIA_MINIMA_DA_CHAMA, diasEmTexto } from "@/lib/academia/sequencia";
import type { ResumoDaAcademia } from "@/lib/academia/tipos";
import { ChamaDaSequencia, EVENTO_DA_SEQUENCIA } from "./ChamaDaSequencia";
import { IconeDoTeste } from "./IconeDoTeste";
import { BarraDaMeta } from "./MetaPessoal";

/**
 * O chapéu de formatura do topo (10/11/2026, pedido do Kauan): o caminho da
 * Academia, antes do tema, no mesmo desenho dos vizinhos (`framed lg`). O
 * clique abre um painel pequeno com os melhores da pessoa no mês, a posição e
 * os atalhos "Treinar" e "Abrir a Academia". Sem anel de progresso.
 *
 * O resumo é buscado AO ABRIR, como o sino: vindo do layout, ele envelheceria
 * (o layout não re-renderiza ao navegar) e custaria três leituras em toda
 * página.
 *
 * A sequência de dias (Fase 2, 11/11/2026, pedido do Kauan): de 2 dias
 * seguidos em diante, a pílula âmbar com a chama e o número, centrada embaixo
 * do ícone — sem anel. Sem sequência, o ícone fica igual aos vizinhos. O
 * número vem do layout (uma leitura barata) e muda sem recarregar quando o
 * desafio do dia termina (`EVENTO_DA_SEQUENCIA`) ou o painel abre.
 */
export function AcademiaNoTopo({ naAcademia = false, sequencia = 0 }: { naAcademia?: boolean; sequencia?: number }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<ResumoDaAcademia | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [atualizada, setAtualizada] = useState<number | null>(null);
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const pedido = useRef(0);
  const dias = atualizada ?? sequencia;
  const comChama = dias >= SEQUENCIA_MINIMA_DA_CHAMA;

  useEffect(() => {
    function aoTerminarODesafio(e: Event) {
      const n = (e as CustomEvent<unknown>).detail;
      if (typeof n === "number") setAtualizada(n);
    }
    window.addEventListener(EVENTO_DA_SEQUENCIA, aoTerminarODesafio);
    return () => window.removeEventListener(EVENTO_DA_SEQUENCIA, aoTerminarODesafio);
  }, []);

  async function carregar() {
    const n = ++pedido.current;
    setCarregando(true);
    setErro(false);
    try {
      const r = await resumoDoPainelAction();
      if (n !== pedido.current) return;
      // Nulo: o módulo foi desligado depois que a página abriu.
      if (r) {
        setDados(r);
        setAtualizada(r.desafio.sequencia.atual);
      } else setErro(true);
    } catch {
      if (n === pedido.current) setErro(true);
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }

  function alternar() {
    if (aberto) return setAberto(false);
    setAberto(true);
    void carregar();
  }

  const mes = dados ? nomeDoMes(dados.mes) : null;

  return (
    <>
      <span ref={ancoraRef} className="relative inline-flex">
        <IconButton
          variant="framed"
          size="lg"
          active={aberto || naAcademia}
          onClick={alternar}
          data-dica={comChama ? `Academia · ${diasEmTexto(dias)} seguidos no desafio` : "Academia"}
          aria-label={comChama ? `Academia, ${diasEmTexto(dias)} seguidos no desafio do dia` : "Academia"}
          aria-expanded={aberto}
          aria-haspopup="dialog"
        >
          <GraduationCap size={17} />
        </IconButton>
        {comChama && (
          <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2">
            <ChamaDaSequencia dias={dias} topo />
          </span>
        )}
      </span>

      <PainelFlutuante
        ancora={ancoraRef}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        largura={340}
        align="right"
        folhaNoCelular
        aria-label="Academia"
        className="p-0! flex flex-col"
      >
        <div className="px-4 pt-3 pb-2">
          <p className="text-body font-semibold text-fg">Academia</p>
          <p className="text-helper text-fg-muted">{mes ? `Seus melhores em ${mes}` : "Seus melhores do mês"}</p>
        </div>

        <div className="border-t border-border px-4 py-3" aria-live="polite" aria-busy={carregando}>
          {erro ? (
            <p className="text-ui text-fg-muted">Não foi possível carregar agora. Feche e abra de novo.</p>
          ) : !dados ? (
            <ul className="flex flex-col gap-3" aria-label="Carregando">
              {TESTES.map((t) => (
                <li key={t} className="h-5 rounded-sm bg-surface-2 animate-pulse" />
              ))}
            </ul>
          ) : (
            <>
              <ul className="flex flex-col gap-2.5">
                {TESTES.map((t) => {
                  const r = dados.testes[t];
                  return (
                    <li key={t} className="flex items-center gap-2.5 min-w-0">
                      <span aria-hidden className="text-fg-muted [&>svg]:size-4">
                        <IconeDoTeste teste={t} />
                      </span>
                      <span className="text-ui text-fg-secondary w-[74px] flex-shrink-0">{ROTULO_CURTO_DO_TESTE[t]}</span>
                      <span className="text-ui font-medium text-fg tabular-nums truncate flex-1">
                        {r.melhor ? resultadoEmTexto(t, r.melhor) : <span className="font-normal text-fg-muted">Sem resultado</span>}
                      </span>
                      {r.posicao && (
                        <Selo tom={r.posicao <= 3 ? "marca" : "neutro"} className="tabular-nums">
                          {r.posicao}º<span className="sr-only"> de {r.participantes}</span>
                        </Selo>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-helper text-fg-muted">
                {!dados.aparece
                  ? "Você está fora do ranking: seus números ficam só para você."
                  : dados.melhorPosicao
                    ? `Sua melhor posição em ${mes}: ${dados.melhorPosicao.posicao}º em ${ROTULO_CURTO_DO_TESTE[dados.melhorPosicao.teste]}, entre ${dados.melhorPosicao.participantes}.`
                    : `Faça um teste valendo para entrar no ranking de ${mes}.`}
              </p>
              {dados.premio && (
                <p className="mt-2 flex items-start gap-1.5 text-helper text-fg-secondary">
                  <Gift size={14} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />
                  <span>
                    <span className="font-medium text-fg">Prêmio do mês:</span> {dados.premio}
                  </span>
                </p>
              )}
            </>
          )}
        </div>

        {/* Fase 2 (11/11/2026): o desafio do dia, com a sequência, e a meta pessoal. */}
        {dados && (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="text-warning-fg [&>svg]:size-4">
                <CalendarCheck />
              </span>
              <span className="min-w-0 flex-1 text-ui text-fg-secondary">
                Desafio do dia
                {dados.desafio.sequencia.atual > 0 && (
                  <span className="ml-1.5 align-middle">
                    <ChamaDaSequencia dias={dados.desafio.sequencia.atual} />
                  </span>
                )}
              </span>
              {dados.desafio.feitoHoje ? (
                <span className="inline-flex items-center gap-1 text-helper font-medium text-success-fg">
                  <Check size={13} aria-hidden /> Feito
                </span>
              ) : dados.desafio.usadoHoje || !dados.desafio.disponivel ? (
                <span className="text-helper text-fg-muted">{dados.desafio.usadoHoje ? "Amanhã tem outro" : "Sem texto ainda"}</span>
              ) : (
                <Link href="/academia/desafio" onClick={() => setAberto(false)} className="inline-flex min-h-11 items-center text-ui font-semibold text-brand hover:underline sm:min-h-0">
                  Fazer agora
                </Link>
              )}
            </div>
            {dados.meta ? (
              <div className="flex flex-col gap-1.5">
                <p className="truncate text-helper text-fg-secondary">
                  <span className="font-medium text-fg">Sua meta:</span> {dados.meta.texto}
                </p>
                <BarraDaMeta meta={dados.meta} compacta />
              </div>
            ) : (
              <p className="text-helper text-fg-muted">
                Sem meta pessoal.{" "}
                <Link href="/academia" onClick={() => setAberto(false)} className="font-medium text-brand hover:underline">
                  Definir uma meta
                </Link>
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          {/* 44px no celular (alvo de toque); 32px no computador, como os botões do sino. */}
          <Button href="/academia/testes" size="sm" variant="secondary" className="min-h-11 sm:min-h-0" onClick={() => setAberto(false)}>
            Treinar
          </Button>
          <Button href="/academia" size="sm" className="min-h-11 sm:min-h-0" onClick={() => setAberto(false)}>
            Abrir a Academia
          </Button>
        </div>
      </PainelFlutuante>
    </>
  );
}
