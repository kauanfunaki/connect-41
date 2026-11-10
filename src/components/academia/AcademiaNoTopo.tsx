"use client";

import { useRef, useState } from "react";
import { Gift, GraduationCap } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { Selo } from "@/components/ui/Selo";
import { resumoDoPainelAction } from "@/app/(app)/academia/actions";
import { ROTULO_CURTO_DO_TESTE, TESTES, nomeDoMes } from "@/lib/academia/regras";
import { resultadoEmTexto } from "@/lib/academia/ranking";
import type { ResumoDaAcademia } from "@/lib/academia/tipos";
import { IconeDoTeste } from "./IconeDoTeste";

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
 * `selo`: o lugar da pílula da sequência de dias (chama com o número), na base
 * do ícone — Fase 2. Hoje ninguém passa, e nada aparece.
 */
export function AcademiaNoTopo({ naAcademia = false, selo }: { naAcademia?: boolean; selo?: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const [dados, setDados] = useState<ResumoDaAcademia | null>(null);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const ancoraRef = useRef<HTMLSpanElement>(null);
  const pedido = useRef(0);

  async function carregar() {
    const n = ++pedido.current;
    setCarregando(true);
    setErro(false);
    try {
      const r = await resumoDoPainelAction();
      if (n !== pedido.current) return;
      // Nulo: o módulo foi desligado depois que a página abriu.
      if (r) setDados(r);
      else setErro(true);
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
          data-dica="Academia"
          aria-label="Academia"
          aria-expanded={aberto}
          aria-haspopup="dialog"
        >
          <GraduationCap size={17} />
        </IconButton>
        {selo && <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2">{selo}</span>}
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
