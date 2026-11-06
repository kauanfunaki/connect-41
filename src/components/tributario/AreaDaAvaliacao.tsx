"use client";

// A área de trabalho de uma avaliação (o `StudyWorkspace` do Connect
// Tributário, sem documentos, diagnóstico e reforma — Fases 2 a 4).
//
// Mantém as regras de edição do original:
// - `patch`: mudar valores, premissas, atividade, período, elegibilidade ou
//   CNPJ desmarca "Utilizar estas premissas" (é preciso revisar de novo);
// - `campo`: um valor da DRE/avaliação;
// - `base`: as premissas do motor; bases de crédito e ajuste do Real também
//   vão para os valores, divididas por 12 na projeção mensal.
// Salvar é explícito. Sair com alteração não salva pede confirmação, e salvar
// por cima de outra sessão é recusado pelo servidor.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ChartColumn, Database, FileText, History, Layers3, Save, SlidersHorizontal, Trash2, Zap } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { abrirVersaoDaAvaliacao, moverAvaliacaoParaLixeira, salvarAvaliacaoTributaria } from "@/app/(app)/planejamento-tributario/actions";
import { assess } from "@/lib/tributario/avaliacao/assessment";
import type { Study } from "@/lib/tributario/avaliacao/model";
import type { Data } from "@/lib/tributario/motor/fiscal";
import { nomeDoArquivoDoRelatorio, relatorioEmMarkdown } from "@/lib/tributario/relatorio";
import { ROTA_DO_PLANEJAMENTO } from "@/lib/tributario/regras";
import { baixarArquivo } from "./baixarArquivo";
import { DadosGuiados } from "./dados/DadosGuiados";
import { DadosRapidos } from "./dados/DadosRapidos";
import { ROTULO } from "./estilos";
import { HistoricoDaAvaliacao, type VersaoNaTela } from "./HistoricoDaAvaliacao";
import { PremissasDaAvaliacao } from "./premissas/PremissasDaAvaliacao";
import { RelatorioDaAvaliacao, type MarcaDoEscritorio } from "./relatorio/RelatorioDaAvaliacao";
import { Comparativo } from "./resultado/Comparativo";
import { DetalhesDoResultado } from "./resultado/DetalhesDoResultado";
import type { AbaDasPremissas, Edicao, IrPara, Secao } from "./tipos";

type Props = {
  id: string;
  revisaoInicial: number;
  estudoInicial: Study;
  empresa: { id: string; nome: string } | null;
  versoes: VersaoNaTela[];
  marca: MarcaDoEscritorio;
  podeAgir: boolean;
};

/** Mudar uma destas chaves exige rever as premissas (regra do `patch` original). */
const CHAVES_QUE_PEDEM_REVISAO = ["values", "base", "activity", "start", "end", "periodMode", "eligibility", "cnpj", "acceptedSources"];
/** Premissas do motor que também são valores da avaliação (o `basePatch` original). */
const BASES_QUE_SAO_VALORES = [
  ["cbsCreditBase", "base_cbs"],
  ["ibsCreditBase", "base_ibs"],
  ["pisCreditBase", "base_pis_cofins"],
  ["realAdjust", "real_adjust"],
] as const;

function aplicarPatch(s: Study, p: Partial<Study>): Study {
  const pedeRevisao = !("assumptionsReviewed" in p) && CHAVES_QUE_PEDEM_REVISAO.some((k) => k in p);
  return { ...s, ...p, ...(pedeRevisao ? { assumptionsReviewed: false } : {}) };
}

export function AreaDaAvaliacao({ id, revisaoInicial, estudoInicial, empresa, versoes, marca, podeAgir }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  const [estudo, setEstudo] = useState<Study>(estudoInicial);
  const [revisao, setRevisao] = useState(revisaoInicial);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [secao, setSecao] = useState<Secao>("dados");
  const [abaDasPremissas, setAbaDasPremissas] = useState<AbaDasPremissas>("tributacao");
  const [ano, setAno] = useState(2029);
  const [abrindoVersao, setAbrindoVersao] = useState<string | null>(null);

  // O estudo e o "alterado" mais recentes, para o salvar (que espera o servidor)
  // e o aviso de saída lerem fora da renderização.
  const atual = useRef(estudo);
  const alteradoRef = useRef(alterado);
  useEffect(() => {
    atual.current = estudo;
    alteradoRef.current = alterado;
  }, [estudo, alterado]);

  const resultado = useMemo(() => assess(estudo, [], ano), [estudo, ano]);

  // Fechar a aba ou recarregar com alteração não salva: o navegador pergunta.
  useEffect(() => {
    const antes = (e: BeforeUnloadEvent) => {
      if (alteradoRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", antes);
    return () => window.removeEventListener("beforeunload", antes);
  }, []);

  const edicao: Edicao = {
    patch: (p) => {
      setEstudo((s) => aplicarPatch(s, p));
      setAlterado(true);
    },
    campo: (chave, valor) => {
      setEstudo((s) =>
        aplicarPatch(s, { values: { ...s.values, [chave]: valor }, acceptedSources: { ...s.acceptedSources, [chave]: "" } }),
      );
      setAlterado(true);
    },
    base: (p: Partial<Data>) => {
      setEstudo((s) => {
        const values = { ...s.values };
        for (const [base, chave] of BASES_QUE_SAO_VALORES) {
          const v = p[base];
          if (v !== undefined && v !== null) values[chave] = Number(v) / (s.periodMode === "monthly-projection" ? 12 : 1);
        }
        return { ...s, base: { ...s.base, ...p }, values, assumptionsReviewed: false };
      });
      setAlterado(true);
    },
  };

  const irPara: IrPara = (destino, aba) => {
    if (aba) setAbaDasPremissas(aba);
    setSecao(destino);
    requestAnimationFrame(() => document.getElementById("navegacao-da-avaliacao")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  async function salvar() {
    if (!podeAgir || salvando) return;
    setSalvando(true);
    const enviado = atual.current;
    try {
      const r = await salvarAvaliacaoTributaria(id, revisao, enviado);
      if ("error" in r) {
        setErro(r.error);
        toast.error(r.error);
        return;
      }
      if (r.revisao) setRevisao(r.revisao);
      setErro("");
      if (atual.current === enviado) setAlterado(false);
      toast.success("Avaliação salva.");
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  function voltarParaALista() {
    if (!alterado) {
      router.push(ROTA_DO_PLANEJAMENTO);
      return;
    }
    requestConfirm(
      { title: "Descartar as alterações não salvas?", description: "O que não foi salvo nesta avaliação será perdido.", confirmLabel: "Descartar", destructive: true },
      async () => {
        setAlterado(false);
        router.push(ROTA_DO_PLANEJAMENTO);
        return null;
      },
    );
  }

  function moverParaLixeira() {
    requestConfirm(
      {
        title: `Mover “${estudo.name}” para a lixeira?`,
        description:
          "A avaliação sai da lista, com dados e histórico preservados, e pode ser restaurada na aba Lixeira." +
          (alterado ? " As alterações ainda não salvas serão perdidas." : ""),
        confirmLabel: "Mover para a lixeira",
        destructive: true,
      },
      async () => {
        const r = await moverAvaliacaoParaLixeira(id, revisao);
        if ("error" in r) return { error: r.error };
        setAlterado(false);
        toast.success("Avaliação movida para a lixeira.");
        router.push(ROTA_DO_PLANEJAMENTO);
        return null;
      },
    );
  }

  async function abrirVersao(versaoId: string) {
    setAbrindoVersao(versaoId);
    try {
      const r = await abrirVersaoDaAvaliacao(id, versaoId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setEstudo(r.estudo);
      setAlterado(true);
      setSecao("dados");
      toast.show("Versão aberta como rascunho. Salve para que ela passe a ser a atual.", "info");
    } finally {
      setAbrindoVersao(null);
    }
  }

  function baixarRelatorio() {
    baixarArquivo(
      nomeDoArquivoDoRelatorio(estudo),
      relatorioEmMarkdown({ estudo, ano, revisao, alteracoesNaoSalvas: alterado, avaliacaoId: id }),
    );
  }

  const rapida = estudo.mode === "quick";

  return (
    <div className="space-y-4">
      {dialog}
      <header className="space-y-3">
        <Button variant="linkMuted" size="sm" onClick={voltarParaALista}>
          <ArrowLeft size={16} /> Avaliações
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={ROTULO}>{rapida ? "Avaliação rápida" : "Avaliação analítica"}</p>
            <h1 className="text-display font-semibold text-fg break-words">{estudo.name}</h1>
            <p className="text-helper text-fg-secondary">
              Revisão {revisao} · {alterado ? "Alterações não salvas" : "Salvo"}
              {empresa && (
                <>
                  {" · "}
                  <Link href={`/empresas/${empresa.id}`} className="text-brand hover:underline">
                    {empresa.nome}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {podeAgir && (
              <Button onClick={salvar} loading={salvando} disabled={!alterado && !salvando}>
                <Save size={17} /> Salvar
              </Button>
            )}
            {podeAgir && (
              <MenuDeMaisAcoes rotulo="Mais ações da avaliação" align="right" width={220} sempreMenu>
                {({ close }) => (
                  <ItemDoMenu
                    icone={<Trash2 size={15} />}
                    danger
                    onClick={() => {
                      close();
                      moverParaLixeira();
                    }}
                  >
                    Mover para a lixeira
                  </ItemDoMenu>
                )}
              </MenuDeMaisAcoes>
            )}
          </div>
        </div>
        {!podeAgir && (
          <Aviso tom="info">Você pode consultar e simular nesta avaliação, mas não salvar: seu perfil só tem leitura neste setor.</Aviso>
        )}
      </header>

      <nav id="navegacao-da-avaliacao" aria-label="Seções da avaliação">
        <Tabs
          active={secao}
          onChange={(k) => setSecao(k as Secao)}
          tabs={[
            { key: "dados", label: "Dados", icon: <Database size={15} /> },
            { key: "premissas", label: "Premissas", icon: <SlidersHorizontal size={15} /> },
            { key: "resultado", label: "Resultado", icon: <ChartColumn size={15} /> },
            { key: "relatorio", label: "Relatório", icon: <FileText size={15} /> },
            { key: "historico", label: "Histórico", icon: <History size={15} />, count: versoes.length },
          ]}
        />
      </nav>

      {erro && (
        <Aviso tom="perigo">
          {erro}{" "}
          <Button variant="link" size="xs" onClick={() => setErro("")}>
            Fechar
          </Button>
        </Aviso>
      )}

      {secao === "dados" && (
        <div className="space-y-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (rapida ? edicao.patch({ mode: "guided", step: 0 }) : edicao.patch({ mode: "quick" }))}
          >
            {rapida ? <Layers3 size={17} /> : <Zap size={17} />}
            {rapida ? "Aprofundar esta avaliação" : "Voltar aos totais rápidos"} <ArrowRight size={16} />
          </Button>
          {rapida ? (
            <DadosRapidos estudo={estudo} resultado={resultado} edicao={edicao} irPara={irPara} />
          ) : (
            <DadosGuiados estudo={estudo} resultado={resultado} edicao={edicao} irPara={irPara} />
          )}
        </div>
      )}

      {secao === "premissas" && (
        <PremissasDaAvaliacao
          estudo={estudo}
          resultado={resultado}
          edicao={edicao}
          aba={abaDasPremissas}
          onAba={setAbaDasPremissas}
          irPara={irPara}
          onSalvar={salvar}
          salvando={salvando}
        />
      )}

      {secao === "resultado" && (
        <div className="space-y-4">
          <Comparativo estudo={estudo} resultado={resultado} ano={ano} onAno={setAno} irPara={irPara} />
          <DetalhesDoResultado estudo={estudo} ano={ano} onAno={setAno} />
        </div>
      )}

      {secao === "relatorio" && (
        <RelatorioDaAvaliacao
          estudo={estudo}
          ano={ano}
          revisao={revisao}
          alteracoesNaoSalvas={alterado}
          marca={marca}
          onBaixar={baixarRelatorio}
          onChange={edicao.patch}
          podeEditar={podeAgir}
        />
      )}

      {secao === "historico" && (
        <HistoricoDaAvaliacao versoes={versoes} revisaoAtual={revisao} abrindo={abrindoVersao} onAbrir={abrirVersao} />
      )}
    </div>
  );
}
