"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ListChecks, Plus, EyeOff, Undo2, RotateCcw, Sparkles, Lock, ArrowLeftRight, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import type { VarianteDoBadge } from "@/components/ui/Badge";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { TOM_DA_SITUACAO } from "@/components/financeiro/tomDaSituacao";
import { Input } from "@/components/ui/Input";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoMes } from "@/components/ui/CampoMes";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/useConfirm";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import {
  confirmarConciliacao,
  desfazerConciliacao,
  criarLancamentoDaTransacao,
  ignorarTransacao,
  reabrirTransacao,
  lancamentosParaEscolha,
  transferirEntreContas,
  type LancamentoParaEscolha,
} from "@/app/(app)/conciliacao/actions";
import { lancarPelaRegra } from "@/app/(app)/conciliacao/regras/actions";
import { FormularioDaRegra, PreviaDaRegra, DesfazerDaRegra } from "./RegraDeConciliacao";
import { camposDaLinha, type CamposDaRegra } from "@/lib/financeiro/conciliacao/regras";
import { moeda } from "@/lib/financeiro/formato";
import { dataCurta } from "./data";
import { formatarCompetencia, formatarNumero } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import type { AjusteDaConciliacao } from "@/lib/financeiro/conciliacao/ajuste";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { CamposDaContraparteNova } from "@/components/financeiro/ContraparteNova";
import { CampoDeProjeto } from "@/components/financeiro/CampoDeProjeto";
import { CamposDoRateio } from "@/components/financeiro/CamposDoRateio";
import { BARRAS_DO_NIVEL, ROTULO_DO_NIVEL, EXPLICACAO_DO_NIVEL, type NivelDoCasamento } from "@/lib/financeiro/conciliacao/casamento";

export type LancamentoResumido = {
  id: string;
  contraparteNome: string;
  descricao: string | null;
  centavos: number;
  vencimentoKey: string;
  pagoEmKey: string | null;
};

export type LinhaDaTransacao = {
  id: string;
  dataKey: string;
  centavos: number;
  memo: string | null;
  nome: string | null;
  status: "PENDENTE" | "CONCILIADA" | "IGNORADA";
  /** Conciliada porque a baixa já estava conciliada no Omie. */
  viaOmie: boolean;
  ignoredReason: string | null;
  /**
   * Só em pendente, e só quando a regra de casamento tem certeza razoável. Com
   * `bloqueio`, é uma conta travada na aprovação: mostra o motivo, não confirma.
   */
  sugestao: (LancamentoResumido & { motivo: string; bloqueio: string | null }) | null;
  /**
   * Sem sugestão forte, o candidato que se destaca dos outros (19/10, as
   * "torres" do Omie): mostrado para a pessoa conferir e conciliar com um clique.
   */
  provavel: (LancamentoResumido & { motivo: string; bloqueio: string | null }) | null;
  /** O grau de casamento da pendente — as barras. Nulo fora da pendente. */
  nivel: NivelDoCasamento | null;
  /** Lançamentos de valor exato — com ou sem sugestão forte. */
  candidatosDeMesmoValor: number;
  /** Quantos desses estão travados na aprovação por alçada. */
  travadosDeMesmoValor: number;
  vinculados: LancamentoResumido[];
  /** Conciliada como transferência entre contas (19/10): desfazer desfaz as duas pontas. */
  transferencia: boolean;
  /**
   * Na pendente sem sugestão forte, a regra de conciliação que pega a linha
   * (21/10). `aviso` diz por que a regra em "lançar sozinha" só sugere aqui.
   */
  regra: { id: string; nome: string; acao: string; aviso: string | null } | null;
  /** Na conciliada por uma regra: o registro — desfazer é o da regra, que cancela o lançamento. */
  regraAplicada: { applicationId: string; nome: string; automatica: boolean } | null;
  /** Na conciliada com um lançamento só, à mão: o que a regra "sempre que vier assim" copia. */
  paraRegra: {
    counterpartyId: string;
    categoryId: string | null;
    costCenterId: string | null;
    projectId: string | null;
    contraparteNome: string;
  } | null;
};

type Contraparte = { id: string; nome: string; documento: string | null; defaultCategoryId: string | null; defaultCostCenterId?: string | null };
type Centro = { id: string; nome: string };
type Projeto = { id: string; nome: string };
type Categoria = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

// Situação da transação no `Selo` miúdo (escolha 2A, 08/10/2026). Ignorada é
// encerrada — saiu da fila de propósito —, então neutra, como no mapa do BPO.
const STATUS: Record<LinhaDaTransacao["status"], { rotulo: string; variante: VarianteDoBadge }> = {
  PENDENTE: { rotulo: "Pendente", variante: "warning" },
  CONCILIADA: { rotulo: "Conciliada", variante: "success" },
  IGNORADA: { rotulo: "Ignorada", variante: TOM_DA_SITUACAO.IGNORADA },
};

function descricaoDaTransacao(l: Pick<LinhaDaTransacao, "memo" | "nome">): string {
  return [l.nome, l.memo].filter(Boolean).join(" · ") || "Sem descrição no extrato";
}

/**
 * As "torres" do Omie (19/10): quatro barras, cheias até o grau de casamento.
 * O nome do nível vai do lado, em texto miúdo — barra sozinha não diz nada a
 * quem nunca usou o Omie, e a cor não pode ser a única pista.
 */
function SinalDoCasamento({ nivel }: { nivel: NivelDoCasamento }) {
  const cheias = BARRAS_DO_NIVEL[nivel];
  const cor = nivel === "encontrado" ? "bg-success" : nivel === "nenhum" ? "bg-fg-muted" : "bg-brand";
  return (
    <span className="inline-flex items-center gap-1.5" title={EXPLICACAO_DO_NIVEL[nivel]}>
      <span aria-hidden className="inline-flex h-3.5 items-end gap-[2px]">
        {[1, 2, 3, 4].map((b) => (
          <span key={b} className={`w-[3px] rounded-sm ${b <= cheias ? cor : "bg-border"}`} style={{ height: `${b * 25}%` }} />
        ))}
      </span>
      <span className="text-micro text-fg-muted whitespace-nowrap">{ROTULO_DO_NIVEL[nivel]}</span>
    </span>
  );
}

function avisoDeTravados(candidatos: number, travados: number): string | null {
  if (travados === 0) return null;
  if (travados === candidatos) return candidatos === 1 ? "Ele está travado na aprovação." : "Todos estão travados na aprovação.";
  return travados === 1 ? "1 deles está travado na aprovação." : `${travados} deles estão travados na aprovação.`;
}

/**
 * A lista de transações de uma conta, com as ações de cada linha.
 *
 * Os modais (escolher, criar, ignorar) vivem aqui, uma vez, e não em cada
 * linha: contrapartes e categorias da empresa podem ser centenas, e repeti-las
 * em trezentas linhas multiplicaria o que o servidor manda para o navegador.
 */
export function TransacoesDaConta({
  linhas,
  podeAgir,
  contrapartes,
  categorias,
  centros = [],
  projetos = [],
  companyId,
  bankAccountId,
  outrasContas = [],
  contasDaRegra = [],
  lidaDoOmie = false,
}: {
  linhas: LinhaDaTransacao[];
  podeAgir: boolean;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  /** Centros de custo ativos da empresa; sem nenhum, o campo não aparece. */
  centros?: Centro[];
  /** Projetos ativos da empresa; sem nenhum, o campo aparece desabilitado e diz onde cadastrar. */
  projetos?: Projeto[];
  /** A empresa da conta — a busca pelo CNPJ diz se a ficha já existe nela. */
  companyId: string;
  /** A conta do extrato — a regra criada de uma linha nasce valendo só nela. */
  bankAccountId: string;
  /** As outras contas ativas da empresa. Sem nenhuma, não há "Transferência". */
  outrasContas?: { id: string; nome: string }[];
  /** As contas com extrato da empresa, para a condição da regra. */
  contasDaRegra?: { id: string; nome: string }[];
  /** A empresa ainda é lida do Omie (lote E): a regra só sugere. */
  lidaDoOmie?: boolean;
}) {
  const { dialog, requestConfirm } = useConfirm();
  const [escolhendo, setEscolhendo] = useState<LinhaDaTransacao | null>(null);
  const [criando, setCriando] = useState<LinhaDaTransacao | null>(null);
  const [ignorando, setIgnorando] = useState<LinhaDaTransacao | null>(null);
  const [transferindo, setTransferindo] = useState<LinhaDaTransacao | null>(null);
  // A regra "sempre que vier assim" (21/10): oferecida depois do "Criar
  // lançamento", ou pedida na linha conciliada. Criada, abre a prévia.
  const [oferta, setOferta] = useState<{ linha: LinhaDaTransacao; campos: CamposDaRegra } | null>(null);
  const [regraNova, setRegraNova] = useState<{ linha: LinhaDaTransacao; campos: CamposDaRegra } | null>(null);
  const [previa, setPrevia] = useState<{ id: string; nome: string } | null>(null);
  const opcoesDaRegra = {
    contrapartes: contrapartes.map((c) => ({ id: c.id, nome: c.nome, documento: c.documento })),
    categorias,
    centros,
    projetos,
    contas: contasDaRegra,
  };

  function camposDe(l: LinhaDaTransacao, lancamento: NonNullable<LinhaDaTransacao["paraRegra"]>): CamposDaRegra {
    return camposDaLinha({ centavos: l.centavos, memo: l.memo, nome: l.nome, bankAccountId, contraparteNome: lancamento.contraparteNome }, lancamento);
  }

  function lancarComRegra(l: LinhaDaTransacao) {
    const r = l.regra!;
    requestConfirm(
      {
        title: "Lançar pela regra?",
        description: `${moeda(Math.abs(l.centavos))} de ${dataCurta(l.dataKey)} vira um lançamento pago e conciliado: ${r.acao}.${r.aviso ? ` ${r.aviso}` : ""}`,
        confirmLabel: "Lançar",
      },
      async () => {
        const res = await lancarPelaRegra(l.id, r.id);
        if ("error" in res) throw new Error(res.error);
      }
    );
  }

  function confirmarSugestao(l: LinhaDaTransacao) {
    const s = l.sugestao!;
    requestConfirm(
      {
        title: "Confirmar a conciliação?",
        description: `${moeda(Math.abs(l.centavos))} de ${dataCurta(l.dataKey)} liquida "${s.contraparteNome}". O lançamento fica pago em ${dataCurta(l.dataKey)}.`,
        confirmLabel: "Confirmar",
      },
      async () => {
        const r = await confirmarConciliacao(l.id, [s.id]);
        if ("error" in r) throw new Error(r.error);
      }
    );
  }

  function conciliarComProvavel(l: LinhaDaTransacao) {
    const p = l.provavel!;
    requestConfirm(
      {
        title: "Conciliar com este lançamento?",
        description: `${moeda(Math.abs(l.centavos))} de ${dataCurta(l.dataKey)} liquida "${p.contraparteNome}" (${p.motivo}). Não há certeza de que é este — confira. O lançamento fica pago em ${dataCurta(l.dataKey)}.`,
        confirmLabel: "Conciliar",
      },
      async () => {
        const r = await confirmarConciliacao(l.id, [p.id]);
        if ("error" in r) throw new Error(r.error);
      }
    );
  }

  function desfazer(l: LinhaDaTransacao) {
    requestConfirm(
      {
        title: l.transferencia ? "Desfazer a transferência?" : "Desfazer a conciliação?",
        description: l.transferencia
          ? "Os dois lançamentos da transferência são cancelados, e esta linha — e a da outra conta, se estava conciliada — voltam a pendente."
          : "A transação volta a pendente e cada lançamento volta ao que era antes — em aberto, ou pago na data original.",
        confirmLabel: "Desfazer",
        destructive: true,
      },
      async () => {
        const r = await desfazerConciliacao(l.id);
        if ("error" in r) throw new Error(r.error);
      }
    );
  }

  function reabrir(l: LinhaDaTransacao) {
    requestConfirm({ title: "Reabrir a transação?", description: "Ela volta para as pendentes.", confirmLabel: "Reabrir" }, async () => {
      const r = await reabrirTransacao(l.id);
      if ("error" in r) throw new Error(r.error);
    });
  }

  const rotuloDoStatus = (l: LinhaDaTransacao) => (l.status === "CONCILIADA" && l.viaOmie ? "Conciliada no Omie" : STATUS[l.status].rotulo);

  return (
    <>
      {/* Casco padrão e funil nas colunas (conferência de 30/09). Continua com
          rolagem lateral no celular: é grade de extrato, não lista de cartões. */}
      <TabelaFiltravel
        linhas={linhas.map((l) => ({
          id: l.id,
          valores: {
            data: l.dataKey,
            extrato: l.nome ?? "",
            tipo: l.centavos < 0 ? "Saída" : "Entrada",
            situacao: rotuloDoStatus(l),
            casamento: l.nivel ? ROTULO_DO_NIVEL[l.nivel] : "",
          },
        }))}
      >
      <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Data" chave="data" tipo="data" />
              </th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Extrato" campos={[{ chave: "extrato", rotulo: "Nome no extrato" }]} />
              </th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna rotulo="Valor" campos={[{ chave: "tipo", rotulo: "Entrada ou saída" }]} />
              </th>
              <th className="py-2 pr-3 font-medium">
                <FiltroDaColuna
                  rotulo="Situação"
                  campos={[
                    { chave: "situacao", rotulo: "Situação" },
                    { chave: "casamento", rotulo: "Casamento" },
                  ]}
                />
              </th>
              <th className="py-2 font-medium">Lançamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border-soft align-top">
                <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{dataCurta(l.dataKey)}</td>
                <td className="py-2.5 pr-3 max-w-[300px]">
                  <span className="block break-words">{descricaoDaTransacao(l)}</span>
                </td>
                {/* Valor neutro (D1, 15/10/2026): entrada e saída são categoria,
                    não situação — o "−" já diz o sinal, como no Fluxo de caixa. */}
                <td className="py-2.5 pr-3 text-right tabular-nums font-medium whitespace-nowrap">
                  {moeda(l.centavos)}
                </td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-col items-start gap-1">
                    <Selo tom={tomDaVariante(STATUS[l.status].variante)}>{rotuloDoStatus(l)}</Selo>
                    {l.nivel && <SinalDoCasamento nivel={l.nivel} />}
                  </div>
                </td>
                <td className="py-2.5">
                  {l.status === "PENDENTE" && (
                    <div className="flex flex-col gap-2 items-start">
                      {/* A sugestão e a conta travada no `Aviso` do app (15/10/2026):
                          eram caixas com borda e fundo próprios. */}
                      {l.sugestao?.bloqueio ? (
                        <Aviso tom="atencao" icone={<Lock />} className="max-w-[420px]">
                          <span className="flex flex-col gap-0.5">
                            <span className="text-micro font-medium">
                              Casa com uma conta travada na aprovação · {l.sugestao.motivo}
                            </span>
                            <ResumoDoLancamento l={l.sugestao} />
                            <span className="text-micro text-fg-secondary">
                              {l.sugestao.bloqueio} Não crie outro lançamento para esta transação: concilie depois da aprovação.
                            </span>
                          </span>
                        </Aviso>
                      ) : l.sugestao ? (
                        <Aviso tom="marca" icone={<Sparkles />}>
                          <span className="flex flex-col gap-0.5">
                            <span className="text-micro font-medium">Sugestão · {l.sugestao.motivo}</span>
                            <ResumoDoLancamento l={l.sugestao} />
                          </span>
                        </Aviso>
                      ) : l.provavel ? (
                        // O mais provável, sem a certeza da sugestão: tom neutro
                        // e "conciliar com este", não "confirmar".
                        <Aviso tom="neutro" icone={l.provavel.bloqueio ? <Lock /> : <ListChecks />} className="max-w-[420px]">
                          <span className="flex flex-col gap-0.5">
                            <span className="text-micro font-medium">
                              Mais provável · {l.provavel.motivo}
                              {l.candidatosDeMesmoValor > 1 && ` · ${l.candidatosDeMesmoValor} de mesmo valor`}
                            </span>
                            <ResumoDoLancamento l={l.provavel} />
                            {l.provavel.bloqueio && <span className="text-micro text-fg-secondary">{l.provavel.bloqueio}</span>}
                          </span>
                        </Aviso>
                      ) : (
                        l.candidatosDeMesmoValor > 0 && (
                          <span className="text-micro text-fg-muted">
                            {l.candidatosDeMesmoValor} {l.candidatosDeMesmoValor === 1 ? "lançamento" : "lançamentos"} de mesmo valor,
                            sem um claramente melhor — escolha. {avisoDeTravados(l.candidatosDeMesmoValor, l.travadosDeMesmoValor)}
                          </span>
                        )
                      )}
                      {l.regra && (
                        <Aviso tom="marca" icone={<Wand2 />} className="max-w-[420px]">
                          <span className="flex flex-col gap-0.5">
                            <span className="text-micro font-medium">Regra · {l.regra.nome}</span>
                            <span className="text-fs-2 text-fg-secondary">{l.regra.acao}</span>
                            {l.regra.aviso && <span className="text-micro text-fg-secondary">{l.regra.aviso}</span>}
                          </span>
                        </Aviso>
                      )}
                      {podeAgir && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {l.sugestao && !l.sugestao.bloqueio && (
                            <Button size="xs" onClick={() => confirmarSugestao(l)}>
                              <Check size={12} /> Confirmar
                            </Button>
                          )}
                          {l.provavel && !l.provavel.bloqueio && (
                            <Button size="xs" variant="secondary" onClick={() => conciliarComProvavel(l)}>
                              <Check size={12} /> Conciliar com este
                            </Button>
                          )}
                          {l.regra && (
                            <Button size="xs" variant={l.provavel ? "secondary" : "primary"} onClick={() => lancarComRegra(l)}>
                              <Wand2 size={12} /> Lançar pela regra
                            </Button>
                          )}
                          <Button size="xs" variant="secondary" onClick={() => setEscolhendo(l)}>
                            <ListChecks size={12} /> Escolher lançamentos
                          </Button>
                          <Button size="xs" variant="secondary" onClick={() => setCriando(l)}>
                            <Plus size={12} /> Criar lançamento
                          </Button>
                          {outrasContas.length > 0 && (
                            <Button size="xs" variant="secondary" onClick={() => setTransferindo(l)}>
                              <ArrowLeftRight size={12} /> Transferência
                            </Button>
                          )}
                          <Button size="xs" variant="ghost" onClick={() => setIgnorando(l)}>
                            <EyeOff size={12} /> Ignorar
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {l.status === "CONCILIADA" && (
                    <div className="flex flex-col gap-1.5 items-start">
                      {l.vinculados.map((v) => (
                        <ResumoDoLancamento key={v.id} l={v} />
                      ))}
                      {l.regraAplicada && (
                        <span className="inline-flex items-center gap-1 text-micro text-fg-muted">
                          <Wand2 size={12} className="flex-shrink-0" />
                          {l.regraAplicada.automatica ? "Lançada sozinha pela regra" : "Lançada pela regra"} “{l.regraAplicada.nome}”
                        </span>
                      )}
                      {podeAgir && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* O desfazer da regra cancela o lançamento que ela criou; o
                              comum deixaria a conta em aberto, à espera de outra linha. */}
                          {l.regraAplicada ? (
                            <DesfazerDaRegra applicationId={l.regraAplicada.applicationId} nome={l.regraAplicada.nome} />
                          ) : (
                            <Button variant="secondary" size="xs" onClick={() => desfazer(l)}>
                              <Undo2 size={12} /> Desfazer
                            </Button>
                          )}
                          {l.paraRegra && (
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => setRegraNova({ linha: l, campos: camposDe(l, l.paraRegra!) })}
                              title="Sempre que vier uma linha assim, lançar igual"
                            >
                              <Wand2 size={12} /> Criar regra
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {l.status === "IGNORADA" && (
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-fs-2 text-fg-secondary">{l.ignoredReason}</span>
                      {podeAgir && (
                        <Button variant="secondary" size="xs" onClick={() => reabrir(l)}>
                          <RotateCcw size={12} /> Reabrir
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </LinhaFiltravel>
            ))}
          </tbody>
        </table>
      </div>
      </TabelaFiltravel>

      {dialog}
      {escolhendo && <EscolherLancamentos transacao={escolhendo} onClose={() => setEscolhendo(null)} />}
      {transferindo && <TransferirEntreContas transacao={transferindo} contas={outrasContas} onClose={() => setTransferindo(null)} />}
      {criando && (
        <CriarLancamento
          transacao={criando}
          companyId={companyId}
          contrapartes={contrapartes}
          categorias={categorias}
          centros={centros}
          projetos={projetos}
          onClose={() => setCriando(null)}
          onCriado={(lancamento, rateado) => {
            // A regra lança numa categoria só: para a conta rateada, não se oferece.
            if (rateado) return;
            const contraparteNome = contrapartes.find((c) => c.id === lancamento.counterpartyId)?.nome ?? null;
            setOferta({ linha: criando, campos: camposDe(criando, { ...lancamento, contraparteNome: contraparteNome ?? criando.nome ?? "" }) });
          }}
        />
      )}
      {oferta && (
        <Modal open onClose={() => setOferta(null)} title="Lançado e conciliado">
          <div className="flex flex-col gap-4">
            <p className="text-helper text-fg-secondary">
              Isto se repete? Com uma regra de conciliação, o Connect sugere — ou lança sozinho — as próximas linhas assim do
              extrato, com o mesmo lançamento.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setOferta(null)}>
                Agora não
              </Button>
              <Button
                onClick={() => {
                  setRegraNova(oferta);
                  setOferta(null);
                }}
              >
                <Wand2 size={14} /> Criar regra
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {regraNova && (
        <FormularioDaRegra
          companyId={companyId}
          inicial={regraNova.campos}
          opcoes={opcoesDaRegra}
          lidaDoOmie={lidaDoOmie}
          porQue={
            <>
              Sempre que vier uma linha assim — {dataCurta(regraNova.linha.dataKey)} · {descricaoDaTransacao(regraNova.linha)} ·{" "}
              <strong className="text-fg">{moeda(regraNova.linha.centavos)}</strong> —, lançar igual. Ajuste o texto e o valor: o que
              muda todo mês (data, número do documento) não deve entrar.
            </>
          }
          onClose={() => setRegraNova(null)}
          onSalva={(r) => r.nova && setPrevia({ id: r.id, nome: r.nome })}
        />
      )}
      {previa && <PreviaDaRegra id={previa.id} nome={previa.nome} onClose={() => setPrevia(null)} />}
      {ignorando && <IgnorarTransacao transacao={ignorando} onClose={() => setIgnorando(null)} />}
    </>
  );
}

function ResumoDoLancamento({ l }: { l: LancamentoResumido }) {
  return (
    <span className="text-fs-2 text-fg-secondary">
      <span className="font-medium text-fg">{l.contraparteNome}</span>
      {l.descricao && <span className="text-fg-muted"> · {l.descricao}</span>}
      <span className="block text-micro text-fg-muted tabular-nums">
        {moeda(l.centavos)} · venc. {dataCurta(l.vencimentoKey)}
        {l.pagoEmKey && ` · baixa ${dataCurta(l.pagoEmKey)}`}
      </span>
    </span>
  );
}

// ─── Escolher lançamentos ───────────────────────────────────────────────────

function EscolherLancamentos({ transacao, onClose }: { transacao: LinhaDaTransacao; onClose: () => void }) {
  const alvo = Math.abs(transacao.centavos);
  const aPagar = transacao.centavos < 0;
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<LancamentoParaEscolha[] | null>(null);
  const [limitado, setLimitado] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, LancamentoParaEscolha>>(new Map());
  // A diferença com uma conta só (fila do BPO, 19/10): juros e multa quando a
  // linha passa da conta; desconto ou baixa parcial quando fica abaixo.
  const [jurosTexto, setJurosTexto] = useState<string | null>(null);
  const [multaTexto, setMultaTexto] = useState("");
  const [abaixo, setAbaixo] = useState<"desconto" | "parcial" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, startCarga] = useTransition();
  const [salvando, startSalvar] = useTransition();

  function carregar(termo: string) {
    setErro(null);
    startCarga(async () => {
      const r = await lancamentosParaEscolha(transacao.id, termo);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setLista(r.lancamentos);
      setLimitado(r.limitado);
    });
  }

  // Primeira carga ao abrir — o modal só monta quando é aberto.
  useEffect(() => {
    let vivo = true;
    lancamentosParaEscolha(transacao.id, "").then((r) => {
      if (!vivo) return;
      if ("error" in r) setErro(r.error);
      else {
        setLista(r.lancamentos);
        setLimitado(r.limitado);
      }
    });
    return () => {
      vivo = false;
    };
  }, [transacao.id]);

  const soma = [...marcados.values()].reduce((a, l) => a + l.centavos, 0);
  const falta = alvo - soma;
  const unica = marcados.size === 1 && ![...marcados.values()][0]!.ehBaixa;

  // Juros, sem nada digitado, é o que a multa deixa da diferença.
  const lido = (t: string) => (t.trim() === "" ? 0 : centavosDeTexto(t));
  const multa = lido(multaTexto);
  const juros = jurosTexto === null ? (multa === null ? null : Math.max(0, falta - multa)) : lido(jurosTexto);
  const encargosFecham = juros !== null && multa !== null && juros + multa === falta;

  const ajuste: AjusteDaConciliacao | null =
    !unica || falta === 0
      ? null
      : falta > 0
        ? encargosFecham
          ? { tipo: "encargos", jurosCentavos: juros!, multaCentavos: multa! }
          : null
        : abaixo
          ? { tipo: abaixo }
          : null;
  const podeConciliar = marcados.size > 0 && (falta === 0 || ajuste !== null);

  function alternar(l: LancamentoParaEscolha) {
    setMarcados((atual) => {
      const novo = new Map(atual);
      if (novo.has(l.id)) novo.delete(l.id);
      else novo.set(l.id, l);
      return novo;
    });
    setJurosTexto(null);
    setMultaTexto("");
    setAbaixo(null);
  }

  function notaDaSoma() {
    if (marcados.size === 0 || falta === 0) return null;
    if (ajuste?.tipo === "encargos") return <span> · conta {moeda(soma)} + juros e multa {moeda(falta)}</span>;
    if (ajuste?.tipo === "desconto") return <span> · conta {moeda(soma)} − desconto {moeda(-falta)}</span>;
    if (ajuste?.tipo === "parcial") return <span> · baixa parcial: ficam {moeda(-falta)} em aberto</span>;
    return <span className="text-danger"> · {falta > 0 ? `faltam ${moeda(falta)}` : `passou ${moeda(-falta)}`}</span>;
  }

  return (
    <Modal open onClose={onClose} title="Escolher lançamentos" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-4">
        <p className="text-helper text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} ·{" "}
          <strong className="text-fg">{moeda(transacao.centavos)}</strong>. Marque um ou mais
          lançamentos {aPagar ? "a pagar" : "a receber"} cuja soma feche o valor no centavo — ou uma conta só, e
          lance a diferença como juros, desconto ou baixa parcial.
        </p>
        {/* A caixa de busca do Connect (15/10/2026): Enter busca e o "limpar"
            volta à lista inicial — era um campo comum com o botão "Buscar". O
            termo sai do formulário, e não do estado, que no "limpar" ainda
            não foi atualizado quando o envio acontece. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            carregar(String(new FormData(e.currentTarget).get("q") ?? ""));
          }}
        >
          <CampoDeBusca
            compact
            name="q"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            enviarAoLimpar
            placeholder="Nome, descrição, valor ou data (ex.: 150,00 ou 15/10)"
            aria-label="Buscar lançamento"
            className="w-96 max-w-full"
          />
        </form>

        <div className="max-h-[380px] overflow-y-auto border border-border rounded-md">
          {lista === null || carregando ? (
            <p className="p-3 text-fs-2 text-fg-muted">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="p-3 text-fs-2 text-fg-muted">
              Nenhum lançamento em aberto ou sem conciliação {busca ? "com esta busca" : "perto desta data"}. Busque pelo
              nome, pelo valor ou pela data, ou crie o lançamento.
            </p>
          ) : (
            <table className="w-full text-ui">
              <tbody>
                {lista.map((l) => {
                  const id = `escolha-${l.id}`;
                  return (
                    <tr key={l.id} className={`border-b border-border-soft ${l.centavos === alvo && !l.bloqueio ? "bg-brand/5" : ""}`}>
                      <td className="py-2 px-3 w-8">
                        <Checkbox id={id} checked={marcados.has(l.id)} onChange={() => alternar(l)} disabled={Boolean(l.bloqueio)} />
                      </td>
                      <td className="py-2 pr-3">
                        <label htmlFor={id} className={l.bloqueio ? "cursor-not-allowed" : "cursor-pointer"}>
                          <span className={`font-medium ${l.bloqueio ? "text-fg-muted" : "text-fg"}`}>{l.contraparteNome}</span>
                          {l.descricao && <span className="text-fg-muted"> · {l.descricao}</span>}
                          <span className="block text-micro text-fg-muted">
                            venc. {dataCurta(l.vencimentoKey)}
                            {l.pagoEmKey && ` · baixa ${dataCurta(l.pagoEmKey)}`} · comp. {formatarCompetencia(l.competencia)}
                            {l.centavos === alvo && " · mesmo valor"}
                          </span>
                          {l.bloqueio && (
                            <span className="flex items-center gap-1 text-micro text-warning-fg">
                              <Lock size={12} className="flex-shrink-0" /> {l.bloqueio}
                            </span>
                          )}
                        </label>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(l.centavos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {limitado && <p className="text-micro text-fg-muted">Mostrando os 200 primeiros. Refine pela busca.</p>}

        {unica && falta > 0 && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <p className="text-fs-2 text-fg">
              A linha passa da conta em <strong className="tabular-nums">{moeda(falta)}</strong>. Lance a diferença como juros e
              multa — a conta fica {aPagar ? "paga" : "recebida"}, e o total da baixa é o da linha.
            </p>
            <FieldGrid columns="sm:grid-cols-2">
              <CampoForm label="Juros" htmlFor="ajuste-juros">
                <Input
                  id="ajuste-juros"
                  prefix="R$"
                  inputMode="decimal"
                  value={jurosTexto ?? (juros === null ? "" : formatarNumero(juros / 100, 2))}
                  onChange={(e) => setJurosTexto(e.target.value)}
                />
              </CampoForm>
              <CampoForm label="Multa" htmlFor="ajuste-multa">
                <Input id="ajuste-multa" prefix="R$" inputMode="decimal" value={multaTexto} onChange={(e) => setMultaTexto(e.target.value)} placeholder="0,00" />
              </CampoForm>
            </FieldGrid>
            {!encargosFecham && (
              <p className="text-micro text-danger">
                {juros === null || multa === null
                  ? "Juros ou multa ilegível. Use, por exemplo, 12,50."
                  : `Juros e multa somam ${moeda(juros + multa)}; a diferença é ${moeda(falta)}.`}
              </p>
            )}
          </div>
        )}
        {unica && falta < 0 && (
          <RadioGroup
            legenda={`A linha fica ${moeda(-falta)} abaixo da conta`}
            colunas="sm:grid-cols-2"
            valor={abaixo}
            onChange={setAbaixo}
            opcoes={[
              {
                valor: "desconto",
                rotulo: `${aPagar ? "Desconto obtido" : "Desconto concedido"} de ${moeda(-falta)}`,
                descricao: aPagar ? "O fornecedor abateu o resto: a conta fica paga." : "O cliente pagou com desconto: a conta fica recebida.",
              },
              { valor: "parcial", rotulo: "Baixa parcial", descricao: `A conta continua em aberto com ${moeda(-falta)}.` },
            ]}
          />
        )}
        {marcados.size > 1 && falta !== 0 && (
          <p className="text-micro text-fg-muted">Para lançar juros, desconto ou baixa parcial, marque uma conta só.</p>
        )}

        {erro && <Aviso>{erro}</Aviso>}
        {/* O rodapé padrão (08/10/2026), num formulário só dele: a soma do que
            está marcado vai na nota, e o erro, acima, não a esconde. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startSalvar(async () => {
              const r = await confirmarConciliacao(transacao.id, [...marcados.keys()], falta === 0 ? undefined : ajuste);
              if ("error" in r) setErro(r.error);
              else onClose();
            });
          }}
        >
          <FormFooter
            pending={salvando}
            submitLabel="Conciliar"
            pendingLabel="Conciliando…"
            onCancel={onClose}
            submitDisabled={!podeConciliar}
            nota={
              <span className="tabular-nums text-fg">
                Selecionado: <strong>{moeda(soma)}</strong> de {moeda(alvo)}
                {notaDaSoma()}
              </span>
            }
          />
        </form>
      </div>
    </Modal>
  );
}

// ─── Criar lançamento ───────────────────────────────────────────────────────

const NOVA = "__nova__";

function CriarLancamento({
  transacao,
  companyId,
  contrapartes,
  categorias,
  centros,
  projetos,
  onClose,
  onCriado,
}: {
  transacao: LinhaDaTransacao;
  companyId: string;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  centros: Centro[];
  projetos: Projeto[];
  onClose: () => void;
  /** O que foi lançado — a tela oferece a regra "sempre que vier assim". `rateado`: saiu rateada. */
  onCriado?: (
    lancamento: { counterpartyId: string; categoryId: string | null; costCenterId: string | null; projectId: string | null },
    rateado?: boolean
  ) => void;
}) {
  const kind = transacao.centavos < 0 ? "PAGAR" : "RECEBER";
  const doTipo = categorias.filter((c) => c.kind === kind);
  const [contraparte, setContraparte] = useState("");
  const [categoria, setCategoria] = useState("");
  // O rateio na conciliação (lote M1 do mercado, 23/10/2026): as linhas fecham o valor da linha do extrato.
  const [rateando, setRateando] = useState(false);
  const valorDaLinha = Number(Math.abs(transacao.centavos) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // Em branco o servidor herda o padrão da contraparte; a tela só diz qual é.
  const padraoId = contrapartes.find((c) => c.id === contraparte)?.defaultCostCenterId ?? null;
  const centroPadrao = padraoId ? centros.find((c) => c.id === padraoId) : undefined;

  function escolherContraparte(id: string) {
    setContraparte(id);
    const padrao = contrapartes.find((c) => c.id === id)?.defaultCategoryId;
    if (!categoria && padrao && doTipo.some((c) => c.id === padrao)) setCategoria(padrao);
  }

  return (
    <Modal open onClose={onClose} title={kind === "PAGAR" ? "Criar conta a pagar" : "Criar conta a receber"} maxWidth={rateando ? "max-w-3xl" : "max-w-xl"}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          if (contraparte === NOVA) dados.set("counterpartyId", "");
          setErro(null);
          startTransition(async () => {
            const r = await criarLancamentoDaTransacao(dados);
            if ("error" in r) setErro(r.error);
            else {
              onClose();
              onCriado?.(r.lancamento, r.rateado);
            }
          });
        }}
      >
        <input type="hidden" name="transactionId" value={transacao.id} />
        <p className="text-helper text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} ·{" "}
          <strong className="text-fg">{moeda(transacao.centavos)}</strong>. O lançamento nasce pago
          nesta data, com este valor, e já conciliado.
        </p>
        {transacao.sugestao?.bloqueio && (
          // O `Aviso` do app (08/10/2026), com o texto em `fg-secondary` como estava.
          <Aviso tom="atencao" icone={<Lock />}>
            <span className="text-fg-secondary">
              Esta transação parece liquidar <strong>{transacao.sugestao.contraparteNome}</strong>, que já existe e está travada
              na aprovação. Criar outro lançamento duplica a conta — concilie com ela depois de aprovada.
            </span>
          </Aviso>
        )}

        <CampoForm label={kind === "PAGAR" ? "Fornecedor" : "Cliente (sacado)"} htmlFor="criar-contraparte" required>
          <Select id="criar-contraparte" name="counterpartyId" value={contraparte} onChange={(e) => escolherContraparte(e.target.value)} required>
            <option value="" disabled>
              Escolha…
            </option>
            <option value={NOVA}>+ Cadastrar nova contraparte</option>
            {contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.documento ? ` · ${c.documento}` : ""}
              </option>
            ))}
          </Select>
        </CampoForm>

        {/* CNPJ primeiro (19/10, pedido 2 do BPO): a Receita preenche o nome
            no lugar do favorecido do extrato, e o resto da ficha vai junto. */}
        {contraparte === NOVA && (
          <FieldGrid columns="sm:grid-cols-[200px_minmax(0,1fr)]">
            <CamposDaContraparteNova idBase="criar" companyId={companyId} nomePadrao={transacao.nome ?? ""} classeDoAviso="sm:col-span-2" />
          </FieldGrid>
        )}

        <input type="hidden" name="comRateio" value={rateando ? "1" : "0"} />
        <FieldGrid columns={rateando ? "sm:grid-cols-[180px]" : "sm:grid-cols-[minmax(0,1fr)_180px]"}>
          {!rateando && (
            <CampoForm
              label="Categoria"
              htmlFor="criar-categoria"
              required={kind === "PAGAR"}
              helper={kind === "PAGAR" ? "Obrigatória em conta a pagar — despesa sem classificação não fecha o DRE." : undefined}
              acao={
                <Button type="button" variant="link" className="text-helper" onClick={() => setRateando(true)}>
                  Ratear
                </Button>
              }
            >
              <Select id="criar-categoria" name="categoryId" value={categoria} onChange={(e) => setCategoria(e.target.value)} required={kind === "PAGAR"}>
                <option value="">{kind === "PAGAR" ? "Escolha…" : "Sem categoria"}</option>
                {doTipo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
          )}
          <CampoForm label="Competência" htmlFor="criar-competencia" required helper="Padrão: o mês do extrato.">
            <CampoMes id="criar-competencia" name="competencia" defaultValue={transacao.dataKey.slice(0, 7)} required />
          </CampoForm>
        </FieldGrid>

        {/* Rateada, categoria, centro e projeto saem das linhas, que fecham o valor da linha do extrato. */}
        {rateando && (
          <CamposDoRateio
            categorias={doTipo}
            centros={centros}
            projetos={projetos}
            valorTexto={valorDaLinha}
            categoriaInicial={categoria}
            onDesfazer={() => setRateando(false)}
          />
        )}

        {/* Projeto sempre (19/10): ver `CampoDeProjeto`. */}
        {!rateando && (
          <FieldGrid columns={centros.length > 0 ? "sm:grid-cols-2" : "sm:grid-cols-1"}>
            {centros.length > 0 && (
              <CampoForm
                label="Centro de custo"
                htmlFor="criar-centro"
                helper={centroPadrao ? `Em branco, herda o padrão da contraparte: ${centroPadrao.nome}.` : "Opcional."}
              >
                <Select id="criar-centro" name="costCenterId" defaultValue="">
                  <option value="">{centroPadrao ? `Padrão da contraparte (${centroPadrao.nome})` : "Sem centro de custo"}</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            )}
            <CampoDeProjeto id="criar-projeto" companyId={companyId} projetos={projetos} />
          </FieldGrid>
        )}

        <CampoForm label="Descrição" htmlFor="criar-descricao">
          <Input id="criar-descricao" name="descricao" maxLength={255} defaultValue={(transacao.memo ?? transacao.nome ?? "").slice(0, 255)} />
        </CampoForm>

        <FormFooter
          pending={pendente}
          pendingLabel="Criando…"
          submitLabel="Criar e conciliar"
          onCancel={onClose}
          erro={erro}
        />
      </form>
    </Modal>
  );
}

// ─── Transferência entre contas (19/10) ─────────────────────────────────────

function TransferirEntreContas({
  transacao,
  contas,
  onClose,
}: {
  transacao: LinhaDaTransacao;
  contas: { id: string; nome: string }[];
  onClose: () => void;
}) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const sai = transacao.centavos < 0;

  return (
    <Modal open onClose={() => !pendente && onClose()} title="Transferência entre contas" maxWidth="max-w-lg">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await transferirEntreContas(dados);
            if ("error" in r) {
              setErro(r.error);
              return;
            }
            toast.success(r.aviso);
            onClose();
          });
        }}
      >
        <input type="hidden" name="transactionId" value={transacao.id} />
        <p className="text-helper text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} · <strong className="text-fg">{moeda(transacao.centavos)}</strong>.{" "}
          {sai ? "Sai desta conta e entra na conta escolhida." : "Entra nesta conta, vindo da conta escolhida."}
        </p>
        <CampoForm label={sai ? "Para a conta" : "Da conta"} htmlFor="transferencia-conta" required>
          <Select id="transferencia-conta" name="outraContaId" defaultValue={contas.length === 1 ? contas[0]!.id : ""} required>
            <option value="" disabled>
              Escolha…
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <p className="text-helper text-fg-muted">
          Os dois lançamentos — a saída de uma conta e a entrada na outra — nascem pagos neste dia, na categoria de
          transferência, que fica fora da DRE. Se o extrato da outra conta já tem a linha deste valor, ela é conciliada junto.
        </p>
        <FormFooter pending={pendente} pendingLabel="Registrando…" submitLabel="Registrar transferência" onCancel={onClose} erro={erro} />
      </form>
    </Modal>
  );
}

// ─── Ignorar ────────────────────────────────────────────────────────────────

function IgnorarTransacao({ transacao, onClose }: { transacao: LinhaDaTransacao; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <Modal open onClose={onClose} title="Ignorar transação">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          startTransition(async () => {
            const r = await ignorarTransacao(transacao.id, motivo);
            if ("error" in r) setErro(r.error);
            else onClose();
          });
        }}
      >
        <p className="text-helper text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} · {moeda(transacao.centavos)}. Ignorada sai das
          pendentes, mas continua no saldo da conta — o dinheiro passou por ela.
        </p>
        <CampoForm label="Motivo" htmlFor="ignorar-motivo" required helper="Ex.: resgate automático da aplicação, estorno no mesmo dia.">
          <Textarea id="ignorar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} required />
        </CampoForm>
        <FormFooter
          pending={pendente}
          pendingLabel="Ignorando…"
          submitLabel="Ignorar"
          onCancel={onClose}
          erro={erro}
          submitDisabled={motivo.trim().length < 3}
        />
      </form>
    </Modal>
  );
}
