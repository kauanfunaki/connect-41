"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, ListChecks, Plus, EyeOff, Undo2, RotateCcw, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/useConfirm";
import {
  confirmarConciliacao,
  desfazerConciliacao,
  criarLancamentoDaTransacao,
  ignorarTransacao,
  reabrirTransacao,
  lancamentosParaEscolha,
  type LancamentoParaEscolha,
} from "@/app/(app)/conciliacao/actions";
import { moeda, tomDoValor } from "@/lib/financeiro/formato";
import { dataCurta } from "./data";

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
  ignoredReason: string | null;
  /**
   * Só em pendente, e só quando a regra de casamento tem certeza razoável. Com
   * `bloqueio`, é uma conta travada na aprovação: mostra o motivo, não confirma.
   */
  sugestao: (LancamentoResumido & { motivo: string; bloqueio: string | null }) | null;
  /** Lançamentos de valor exato — com ou sem sugestão forte. */
  candidatosDeMesmoValor: number;
  /** Quantos desses estão travados na aprovação por alçada. */
  travadosDeMesmoValor: number;
  vinculados: LancamentoResumido[];
};

type Contraparte = { id: string; nome: string; documento: string | null; defaultCategoryId: string | null; defaultCostCenterId?: string | null };
type Centro = { id: string; nome: string };
type Categoria = { id: string; nome: string; kind: "PAGAR" | "RECEBER" };

const STATUS: Record<LinhaDaTransacao["status"], { rotulo: string; variante: "success" | "warning" | "info" }> = {
  PENDENTE: { rotulo: "Pendente", variante: "warning" },
  CONCILIADA: { rotulo: "Conciliada", variante: "success" },
  IGNORADA: { rotulo: "Ignorada", variante: "info" },
};

function descricaoDaTransacao(l: Pick<LinhaDaTransacao, "memo" | "nome">): string {
  return [l.nome, l.memo].filter(Boolean).join(" · ") || "Sem descrição no extrato";
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
}: {
  linhas: LinhaDaTransacao[];
  podeAgir: boolean;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  /** Centros de custo ativos da empresa; sem nenhum, o campo não aparece. */
  centros?: Centro[];
}) {
  const { dialog, requestConfirm } = useConfirm();
  const [escolhendo, setEscolhendo] = useState<LinhaDaTransacao | null>(null);
  const [criando, setCriando] = useState<LinhaDaTransacao | null>(null);
  const [ignorando, setIgnorando] = useState<LinhaDaTransacao | null>(null);

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

  function desfazer(l: LinhaDaTransacao) {
    requestConfirm(
      {
        title: "Desfazer a conciliação?",
        description:
          "A transação volta a pendente e cada lançamento volta ao que era antes — em aberto, ou pago na data original.",
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

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Extrato</th>
              <th className="py-2 pr-3 font-medium text-right">Valor</th>
              <th className="py-2 pr-3 font-medium">Situação</th>
              <th className="py-2 font-medium">Lançamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border-soft align-top">
                <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{dataCurta(l.dataKey)}</td>
                <td className="py-2.5 pr-3 max-w-[300px]">
                  <span className="block break-words">{descricaoDaTransacao(l)}</span>
                </td>
                <td className={`py-2.5 pr-3 text-right tabular-nums font-medium whitespace-nowrap ${tomDoValor(l.centavos)}`}>
                  {moeda(l.centavos)}
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={STATUS[l.status].variante}>{STATUS[l.status].rotulo}</Badge>
                </td>
                <td className="py-2.5">
                  {l.status === "PENDENTE" && (
                    <div className="flex flex-col gap-2 items-start">
                      {l.sugestao?.bloqueio ? (
                        <div className="flex flex-col gap-0.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 max-w-[420px]">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
                            <Lock size={11} /> Casa com uma conta travada na aprovação · {l.sugestao.motivo}
                          </span>
                          <ResumoDoLancamento l={l.sugestao} />
                          <span className="text-[11px] text-fg-secondary">
                            {l.sugestao.bloqueio} Não crie outro lançamento para esta transação: concilie depois da aprovação.
                          </span>
                        </div>
                      ) : l.sugestao ? (
                        <div className="flex flex-col gap-0.5 rounded-md border border-brand/30 bg-brand/5 px-2.5 py-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
                            <Sparkles size={11} /> Sugestão · {l.sugestao.motivo}
                          </span>
                          <ResumoDoLancamento l={l.sugestao} />
                        </div>
                      ) : (
                        l.candidatosDeMesmoValor > 0 && (
                          <span className="text-[11px] text-fg-muted">
                            {l.candidatosDeMesmoValor} {l.candidatosDeMesmoValor === 1 ? "lançamento" : "lançamentos"} de mesmo valor,
                            sem um claramente melhor — escolha. {avisoDeTravados(l.candidatosDeMesmoValor, l.travadosDeMesmoValor)}
                          </span>
                        )
                      )}
                      {podeAgir && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {l.sugestao && !l.sugestao.bloqueio && (
                            <Button size="xs" onClick={() => confirmarSugestao(l)}>
                              <Check size={11} /> Confirmar
                            </Button>
                          )}
                          <Button size="xs" variant="secondary" onClick={() => setEscolhendo(l)}>
                            <ListChecks size={11} /> Escolher lançamentos
                          </Button>
                          <Button size="xs" variant="secondary" onClick={() => setCriando(l)}>
                            <Plus size={11} /> Criar lançamento
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setIgnorando(l)}>
                            <EyeOff size={11} /> Ignorar
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
                      {podeAgir && (
                        <Button variant="linkMuted" className="text-[11px]" onClick={() => desfazer(l)}>
                          <Undo2 size={11} /> Desfazer
                        </Button>
                      )}
                    </div>
                  )}

                  {l.status === "IGNORADA" && (
                    <div className="flex flex-col gap-1 items-start">
                      <span className="text-[12px] text-fg-secondary">{l.ignoredReason}</span>
                      {podeAgir && (
                        <Button variant="linkMuted" className="text-[11px]" onClick={() => reabrir(l)}>
                          <RotateCcw size={11} /> Reabrir
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog}
      {escolhendo && <EscolherLancamentos transacao={escolhendo} onClose={() => setEscolhendo(null)} />}
      {criando && (
        <CriarLancamento transacao={criando} contrapartes={contrapartes} categorias={categorias} centros={centros} onClose={() => setCriando(null)} />
      )}
      {ignorando && <IgnorarTransacao transacao={ignorando} onClose={() => setIgnorando(null)} />}
    </>
  );
}

function ResumoDoLancamento({ l }: { l: LancamentoResumido }) {
  return (
    <span className="text-[12px] text-fg-secondary">
      <span className="font-medium text-fg">{l.contraparteNome}</span>
      {l.descricao && <span className="text-fg-muted"> · {l.descricao}</span>}
      <span className="block text-[11px] text-fg-muted tabular-nums">
        {moeda(l.centavos)} · venc. {dataCurta(l.vencimentoKey)}
        {l.pagoEmKey && ` · baixa ${dataCurta(l.pagoEmKey)}`}
      </span>
    </span>
  );
}

// ─── Escolher lançamentos ───────────────────────────────────────────────────

function EscolherLancamentos({ transacao, onClose }: { transacao: LinhaDaTransacao; onClose: () => void }) {
  const alvo = Math.abs(transacao.centavos);
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<LancamentoParaEscolha[] | null>(null);
  const [limitado, setLimitado] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, number>>(new Map());
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

  const soma = [...marcados.values()].reduce((a, b) => a + b, 0);
  const falta = alvo - soma;

  function alternar(l: LancamentoParaEscolha) {
    setMarcados((atual) => {
      const novo = new Map(atual);
      if (novo.has(l.id)) novo.delete(l.id);
      else novo.set(l.id, l.centavos);
      return novo;
    });
  }

  return (
    <Modal open onClose={onClose} title="Escolher lançamentos" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} ·{" "}
          <strong className={tomDoValor(transacao.centavos)}>{moeda(transacao.centavos)}</strong>. Marque um ou mais
          lançamentos {transacao.centavos < 0 ? "a pagar" : "a receber"} cuja soma feche o valor no centavo.
        </p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            carregar(busca);
          }}
        >
          <Input compact value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por contraparte ou descrição" aria-label="Buscar" className="max-w-xs" />
          <Button type="submit" variant="secondary" size="sm" disabled={carregando}>
            Buscar
          </Button>
        </form>

        <div className="max-h-[380px] overflow-y-auto border border-border rounded-md">
          {lista === null || carregando ? (
            <p className="p-3 text-[12px] text-fg-muted">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="p-3 text-[12px] text-fg-muted">
              Nenhum lançamento em aberto ou sem conciliação {busca ? "com esta busca" : "perto desta data"}. Busque pelo
              nome ou crie o lançamento.
            </p>
          ) : (
            <table className="w-full text-[12px]">
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
                          <span className="block text-[11px] text-fg-muted">
                            venc. {dataCurta(l.vencimentoKey)}
                            {l.pagoEmKey && ` · baixa ${dataCurta(l.pagoEmKey)}`} · comp. {l.competencia}
                            {l.centavos === alvo && " · mesmo valor"}
                          </span>
                          {l.bloqueio && (
                            <span className="flex items-center gap-1 text-[11px] text-warning">
                              <Lock size={10} /> {l.bloqueio}
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
        {limitado && <p className="text-[11px] text-fg-muted">Mostrando os 200 primeiros. Refine pela busca.</p>}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="tabular-nums">
            Selecionado: <strong>{moeda(soma)}</strong> de {moeda(alvo)}
            {marcados.size > 0 && falta !== 0 && (
              <span className="text-danger"> · {falta > 0 ? `faltam ${moeda(falta)}` : `passou ${moeda(-falta)}`}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={salvando || marcados.size === 0 || falta !== 0}
              onClick={() => {
                setErro(null);
                startSalvar(async () => {
                  const r = await confirmarConciliacao(transacao.id, [...marcados.keys()]);
                  if ("error" in r) setErro(r.error);
                  else onClose();
                });
              }}
            >
              {salvando ? "Conciliando…" : "Conciliar"}
            </Button>
          </div>
        </div>
        {erro && <p className="text-[12px] text-danger">{erro}</p>}
      </div>
    </Modal>
  );
}

// ─── Criar lançamento ───────────────────────────────────────────────────────

const NOVA = "__nova__";

function CriarLancamento({
  transacao,
  contrapartes,
  categorias,
  centros,
  onClose,
}: {
  transacao: LinhaDaTransacao;
  contrapartes: Contraparte[];
  categorias: Categoria[];
  centros: Centro[];
  onClose: () => void;
}) {
  const kind = transacao.centavos < 0 ? "PAGAR" : "RECEBER";
  const doTipo = categorias.filter((c) => c.kind === kind);
  const [contraparte, setContraparte] = useState("");
  const [categoria, setCategoria] = useState("");
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
    <Modal open onClose={onClose} title={kind === "PAGAR" ? "Criar conta a pagar" : "Criar conta a receber"} maxWidth="max-w-xl">
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
            else onClose();
          });
        }}
      >
        <input type="hidden" name="transactionId" value={transacao.id} />
        <p className="text-[12px] text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} ·{" "}
          <strong className={tomDoValor(transacao.centavos)}>{moeda(transacao.centavos)}</strong>. O lançamento nasce pago
          nesta data, com este valor, e já conciliado.
        </p>
        {transacao.sugestao?.bloqueio && (
          <p className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-[12px] text-fg-secondary">
            <Lock size={12} className="mt-0.5 shrink-0 text-warning" />
            <span>
              Esta transação parece liquidar <strong>{transacao.sugestao.contraparteNome}</strong>, que já existe e está travada
              na aprovação. Criar outro lançamento duplica a conta — concilie com ela depois de aprovada.
            </span>
          </p>
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

        {contraparte === NOVA && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoForm label="Nome da nova contraparte" htmlFor="criar-nome" required>
              <Input id="criar-nome" name="contraparteNome" maxLength={180} defaultValue={transacao.nome ?? ""} required />
            </CampoForm>
            <CampoForm label="CPF ou CNPJ" htmlFor="criar-doc" helper="Opcional. Com documento, a ficha existente é reaproveitada.">
              <Input id="criar-doc" name="contraparteDocumento" inputMode="numeric" />
            </CampoForm>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CampoForm
            label="Categoria"
            htmlFor="criar-categoria"
            required={kind === "PAGAR"}
            helper={kind === "PAGAR" ? "Obrigatória em conta a pagar — despesa sem classificação não fecha o DRE." : undefined}
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
          <CampoForm label="Competência" htmlFor="criar-competencia" required helper="Padrão: o mês do extrato.">
            <Input id="criar-competencia" type="month" name="competencia" defaultValue={transacao.dataKey.slice(0, 7)} required />
          </CampoForm>
        </div>

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

        <CampoForm label="Descrição" htmlFor="criar-descricao">
          <Input id="criar-descricao" name="descricao" maxLength={255} defaultValue={(transacao.memo ?? transacao.nome ?? "").slice(0, 255)} />
        </CampoForm>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "Criando…" : "Criar e conciliar"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
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
        className="flex flex-col gap-3"
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
        <p className="text-[12px] text-fg-secondary">
          {dataCurta(transacao.dataKey)} · {descricaoDaTransacao(transacao)} · {moeda(transacao.centavos)}. Ignorada sai das
          pendentes, mas continua no saldo da conta — o dinheiro passou por ela.
        </p>
        <CampoForm label="Motivo" htmlFor="ignorar-motivo" required helper="Ex.: resgate automático da aplicação, estorno no mesmo dia.">
          <Textarea id="ignorar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} required />
        </CampoForm>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pendente || motivo.trim().length < 3}>
            {pendente ? "Ignorando…" : "Ignorar"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      </form>
    </Modal>
  );
}
