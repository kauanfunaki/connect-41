"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { comecarRodadaAction } from "@/app/(app)/academia/actions";
import { NIVEIS, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TEMPO_DA_LOGICA_S, QUESTOES_POR_RODADA, type Nivel, type Teste } from "@/lib/academia/regras";
import type { ResultadoDoEnvio, RodadaServida } from "@/lib/academia/tipos";
import { DESCRICAO_DO_TESTE } from "./descricoes";
import { IconeDoTeste } from "./IconeDoTeste";
import { RodadaDeDigitacao } from "./RodadaDeDigitacao";
import { RodadaDeLogica } from "./RodadaDeLogica";
import { ResultadoDaRodada } from "./ResultadoDaRodada";

type Modo = "valendo" | "treino";

/**
 * A tela de um teste (10/11/2026, pedido do Kauan): escolher o nível e o modo,
 * começar, fazer e ver o resultado. Valendo, o nível já usado hoje fica
 * travado; sem texto ou questão cadastrada no nível, também.
 */
export function RodadaDoTeste({
  teste,
  modoInicial,
  nivelInicial,
  usadosHoje: usadosIniciais,
  disponivel,
  motivoSemTeste,
}: {
  teste: Teste;
  modoInicial: Modo;
  nivelInicial: Nivel;
  usadosHoje: Nivel[];
  disponivel: Record<Nivel, boolean>;
  /** Por que a pessoa não faz teste (somente leitura), ou nulo. */
  motivoSemTeste: string | null;
}) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [usados, setUsados] = useState<Nivel[]>(usadosIniciais);
  const travado = (n: Nivel) => !disponivel[n] || (modo === "valendo" && usados.includes(n));
  const primeiroLivre = (m: Modo) => NIVEIS.find((n) => disponivel[n] && !(m === "valendo" && usados.includes(n))) ?? nivelInicial;
  const [nivel, setNivel] = useState<Nivel>(travado(nivelInicial) ? primeiroLivre(modoInicial) : nivelInicial);
  const [rodada, setRodada] = useState<RodadaServida | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoEnvio | null>(null);
  const [erro, setErro] = useState("");
  const [comecando, iniciar] = useTransition();

  function trocarModo(m: Modo) {
    setModo(m);
    if (m === "valendo" && (usados.includes(nivel) || !disponivel[nivel])) setNivel(primeiroLivre(m));
  }

  function comecar() {
    setErro("");
    iniciar(async () => {
      const r = await comecarRodadaAction({ teste, nivel, valendo: modo === "valendo" });
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      if (r.valendo) setUsados((u) => (u.includes(r.nivel) ? u : [...u, r.nivel]));
      setResultado(null);
      setRodada(r);
    });
  }

  function deNovo() {
    setRodada(null);
    setResultado(null);
    if (modo === "valendo") setNivel(primeiroLivre("valendo"));
  }

  if (rodada && resultado) {
    return <ResultadoDaRodada teste={teste} resultado={resultado} onDeNovo={deNovo} />;
  }
  if (rodada) {
    return rodada.teste === "logica" ? (
      <RodadaDeLogica rodada={rodada} onFim={setResultado} />
    ) : (
      <RodadaDeDigitacao rodada={rodada} onFim={setResultado} />
    );
  }

  const nenhumLivre = NIVEIS.every(travado);
  const tituloId = "rodada-titulo";
  return (
    <Card as="section" aria-labelledby={tituloId} className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 flex-shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand">
          <IconeDoTeste teste={teste} size={20} />
        </span>
        <div>
          <h2 id={tituloId} className="text-section font-semibold text-fg">{ROTULO_DO_TESTE[teste]}</h2>
          <p className="text-ui text-fg-secondary">{DESCRICAO_DO_TESTE[teste]}</p>
        </div>
      </div>

      {motivoSemTeste ? (
        <Aviso tom="info">{motivoSemTeste}</Aviso>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span id="modo-rotulo" className="text-label font-medium text-fg">Modo</span>
            <SegmentedControl
              label="Modo"
              active={modo}
              onChange={trocarModo}
              tocavel
              tone="brand"
              items={[
                { key: "valendo", label: "Valendo" },
                { key: "treino", label: "Treino livre" },
              ]}
            />
            <p className="text-helper text-fg-muted">
              {modo === "valendo"
                ? "Vale para o ranking do mês. Uma tentativa por dia em cada nível, e ela conta assim que o teste aparece, mesmo se você sair no meio."
                : "Sem limite e fora do ranking: para pegar o jeito."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-label font-medium text-fg">Nível</span>
            <SegmentedControl
              label="Nível"
              active={nivel}
              onChange={setNivel}
              tocavel
              tone="brand"
              items={NIVEIS.map((n) => ({
                key: n,
                label: ROTULO_DO_NIVEL[n],
                disabled: travado(n),
                title: !disponivel[n] ? "Ainda sem conteúdo neste nível" : modo === "valendo" && usados.includes(n) ? "Tentativa valendo de hoje já usada" : undefined,
              }))}
            />
            <p className="text-helper text-fg-muted">
              {teste === "logica"
                ? `${QUESTOES_POR_RODADA} questões em ${TEMPO_DA_LOGICA_S / 60} minutos. O relógio começa assim que as questões aparecem.`
                : "60 segundos, contados a partir da primeira tecla. Colar não vale."}
            </p>
          </div>

          {nenhumLivre && (
            <Aviso tom="neutro">
              {modo === "valendo"
                ? "Você já usou hoje as tentativas valendo deste teste nos níveis disponíveis. Volte amanhã ou treine à vontade no Treino livre."
                : "Ainda não há conteúdo cadastrado neste teste. Peça a quem administra a Academia."}
            </Aviso>
          )}
          {erro && <Aviso>{erro}</Aviso>}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={comecar} disabled={comecando || nenhumLivre || travado(nivel)} className="min-h-11 sm:min-h-0">
              <Play size={14} aria-hidden /> {comecando ? "Preparando…" : modo === "valendo" ? "Começar valendo" : "Começar treino"}
            </Button>
            <Button href="/academia/testes" variant="ghost" className="min-h-11 sm:min-h-0">
              <ArrowLeft size={14} aria-hidden /> Voltar aos testes
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
