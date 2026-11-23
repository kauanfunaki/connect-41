"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, CreditCard, FileText, Link2, Pencil, Plus, RotateCcw, Trash2, Unlink, Upload } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { formatCalendarDate } from "@/lib/format";
import { moeda } from "@/lib/contabil-core/tela";
import {
  centavosDigitados,
  itensFecham,
  itensParaEnviar,
  nomeDaCompetencia,
  NOMES_DAS_BANDEIRAS,
  NOMES_DOS_DOCUMENTOS,
  NOMES_DOS_STATUS,
  partesParaEnviar,
  problemaDaDivisao,
  rascunhoDe,
  somaEmCentavos,
  textoDeCentavos,
  valorParaCampo,
  type CartaoDaTela,
  type FaturaDaTela,
  type ItemDoRascunho,
  type ListaDeLancamentos,
  type PagamentoPossivel,
  type ParteDaTela,
  type ResultadoDaImportacaoNaTela,
} from "@/lib/contabil-core/cartoes/telaDosCartoes";
import type { VistaDaDistribuicao } from "@/lib/contabil-core/cartoes/servico";

// Os cartões de crédito (Bloco C, Fase C3, 23/11/2026): porte de `pages/Cartoes.tsx` e
// `components/FaturaDistribuicao.tsx` do Contábil Core. Três níveis, como lá: os cartões da empresa, as
// faturas do cartão e a fatura aberta. Na fatura: os gastos (à mão, ou importados de CSV/PDF), o
// pagamento (a transação de débito do extrato com o valor exato do total), os PDFs enviados para leitura
// (o rascunho é revisado antes de virar gasto) e a distribuição do pagamento entre contas, aplicada no NEO
// como a composição da transação. Quem só lê vê tudo, sem os botões.

const BASE = "/api/contabil-core/cartoes";
const POR_PAGINA = 50;

type Falha = { ok: false; erro: string; codigo?: string };
type Resultado<T> = { ok: true; valor: T } | Falha;

async function pedir<T>(url: string, chave: string, init?: RequestInit): Promise<Resultado<T>> {
  const resp = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const corpo = (await resp?.json().catch(() => null)) as Record<string, unknown> | null;
  if (!resp?.ok || !corpo || corpo[chave] === undefined) {
    return {
      ok: false,
      erro: typeof corpo?.error === "string" ? corpo.error : "Não deu para falar com o servidor. Tente de novo.",
      codigo: typeof corpo?.codigo === "string" ? corpo.codigo : undefined,
    };
  }
  return { ok: true, valor: corpo[chave] as T };
}

const comJson = (method: string, corpo: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

/** A data do gasto e do vencimento é a meia-noite UTC do dia: mostra o dia gravado. */
const dia = (iso: string | null) => (iso ? formatCalendarDate(new Date(iso), { timeZone: "UTC" }) : "—");
const diaDoCalendario = (d: string) => formatCalendarDate(new Date(`${d.slice(0, 10)}T00:00:00.000Z`), { timeZone: "UTC" });

const TOM_DO_STATUS: Record<string, TomDoSelo> = { aberta: "marca", fechada: "neutro", paga: "sucesso" };
const TOM_DO_DOCUMENTO: Record<string, TomDoSelo> = { processando: "neutro", revisar: "atencao", falhou: "perigo", principal: "sucesso", complementar: "neutro" };

/** Uma lista carregada pela API, com recarga. */
function useCarga<T>(url: string | null, chave: string) {
  const [estado, setEstado] = useState<{ url: string | null; recarga: number; erro: string | null; dados: T | null }>({ url: null, recarga: -1, erro: null, dados: null });
  const [recarga, setRecarga] = useState(0);
  const recarregar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    void pedir<T>(url, chave).then((r) => {
      if (vivo) setEstado(r.ok ? { url, recarga, erro: null, dados: r.valor } : { url, recarga, erro: r.erro, dados: null });
    });
    return () => {
      vivo = false;
    };
  }, [url, chave, recarga]);
  const carregando = estado.url !== url || estado.recarga !== recarga;
  return { dados: estado.url === url ? estado.dados : null, erro: estado.url === url ? estado.erro : null, carregando, recarregar };
}

export type OpcaoDeConta = { value: string; label: string };
type Props = { empresaId: string; podeAgir: boolean; contas: OpcaoDeConta[] };

export function Cartoes({ empresaId, podeAgir, contas }: Props) {
  const [cartao, setCartao] = useState<CartaoDaTela | null>(null);
  const [faturaId, setFaturaId] = useState<string | null>(null);

  if (cartao && faturaId) {
    return (
      <DetalheDaFatura
        empresaId={empresaId}
        podeAgir={podeAgir}
        contas={contas}
        cartao={cartao}
        faturaId={faturaId}
        voltar={() => setFaturaId(null)}
        voltarAosCartoes={() => {
          setFaturaId(null);
          setCartao(null);
        }}
      />
    );
  }
  if (cartao) return <FaturasDoCartao empresaId={empresaId} podeAgir={podeAgir} cartao={cartao} abrir={setFaturaId} voltar={() => setCartao(null)} />;
  return <ListaDeCartoes empresaId={empresaId} podeAgir={podeAgir} abrir={setCartao} />;
}

// ─── Os cartões ─────────────────────────────────────────────────────────────

type FormDoCartao = { nome: string; bandeira: string; ultimosDigitos: string; diaFechamento: string; diaVencimento: string; limite: string; ativo: boolean };
const CARTAO_VAZIO: FormDoCartao = { nome: "", bandeira: "visa", ultimosDigitos: "", diaFechamento: "10", diaVencimento: "15", limite: "", ativo: true };

function ListaDeCartoes({ empresaId, podeAgir, abrir }: { empresaId: string; podeAgir: boolean; abrir: (c: CartaoDaTela) => void }) {
  const toast = useToast();
  const lista = useCarga<CartaoDaTela[]>(`${BASE}?empresa=${empresaId}`, "cartoes");
  const [editando, setEditando] = useState<CartaoDaTela | "novo" | null>(null);
  const [removendo, setRemovendo] = useState<CartaoDaTela | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (!removendo) return;
    setOcupado(true);
    setErro(null);
    const r = await pedir<unknown>(`${BASE}/${removendo.id}`, "ok", comJson("DELETE", { empresa: empresaId }));
    setOcupado(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success("Cartão removido.");
    setRemovendo(null);
    lista.recarregar();
  }

  const cartoes = lista.dados ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">Cartões de crédito da empresa, com as faturas de cada competência.</p>
        {podeAgir && (
          <Button type="button" onClick={() => setEditando("novo")}>
            <Plus size={14} aria-hidden /> Novo cartão
          </Button>
        )}
      </div>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {lista.carregando && !lista.dados ? (
        <p className="text-sm text-fg-muted">Carregando os cartões…</p>
      ) : !cartoes.length ? (
        <p className="text-sm text-fg-muted">Nenhum cartão cadastrado.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cartoes.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} aria-hidden className="text-brand" />
                  <div>
                    <p className="text-sm font-semibold">{c.nome}</p>
                    <p className="text-micro text-fg-muted">
                      {NOMES_DAS_BANDEIRAS[c.bandeira] ?? c.bandeira}
                      {c.ultimosDigitos ? ` •••• ${c.ultimosDigitos}` : ""}
                    </p>
                  </div>
                </div>
                <Selo tom={c.ativo ? "sucesso" : "neutro"}>{c.ativo ? "Ativo" : "Inativo"}</Selo>
              </div>
              <div className="text-micro text-fg-muted">
                <p>
                  Fecha dia {c.diaFechamento} · Vence dia {c.diaVencimento}
                </p>
                {c.limite !== null && <p>Limite: {moeda(c.limite)}</p>}
                <p>
                  {c.totalFaturas} fatura(s)
                  {c.faturaAbertaValor !== null && <> · Aberta: {moeda(c.faturaAbertaValor)}</>}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => abrir(c)}>
                  <FileText size={14} aria-hidden /> Faturas
                </Button>
                {podeAgir && (
                  <>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setEditando(c)}>
                      <Pencil size={14} aria-hidden /> Editar
                    </Button>
                    <Button type="button" size="sm" variant="danger" onClick={() => setRemovendo(c)}>
                      <Trash2 size={14} aria-hidden /> Remover
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editando && (
        <FormularioDoCartao
          empresaId={empresaId}
          cartao={editando === "novo" ? null : editando}
          fechar={() => setEditando(null)}
          salvo={() => {
            setEditando(null);
            lista.recarregar();
          }}
        />
      )}
      <ConfirmDialog
        open={!!removendo}
        title="Remover cartão?"
        description="O cartão sai da lista. Só dá para remover sem fatura aberta ou fechada e sem distribuição aplicada."
        confirmLabel="Remover"
        cancelLabel="Voltar"
        pendingLabel="Removendo…"
        destructive
        pending={ocupado}
        error={erro}
        onConfirm={() => void remover()}
        onCancel={() => {
          setRemovendo(null);
          setErro(null);
        }}
      />
    </div>
  );
}

function FormularioDoCartao({ empresaId, cartao, fechar, salvo }: { empresaId: string; cartao: CartaoDaTela | null; fechar: () => void; salvo: () => void }) {
  const base = useId();
  const toast = useToast();
  const [f, setF] = useState<FormDoCartao>(() =>
    cartao
      ? {
          nome: cartao.nome,
          bandeira: cartao.bandeira,
          ultimosDigitos: cartao.ultimosDigitos ?? "",
          diaFechamento: String(cartao.diaFechamento),
          diaVencimento: String(cartao.diaVencimento),
          limite: valorParaCampo(cartao.limite),
          ativo: cartao.ativo,
        }
      : CARTAO_VAZIO,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const mudar = <K extends keyof FormDoCartao>(k: K, v: FormDoCartao[K]) => setF((x) => ({ ...x, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const limite = f.limite.trim() ? centavosDigitados(f.limite) : null;
    if (f.limite.trim() && limite === null) return setErro("Informe o limite em reais, com até duas casas.");
    const comum = {
      empresa: empresaId,
      nome: f.nome.trim(),
      diaFechamento: Number(f.diaFechamento),
      diaVencimento: Number(f.diaVencimento),
      limite: limite === null ? null : textoDeCentavos(limite),
    };
    setOcupado(true);
    setErro(null);
    const r = cartao
      ? await pedir<CartaoDaTela>(`${BASE}/${cartao.id}`, "cartao", comJson("PATCH", { ...comum, ativo: f.ativo }))
      : await pedir<CartaoDaTela>(BASE, "cartao", comJson("POST", { ...comum, bandeira: f.bandeira, ultimosDigitos: f.ultimosDigitos.trim() || null }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(cartao ? "Cartão salvo." : "Cartão cadastrado.");
    salvo();
  }

  const dias = Array.from({ length: 28 }, (_, i) => String(i + 1));
  return (
    <Modal open onClose={fechar} title={cartao ? "Editar cartão" : "Novo cartão"}>
      <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3" noValidate>
        <CampoForm label="Nome" htmlFor={`${base}-nome`} required>
          <Input id={`${base}-nome`} value={f.nome} maxLength={200} onChange={(e) => mudar("nome", e.target.value)} placeholder="Cartão corporativo" />
        </CampoForm>
        {!cartao && (
          <div className="grid grid-cols-2 gap-3">
            <CampoForm label="Bandeira" htmlFor={`${base}-bandeira`} required>
              <Select id={`${base}-bandeira`} value={f.bandeira} onChange={(e) => mudar("bandeira", e.target.value)}>
                {Object.entries(NOMES_DAS_BANDEIRAS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Últimos 4 dígitos" htmlFor={`${base}-digitos`}>
              <Input id={`${base}-digitos`} value={f.ultimosDigitos} maxLength={4} inputMode="numeric" onChange={(e) => mudar("ultimosDigitos", e.target.value)} />
            </CampoForm>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <CampoForm label="Dia de fechamento" htmlFor={`${base}-fecha`} required>
            <Select id={`${base}-fecha`} value={f.diaFechamento} onChange={(e) => mudar("diaFechamento", e.target.value)}>
              {dias.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Dia de vencimento" htmlFor={`${base}-vence`} required>
            <Select id={`${base}-vence`} value={f.diaVencimento} onChange={(e) => mudar("diaVencimento", e.target.value)}>
              {dias.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <CampoForm label="Limite" htmlFor={`${base}-limite`} helper={cartao ? "Em branco mantém o limite atual." : undefined}>
          <Input id={`${base}-limite`} value={f.limite} prefix="R$" inputMode="decimal" onChange={(e) => mudar("limite", e.target.value)} />
        </CampoForm>
        {cartao && <Checkbox id={`${base}-ativo`} label="Cartão ativo" checked={f.ativo} onChange={(e) => mudar("ativo", e.target.checked)} />}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={ocupado}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── As faturas do cartão ───────────────────────────────────────────────────

function Trilha({ itens }: { itens: { rotulo: string; acao?: () => void }[] }) {
  return (
    <nav aria-label="Onde você está" className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
      {itens.map((i, n) => (
        <span key={n} className="flex items-center gap-1">
          {n > 0 && <span aria-hidden>›</span>}
          {i.acao ? (
            <Button type="button" variant="link" size="sm" onClick={i.acao}>
              {i.rotulo}
            </Button>
          ) : (
            <span className="font-medium text-fg">{i.rotulo}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function FaturasDoCartao({ empresaId, podeAgir, cartao, abrir, voltar }: { empresaId: string; podeAgir: boolean; cartao: CartaoDaTela; abrir: (id: string) => void; voltar: () => void }) {
  const base = useId();
  const toast = useToast();
  const lista = useCarga<FaturaDaTela[]>(`${BASE}/${cartao.id}/faturas?empresa=${empresaId}`, "faturas");
  const [nova, setNova] = useState(false);
  const [form, setForm] = useState({ competencia: "", dataVencimento: "", observacao: "" });
  const [mudandoStatus, setMudandoStatus] = useState<{ fatura: FaturaDaTela; status: "aberta" | "fechada" } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.competencia) return setErro("Informe a competência.");
    setOcupado(true);
    setErro(null);
    const r = await pedir<FaturaDaTela>(
      `${BASE}/${cartao.id}/faturas`,
      "fatura",
      comJson("POST", {
        empresa: empresaId,
        competencia: form.competencia,
        dataVencimento: form.dataVencimento ? `${form.dataVencimento}T00:00:00.000Z` : null,
        observacao: form.observacao.trim() || null,
      }),
    );
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Fatura criada.");
    setNova(false);
    setForm({ competencia: "", dataVencimento: "", observacao: "" });
    lista.recarregar();
  }

  async function mudarStatus() {
    if (!mudandoStatus) return;
    setOcupado(true);
    setErro(null);
    const r = await pedir<FaturaDaTela>(`${BASE}/${cartao.id}/faturas/${mudandoStatus.fatura.id}`, "fatura", comJson("PATCH", { empresa: empresaId, status: mudandoStatus.status }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(mudandoStatus.status === "fechada" ? "Fatura fechada." : "Fatura reaberta.");
    setMudandoStatus(null);
    lista.recarregar();
  }

  const faturas = lista.dados ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Trilha itens={[{ rotulo: "Cartões", acao: voltar }, { rotulo: cartao.nome }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={voltar}>
          <ChevronLeft size={14} aria-hidden /> Cartões
        </Button>
        {podeAgir && (
          <Button type="button" onClick={() => setNova(true)}>
            <Plus size={14} aria-hidden /> Nova fatura
          </Button>
        )}
      </div>
      {lista.erro && <Aviso>{lista.erro}</Aviso>}
      {lista.carregando && !lista.dados ? (
        <p className="text-sm text-fg-muted">Carregando as faturas…</p>
      ) : !faturas.length ? (
        <p className="text-sm text-fg-muted">Nenhuma fatura cadastrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                <th className="py-2 pr-3 font-medium">Competência</th>
                <th className="py-2 pr-3 font-medium">Vencimento</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Gastos</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {faturas.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium">{nomeDaCompetencia(f.competencia)}</td>
                  <td className="py-2 pr-3">{dia(f.dataVencimento)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(f.valorTotal)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{f.totalLancamentos}</td>
                  <td className="py-2 pr-3">
                    <Selo tom={TOM_DO_STATUS[f.status]}>{NOMES_DOS_STATUS[f.status] ?? f.status}</Selo>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" onClick={() => abrir(f.id)}>
                        Abrir
                      </Button>
                      {podeAgir && f.status === "aberta" && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => setMudandoStatus({ fatura: f, status: "fechada" })}>
                          Fechar
                        </Button>
                      )}
                      {podeAgir && f.status === "fechada" && !f.transacaoId && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => setMudandoStatus({ fatura: f, status: "aberta" })}>
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={nova} onClose={() => setNova(false)} title="Nova fatura">
        <form onSubmit={(e) => void criar(e)} className="flex flex-col gap-3" noValidate>
          <CampoForm label="Competência" htmlFor={`${base}-comp`} required>
            <CampoMes id={`${base}-comp`} value={form.competencia} onChange={(v) => setForm((x) => ({ ...x, competencia: v }))} />
          </CampoForm>
          <CampoForm label="Vencimento" htmlFor={`${base}-venc`}>
            <CampoData id={`${base}-venc`} value={form.dataVencimento} onChange={(v) => setForm((x) => ({ ...x, dataVencimento: v }))} />
          </CampoForm>
          <CampoForm label="Observação" htmlFor={`${base}-obs`}>
            <Textarea id={`${base}-obs`} value={form.observacao} maxLength={500} onChange={(e) => setForm((x) => ({ ...x, observacao: e.target.value }))} />
          </CampoForm>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNova(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={ocupado} loadingLabel="Criando…">
              Criar fatura
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={!!mudandoStatus}
        title={mudandoStatus?.status === "fechada" ? "Fechar a fatura?" : "Reabrir a fatura?"}
        description={
          mudandoStatus?.status === "fechada"
            ? "A fatura fechada continua aceitando gastos até ser paga; o pagamento é associado na fatura fechada."
            : "A fatura volta a ficar aberta."
        }
        confirmLabel={mudandoStatus?.status === "fechada" ? "Fechar" : "Reabrir"}
        cancelLabel="Voltar"
        pending={ocupado}
        error={erro}
        onConfirm={() => void mudarStatus()}
        onCancel={() => {
          setMudandoStatus(null);
          setErro(null);
        }}
      />
    </div>
  );
}

// ─── A fatura ───────────────────────────────────────────────────────────────

type PropsDaFatura = {
  empresaId: string;
  podeAgir: boolean;
  contas: OpcaoDeConta[];
  cartao: CartaoDaTela;
  faturaId: string;
  voltar: () => void;
  voltarAosCartoes: () => void;
};

type FormDoGasto = { dataCompra: string; descricao: string; valor: string; contaId: string; parcelaAtual: string; parcelaTotal: string };
const GASTO_VAZIO: FormDoGasto = { dataCompra: "", descricao: "", valor: "", contaId: "", parcelaAtual: "", parcelaTotal: "" };

function DetalheDaFatura({ empresaId, podeAgir, contas, cartao, faturaId, voltar, voltarAosCartoes }: PropsDaFatura) {
  const base = useId();
  const toast = useToast();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const urlDaFatura = `${BASE}/${cartao.id}/faturas/${faturaId}`;
  const fatura = useCarga<FaturaDaTela>(`${urlDaFatura}?empresa=${empresaId}`, "fatura");
  const gastos = useCarga<ListaDeLancamentos>(`${urlDaFatura}/lancamentos?empresa=${empresaId}`, "lancamentos");
  const [versaoDaDistribuicao, setVersaoDaDistribuicao] = useState(0);
  const [novoGasto, setNovoGasto] = useState(false);
  const [gasto, setGasto] = useState<FormDoGasto>(GASTO_VAZIO);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [importacao, setImportacao] = useState<ResultadoDaImportacaoNaTela | null>(null);
  const [importando, setImportando] = useState(false);
  const [observando, setObservando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregarTudo = useCallback(() => {
    fatura.recarregar();
    gastos.recarregar();
    setVersaoDaDistribuicao((n) => n + 1);
  }, [fatura, gastos]);

  const f = fatura.dados;
  const paga = f?.status === "paga";
  const rotuloDaConta = (id: string | null) => (id ? (contas.find((c) => c.value === id)?.label ?? "Conta") : "—");

  async function adicionarGasto(e: React.FormEvent) {
    e.preventDefault();
    const valor = centavosDigitados(gasto.valor);
    if (!gasto.dataCompra) return setErro("Informe a data da compra.");
    if (!gasto.descricao.trim()) return setErro("Informe a descrição.");
    if (valor === null || valor <= BigInt(0)) return setErro("Informe um valor positivo, com até duas casas.");
    setOcupado(true);
    setErro(null);
    const r = await pedir<unknown>(
      `${urlDaFatura}/lancamentos`,
      "lancamento",
      comJson("POST", {
        empresa: empresaId,
        dataCompra: `${gasto.dataCompra}T00:00:00.000Z`,
        descricao: gasto.descricao.trim(),
        valor: textoDeCentavos(valor),
        contaId: gasto.contaId || null,
        parcelaAtual: gasto.parcelaAtual ? Number(gasto.parcelaAtual) : null,
        parcelaTotal: gasto.parcelaTotal ? Number(gasto.parcelaTotal) : null,
      }),
    );
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Gasto lançado.");
    setNovoGasto(false);
    setGasto(GASTO_VAZIO);
    recarregarTudo();
  }

  async function removerGasto() {
    if (!removendo) return;
    setOcupado(true);
    setErro(null);
    const r = await pedir<unknown>(`${urlDaFatura}/lancamentos/${removendo}`, "ok", comJson("DELETE", { empresa: empresaId }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Gasto removido.");
    setRemovendo(null);
    recarregarTudo();
  }

  async function importar(arquivo: File) {
    setImportando(true);
    setImportacao(null);
    const form = new FormData();
    form.append("empresa", empresaId);
    form.append("arquivo", arquivo);
    const r = await pedir<ResultadoDaImportacaoNaTela>(`${urlDaFatura}/lancamentos/importar`, "importacao", { method: "POST", body: form });
    setImportando(false);
    if (arquivoRef.current) arquivoRef.current.value = "";
    if (!r.ok) return toast.error(r.erro);
    setImportacao(r.valor);
    toast.success(`${r.valor.importados} gasto(s) importado(s).`);
    recarregarTudo();
  }

  async function salvarObservacao() {
    if (observando === null) return;
    setOcupado(true);
    setErro(null);
    const r = await pedir<FaturaDaTela>(urlDaFatura, "fatura", comJson("PATCH", { empresa: empresaId, observacao: observando }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Observação salva.");
    setObservando(null);
    fatura.recarregar();
  }

  const itens = gastos.dados?.itens ?? [];
  return (
    <div className="flex flex-col gap-4">
      <Trilha itens={[{ rotulo: "Cartões", acao: voltarAosCartoes }, { rotulo: cartao.nome, acao: voltar }, { rotulo: f ? nomeDaCompetencia(f.competencia) : "Fatura" }]} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={voltar}>
          <ChevronLeft size={14} aria-hidden /> Faturas
        </Button>
        {podeAgir && f && !paga && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" loading={importando} loadingLabel="Importando…" onClick={() => arquivoRef.current?.click()}>
              <Upload size={14} aria-hidden /> Importar CSV ou PDF
            </Button>
            <input
              ref={arquivoRef}
              type="file"
              accept=".csv,.pdf,text/csv,application/pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivo de gastos (CSV ou PDF)"
              onChange={(e) => {
                const a = e.target.files?.[0];
                if (a) void importar(a);
              }}
            />
            <Button type="button" onClick={() => setNovoGasto(true)}>
              <Plus size={14} aria-hidden /> Novo gasto
            </Button>
          </div>
        )}
      </div>
      {fatura.erro && <Aviso>{fatura.erro}</Aviso>}
      {f && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Resumo rotulo="Total" valor={moeda(gastos.dados?.valorTotal ?? f.valorTotal)} />
          <Resumo rotulo="Gastos" valor={String(gastos.dados?.total ?? f.totalLancamentos)} />
          <Resumo rotulo="Vencimento" valor={dia(f.dataVencimento)} />
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
            <span className="text-micro text-fg-muted">Situação</span>
            <span>
              <Selo tom={TOM_DO_STATUS[f.status]}>{NOMES_DOS_STATUS[f.status] ?? f.status}</Selo>
            </span>
          </div>
        </div>
      )}
      {f && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">Observação:</span>
          <span>{f.observacao || "—"}</span>
          {podeAgir && (
            <Button type="button" size="xs" variant="ghost" onClick={() => setObservando(f.observacao ?? "")}>
              <Pencil size={12} aria-hidden /> Editar
            </Button>
          )}
        </div>
      )}

      {importacao && (
        <Aviso tom={importacao.erros.length ? "atencao" : "sucesso"}>
          {importacao.importados} importado(s), {importacao.duplicados} já estava(m) na fatura.
          {importacao.erros.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {importacao.erros.slice(0, 20).map((e, n) => (
                <li key={n}>{e}</li>
              ))}
              {importacao.erros.length > 20 && <li>e mais {importacao.erros.length - 20} linha(s) com erro.</li>}
            </ul>
          )}
        </Aviso>
      )}

      <section aria-labelledby={`${base}-gastos`} className="flex flex-col gap-2">
        <h2 id={`${base}-gastos`} className="text-sm font-semibold">
          Gastos
        </h2>
        {gastos.erro && <Aviso>{gastos.erro}</Aviso>}
        {gastos.carregando && !gastos.dados ? (
          <p className="text-sm text-fg-muted">Carregando os gastos…</p>
        ) : !itens.length ? (
          <p className="text-sm text-fg-muted">Nenhum gasto nesta fatura.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Descrição</th>
                  <th className="py-2 pr-3 font-medium">Parcela</th>
                  <th className="py-2 pr-3 font-medium">Conta</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((l) => (
                  <tr key={l.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{dia(l.dataCompra)}</td>
                    <td className="py-2 pr-3">{l.descricao}</td>
                    <td className="py-2 pr-3">{l.parcelaAtual && l.parcelaTotal ? `${l.parcelaAtual}/${l.parcelaTotal}` : "—"}</td>
                    <td className="py-2 pr-3 text-fg-muted">{rotuloDaConta(l.contaId)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.valor)}</td>
                    <td className="py-2 text-right">
                      {podeAgir && !paga && (
                        <Button type="button" size="xs" variant="danger" aria-label={`Remover ${l.descricao}`} onClick={() => setRemovendo(l.id)}>
                          <Trash2 size={12} aria-hidden />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {f && <PagamentoDaFatura empresaId={empresaId} podeAgir={podeAgir} urlDaFatura={urlDaFatura} fatura={f} totalAtual={gastos.dados?.valorTotal ?? f.valorTotal} mudou={recarregarTudo} />}

      {f && (
        <Distribuicao
          key={versaoDaDistribuicao}
          empresaId={empresaId}
          podeAgir={podeAgir}
          contas={contas}
          urlDaFatura={urlDaFatura}
          paga={!!paga}
          mudouGastos={() => {
            fatura.recarregar();
            gastos.recarregar();
          }}
        />
      )}

      <Modal open={novoGasto} onClose={() => setNovoGasto(false)} title="Novo gasto">
        <form onSubmit={(e) => void adicionarGasto(e)} className="flex flex-col gap-3" noValidate>
          <CampoForm label="Data da compra" htmlFor={`${base}-data`} required>
            <CampoData id={`${base}-data`} value={gasto.dataCompra} onChange={(v) => setGasto((x) => ({ ...x, dataCompra: v }))} />
          </CampoForm>
          <CampoForm label="Descrição" htmlFor={`${base}-desc`} required>
            <Input id={`${base}-desc`} value={gasto.descricao} maxLength={500} onChange={(e) => setGasto((x) => ({ ...x, descricao: e.target.value }))} />
          </CampoForm>
          <CampoForm label="Valor" htmlFor={`${base}-valor`} required>
            <Input id={`${base}-valor`} value={gasto.valor} prefix="R$" inputMode="decimal" onChange={(e) => setGasto((x) => ({ ...x, valor: e.target.value }))} />
          </CampoForm>
          <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} helper="Opcional.">
            <Select id={`${base}-conta`} value={gasto.contaId} onChange={(e) => setGasto((x) => ({ ...x, contaId: e.target.value }))}>
              <option value="">Sem conta</option>
              {contas.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </CampoForm>
          <div className="grid grid-cols-2 gap-3">
            <CampoForm label="Parcela" htmlFor={`${base}-pa`}>
              <Input id={`${base}-pa`} value={gasto.parcelaAtual} inputMode="numeric" onChange={(e) => setGasto((x) => ({ ...x, parcelaAtual: e.target.value.replace(/\D/g, "") }))} />
            </CampoForm>
            <CampoForm label="De" htmlFor={`${base}-pt`}>
              <Input id={`${base}-pt`} value={gasto.parcelaTotal} inputMode="numeric" onChange={(e) => setGasto((x) => ({ ...x, parcelaTotal: e.target.value.replace(/\D/g, "") }))} />
            </CampoForm>
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNovoGasto(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={ocupado}>
              Lançar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={observando !== null} onClose={() => setObservando(null)} title="Observação da fatura">
        <div className="flex flex-col gap-3">
          <Textarea aria-label="Observação" value={observando ?? ""} maxLength={500} onChange={(e) => setObservando(e.target.value)} />
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setObservando(null)}>
              Cancelar
            </Button>
            <Button type="button" loading={ocupado} onClick={() => void salvarObservacao()}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removendo}
        title="Remover o gasto?"
        description="O gasto sai da fatura e o total é recalculado."
        confirmLabel="Remover"
        cancelLabel="Voltar"
        pendingLabel="Removendo…"
        destructive
        pending={ocupado}
        error={erro}
        onConfirm={() => void removerGasto()}
        onCancel={() => {
          setRemovendo(null);
          setErro(null);
        }}
      />
    </div>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3">
      <span className="text-micro text-fg-muted">{rotulo}</span>
      <span className="text-lg font-semibold tabular-nums">{valor}</span>
    </div>
  );
}

// ─── O pagamento ────────────────────────────────────────────────────────────

function PagamentoDaFatura({
  empresaId,
  podeAgir,
  urlDaFatura,
  fatura,
  totalAtual,
  mudou,
}: {
  empresaId: string;
  podeAgir: boolean;
  urlDaFatura: string;
  fatura: FaturaDaTela;
  totalAtual: string;
  mudou: () => void;
}) {
  const toast = useToast();
  const [escolhendo, setEscolhendo] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [escolhida, setEscolhida] = useState("");
  const [desfazendo, setDesfazendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const possiveis = useCarga<PagamentoPossivel[]>(escolhendo ? `${urlDaFatura}/pagamento?empresa=${empresaId}&busca=${encodeURIComponent(buscaAplicada)}` : null, "pagamentos");

  async function associar() {
    setOcupado(true);
    setErro(null);
    const r = await pedir<FaturaDaTela>(`${urlDaFatura}/pagamento`, "fatura", comJson("POST", { empresa: empresaId, transacaoId: escolhida }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Pagamento associado: a fatura está paga.");
    setEscolhendo(false);
    mudou();
  }

  async function desassociar() {
    setOcupado(true);
    setErro(null);
    const r = await pedir<FaturaDaTela>(`${urlDaFatura}/pagamento`, "fatura", comJson("DELETE", { empresa: empresaId }));
    setOcupado(false);
    if (!r.ok) return setErro(r.erro);
    toast.success("Pagamento desvinculado: a fatura voltou a ficar fechada.");
    setDesfazendo(false);
    mudou();
  }

  const t = fatura.transacao;
  return (
    <section aria-label="Pagamento da fatura" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Pagamento</h2>
      {fatura.transacaoId ? (
        <>
          {t ? (
            <p className="text-sm">
              {diaDoCalendario(t.data)} · {t.historico} · <span className="tabular-nums">{moeda(t.valor)}</span>
            </p>
          ) : (
            <p className="text-sm text-fg-muted">Transação {fatura.transacaoId}</p>
          )}
          {t?.desfeita && <Aviso tom="atencao">A importação desta transação foi desfeita. Desvincule o pagamento e associe o novo.</Aviso>}
          {podeAgir && (
            <div>
              <Button type="button" size="sm" variant="danger" onClick={() => setDesfazendo(true)}>
                <Unlink size={14} aria-hidden /> Desvincular pagamento
              </Button>
            </div>
          )}
        </>
      ) : fatura.status === "aberta" ? (
        <p className="text-sm text-fg-muted">Feche a fatura para poder associar o pagamento.</p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">Nenhuma transação do extrato associada. O pagamento precisa ser um débito com o valor exato do total ({moeda(totalAtual)}).</p>
          {podeAgir && (
            <div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setEscolhida("");
                  setBusca("");
                  setBuscaAplicada("");
                  setErro(null);
                  setEscolhendo(true);
                }}
              >
                <Link2 size={14} aria-hidden /> Associar pagamento
              </Button>
            </div>
          )}
        </>
      )}
      <Modal open={escolhendo} onClose={() => setEscolhendo(false)} title="Associar o pagamento da fatura" maxWidth="max-w-2xl">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">Débitos do extrato com o valor de {moeda(totalAtual)} que ainda não pagaram outra fatura.</p>
          <div className="flex gap-2">
            <Input aria-label="Buscar pelo histórico" placeholder="Buscar pelo histórico" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Button type="button" variant="secondary" onClick={() => setBuscaAplicada(busca)}>
              Buscar
            </Button>
          </div>
          {possiveis.erro && <Aviso>{possiveis.erro}</Aviso>}
          {possiveis.carregando ? (
            <p className="text-sm text-fg-muted">Consultando o extrato…</p>
          ) : !(possiveis.dados ?? []).length ? (
            <p className="text-sm text-fg-muted">Nenhuma transação de débito com esse valor.</p>
          ) : (
            <ul className="flex max-h-80 flex-col overflow-auto rounded-md border border-border">
              {(possiveis.dados ?? []).map((p) => (
                <li key={p.id} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    aria-pressed={escolhida === p.id}
                    onClick={() => setEscolhida(p.id)}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm ${escolhida === p.id ? "bg-brand/10" : "hover:bg-surface-hover"}`}
                  >
                    <span>
                      {diaDoCalendario(p.data)} · {p.historico}
                      <span className="block text-micro text-fg-muted">
                        {p.agencia} · {p.status === "processada" ? "classificada" : "pendente"}
                      </span>
                    </span>
                    <span className="tabular-nums">{moeda(p.valor)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEscolhendo(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!escolhida} loading={ocupado} loadingLabel="Associando…" onClick={() => void associar()}>
              Associar
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={desfazendo}
        title="Desvincular o pagamento?"
        description="A fatura volta a ficar fechada e a transação fica livre. Com a distribuição aplicada, desfaça-a antes."
        confirmLabel="Desvincular"
        cancelLabel="Voltar"
        destructive
        pending={ocupado}
        error={erro}
        onConfirm={() => void desassociar()}
        onCancel={() => {
          setDesfazendo(false);
          setErro(null);
        }}
      />
    </section>
  );
}

// ─── A distribuição e os documentos ─────────────────────────────────────────

type Vista = VistaDaDistribuicao;
type DocumentoDaVista = Vista["documentos"][number];

function Distribuicao({
  empresaId,
  podeAgir,
  contas,
  urlDaFatura,
  paga,
  mudouGastos,
}: {
  empresaId: string;
  podeAgir: boolean;
  contas: OpcaoDeConta[];
  urlDaFatura: string;
  paga: boolean;
  mudouGastos: () => void;
}) {
  const base = useId();
  const toast = useToast();
  const pdfRef = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [erroDaCarga, setErroDaCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [partes, setPartes] = useState<Record<string, ParteDaTela[]>>({});
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [contaDoLote, setContaDoLote] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [dividindo, setDividindo] = useState<Vista["itens"][number] | null>(null);
  const [divisao, setDivisao] = useState<ParteDaTela[]>([]);
  const [motivo, setMotivo] = useState<{ acao: "aplicar" | "desfazer"; texto: string; preservar: boolean } | null>(null);
  const [revisando, setRevisando] = useState<DocumentoDaVista | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A versão cujas partes estão na tela: a leitura periódica dos documentos não apaga o que a pessoa edita.
  const versaoNaTela = useRef<number | null>(null);
  const aceitar = useCallback((v: Vista) => {
    versaoNaTela.current = v.versao;
    setVista(v);
    setPartes(v.distribuicoes);
    setSelecionados(new Set());
  }, []);

  useEffect(() => {
    let vivo = true;
    void pedir<Vista>(`${urlDaFatura}/distribuicao?empresa=${empresaId}`, "distribuicao").then((r) => {
      if (!vivo) return;
      if (r.ok) {
        setErroDaCarga(null);
        if (versaoNaTela.current !== r.valor.versao) {
          versaoNaTela.current = r.valor.versao;
          setPartes(r.valor.distribuicoes);
        }
        setVista(r.valor);
      } else setErroDaCarga(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, [urlDaFatura, empresaId, recarga]);

  // Enquanto algum documento estiver sendo lido, a tela consulta de novo a cada 2 s (como o original).
  const lendo = !!vista?.documentos.some((d) => d.status === "processando");
  useEffect(() => {
    if (!lendo) return;
    const t = setTimeout(() => setRecarga((n) => n + 1), 2000);
    return () => clearTimeout(t);
  }, [lendo, vista]);

  async function escrever(caminho: string, init: RequestInit, sucesso: string, chave = "distribuicao"): Promise<boolean> {
    setOcupado(caminho);
    setErro(null);
    const r = await pedir<Vista>(`${urlDaFatura}${caminho}`, chave, init);
    setOcupado(null);
    if (!r.ok) {
      setErro(r.erro);
      toast.error(r.erro);
      setRecarga((n) => n + 1);
      return false;
    }
    if (chave === "distribuicao") aceitar(r.valor);
    else setRecarga((n) => n + 1);
    toast.success(sucesso);
    return true;
  }

  if (erroDaCarga && !vista) return <Aviso>{erroDaCarga}</Aviso>;
  if (!vista) return <p className="text-sm text-fg-muted">Carregando a distribuição…</p>;

  const v = vista;
  const salvar = () =>
    void escrever(
      "/distribuicao",
      comJson("PUT", { empresa: empresaId, versao: v.versao, distribuicoes: Object.fromEntries(Object.entries(partes).map(([id, p]) => [id, partesParaEnviar(p)])) }),
      "Distribuição salva.",
    );

  async function confirmarMotivo() {
    if (!motivo) return;
    const corpo =
      motivo.acao === "aplicar"
        ? { empresa: empresaId, versao: v.versao, classificacaoHash: v.classificacaoHash, motivo: motivo.texto }
        : { empresa: empresaId, versao: v.versao, motivo: motivo.texto, preservarClassificacaoAtual: motivo.preservar };
    const feito = await escrever(
      `/distribuicao/${motivo.acao}`,
      comJson("POST", corpo),
      motivo.acao === "aplicar" ? "Distribuição aplicada ao pagamento." : "Distribuição desfeita.",
    );
    if (feito) setMotivo(null);
  }

  async function enviarPdf(arquivo: File) {
    const form = new FormData();
    form.append("empresa", empresaId);
    form.append("arquivo", arquivo);
    await escrever("/documentos", { method: "POST", body: form }, "PDF enviado para leitura. Revise os itens antes de importar.", "documento");
    if (pdfRef.current) pdfRef.current.value = "";
  }

  const rotulo = (id: string) => contas.find((c) => c.value === id)?.label ?? "Conta fora da lista";
  const termo = busca.trim().toLowerCase();
  const filtrados = v.itens.filter((i) => !termo || `${i.descricao} ${i.valor} ${i.data}`.toLowerCase().includes(termo));
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const distribuido = somaEmCentavos(Object.values(partes).flat().map((p) => p.valor));
  const total = centavosDigitados(v.total);
  const restante = distribuido !== null && total !== null ? total - distribuido : null;
  const suja = v.gastosAlterados || JSON.stringify(partes) !== JSON.stringify(v.distribuicoes);
  const bloqueada = !podeAgir || !!v.aplicacao || ocupado !== null;

  return (
    <section aria-label="Distribuição contábil da fatura" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Distribuir o pagamento entre contas</h2>
      <p className="text-sm text-fg-muted">
        A transação do extrato continua única: aplicar troca a classificação dela por um par para cada componente, na data do pagamento, sem contabilizar o total de novo.
      </p>
      {v.gastosAlterados && <Aviso tom="atencao">Houve remoção de gastos depois da última distribuição. Confira e salve de novo antes de aplicar.</Aviso>}

      <BlocoRecolhivel titulo={`Documentos e revisão (${v.documentos.length})`} resumo={lendo ? "lendo…" : undefined}>
        <div className="flex flex-col gap-2">
          <p className="text-micro text-fg-muted">Envie o PDF da fatura ou da composição. Revise a leitura e escolha uma fonte principal; os outros documentos não são somados aos gastos.</p>
          {podeAgir && (
            <div>
              <Button type="button" size="sm" variant="secondary" loading={ocupado === "/documentos"} loadingLabel="Enviando…" onClick={() => pdfRef.current?.click()}>
                <Upload size={14} aria-hidden /> Enviar PDF para revisão
              </Button>
              <input
                ref={pdfRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                tabIndex={-1}
                aria-label="PDF da fatura"
                onChange={(e) => {
                  const a = e.target.files?.[0];
                  if (a) void enviarPdf(a);
                }}
              />
            </div>
          )}
          {v.documentos.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-sm">
              <span className="font-medium">{d.nome}</span>
              <Selo tom={TOM_DO_DOCUMENTO[d.status] ?? "neutro"}>{NOMES_DOS_DOCUMENTOS[d.status] ?? d.status}</Selo>
              {d.temArquivo && (
                <Button href={`${urlDaFatura}/documentos/${d.id}/arquivo?empresa=${empresaId}`} download size="xs" variant="secondary">
                  Baixar original
                </Button>
              )}
              {podeAgir && d.status === "falhou" && (
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  loading={ocupado === `/documentos/${d.id}/reler`}
                  onClick={() => void escrever(`/documentos/${d.id}/reler`, comJson("POST", { empresa: empresaId }), "Leitura pedida de novo.", "documento")}
                >
                  <RotateCcw size={12} aria-hidden /> Tentar a leitura de novo
                </Button>
              )}
              {podeAgir && (["revisar", "falhou"].includes(d.status) || (d.status === "complementar" && !paga)) && (
                <Button type="button" size="xs" onClick={() => setRevisando(d)}>
                  {d.status === "falhou" ? "Manter como comprovante" : d.status === "complementar" ? "Revisar fonte complementar" : "Revisar leitura"}
                </Button>
              )}
              {d.erro && <p className="w-full text-sm text-danger">{d.erro}</p>}
            </div>
          ))}
        </div>
      </BlocoRecolhivel>

      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          Total: <strong className="tabular-nums">{moeda(v.total)}</strong>
        </span>
        <span>
          Distribuído: <strong className="tabular-nums">{distribuido === null ? "—" : moeda(textoDeCentavos(distribuido))}</strong>
        </span>
        <span>
          Restante: <strong className="tabular-nums">{restante === null ? "—" : moeda(textoDeCentavos(restante))}</strong>
        </span>
      </div>
      {v.aplicacao === "APLICADA" && <Aviso tom="sucesso">Distribuição aplicada ao pagamento.</Aviso>}
      {v.aplicacao === "DESATUALIZADA" && <Aviso tom="atencao">A classificação do pagamento mudou no NEO depois da aplicação. Revise antes de continuar.</Aviso>}
      {!v.pagamentoId && <Aviso tom="info">Associe primeiro a transação que pagou a fatura para aplicar a distribuição.</Aviso>}

      <Input aria-label="Buscar gasto" placeholder="Buscar gasto por descrição, data ou valor" value={busca} onChange={(e) => {
        setBusca(e.target.value);
        setPagina(0);
      }} />
      {podeAgir && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <CampoForm label="Conta para os gastos selecionados" htmlFor={`${base}-lote`}>
              <Select id={`${base}-lote`} busca value={contaDoLote} disabled={bloqueada} onChange={(e) => setContaDoLote(e.target.value)}>
                <option value="">Escolha a conta</option>
                {contas.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={bloqueada || !contaDoLote || selecionados.size === 0}
            onClick={() => {
              const novas = { ...partes };
              for (const i of v.itens) if (selecionados.has(i.id)) novas[i.id] = [{ conta_id: contaDoLote, historico: i.descricao.slice(0, 350), valor: i.valor }];
              setPartes(novas);
            }}
          >
            Classificar {selecionados.size} selecionado(s)
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
              <th className="w-8 py-2 pr-2">
                {podeAgir && (
                  <Checkbox
                    aria-label="Selecionar os gastos filtrados"
                    disabled={bloqueada}
                    checked={filtrados.length > 0 && filtrados.every((i) => selecionados.has(i.id))}
                    onChange={(e) => setSelecionados(e.target.checked ? new Set(filtrados.map((i) => i.id)) : new Set())}
                  />
                )}
              </th>
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Gasto</th>
              <th className="py-2 pr-3 text-right font-medium">Valor</th>
              <th className="py-2 font-medium">Distribuição</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA).map((i) => (
              <tr key={i.id} className="border-b border-border last:border-0 align-top">
                <td className="py-2 pr-2">
                  {podeAgir && (
                    <Checkbox
                      aria-label={`Selecionar ${i.descricao}`}
                      disabled={bloqueada}
                      checked={selecionados.has(i.id)}
                      onChange={() =>
                        setSelecionados((antes) => {
                          const nova = new Set(antes);
                          if (nova.has(i.id)) nova.delete(i.id);
                          else nova.add(i.id);
                          return nova;
                        })
                      }
                    />
                  )}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{diaDoCalendario(i.data)}</td>
                <td className="py-2 pr-3">{i.descricao}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{moeda(i.valor)}</td>
                <td className="py-2">
                  <p className="text-micro text-fg-muted">{(partes[i.id] ?? []).map((p) => `${rotulo(p.conta_id)}: ${moeda(textoDeCentavos(centavosDigitados(p.valor) ?? BigInt(0)))}`).join("; ") || "Não classificado"}</p>
                  {podeAgir && (
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      disabled={bloqueada}
                      onClick={() => {
                        setDividindo(i);
                        setDivisao(partes[i.id] ?? [{ conta_id: "", historico: i.descricao.slice(0, 350), valor: i.valor }]);
                      }}
                    >
                      Editar / dividir
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button type="button" size="xs" variant="secondary" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
            Anterior
          </Button>
          <span>
            {pag + 1} / {paginas} · {filtrados.length} gastos
          </span>
          <Button type="button" size="xs" variant="secondary" disabled={pag + 1 >= paginas} onClick={() => setPagina(pag + 1)}>
            Próxima
          </Button>
        </div>
      )}

      {podeAgir && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={bloqueada || !suja} loading={ocupado === "/distribuicao"} onClick={salvar}>
            Salvar distribuição
          </Button>
          {v.aplicacao ? (
            <Button type="button" variant="danger" disabled={ocupado !== null} onClick={() => setMotivo({ acao: "desfazer", texto: "", preservar: false })}>
              Desfazer a distribuição aplicada
            </Button>
          ) : (
            <Button
              type="button"
              disabled={ocupado !== null || suja || restante !== BigInt(0) || !v.itens.length || !v.pagamentoId}
              onClick={() => setMotivo({ acao: "aplicar", texto: "", preservar: false })}
            >
              Aplicar ao pagamento
            </Button>
          )}
        </div>
      )}
      {erro && <Aviso>{erro}</Aviso>}

      <Modal open={!!dividindo} onClose={() => setDividindo(null)} title={dividindo ? `Distribuir ${dividindo.descricao}` : ""} maxWidth="max-w-2xl">
        {dividindo && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted">Valor do gasto: {moeda(dividindo.valor)}</p>
            {divisao.map((p, n) => (
              <fieldset key={n} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <legend className="px-1 text-micro text-fg-muted">Parte {n + 1}</legend>
                <Select aria-label={`Conta da parte ${n + 1}`} busca value={p.conta_id} onChange={(e) => setDivisao((a) => a.map((x, j) => (j === n ? { ...x, conta_id: e.target.value } : x)))}>
                  <option value="">Escolha a conta</option>
                  {contas.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Input aria-label={`Valor da parte ${n + 1}`} prefix="R$" inputMode="decimal" value={valorParaCampo(p.valor)} onChange={(e) => setDivisao((a) => a.map((x, j) => (j === n ? { ...x, valor: e.target.value } : x)))} />
                <Input aria-label={`Histórico da parte ${n + 1}`} maxLength={350} value={p.historico} onChange={(e) => setDivisao((a) => a.map((x, j) => (j === n ? { ...x, historico: e.target.value } : x)))} />
                <div>
                  <Button type="button" size="xs" variant="danger" onClick={() => setDivisao((a) => a.filter((_, j) => j !== n))}>
                    Remover parte
                  </Button>
                </div>
              </fieldset>
            ))}
            <div>
              <Button type="button" size="sm" variant="secondary" onClick={() => setDivisao((a) => [...a, { conta_id: "", historico: dividindo.descricao.slice(0, 350), valor: "" }])}>
                <Plus size={14} aria-hidden /> Adicionar parte
              </Button>
            </div>
            {problemaDaDivisao(divisao, dividindo.valor) && <p className="text-sm text-fg-muted">{problemaDaDivisao(divisao, dividindo.valor)}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDividindo(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={!!problemaDaDivisao(divisao, dividindo.valor)}
                onClick={() => {
                  setPartes((a) => ({ ...a, [dividindo.id]: partesParaEnviar(divisao) }));
                  setDividindo(null);
                }}
              >
                Usar esta distribuição
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!motivo} onClose={() => setMotivo(null)} title={motivo?.acao === "aplicar" ? "Aplicar a distribuição ao pagamento" : "Desfazer a distribuição aplicada"}>
        {motivo && (
          <div className="flex flex-col gap-3">
            <CampoForm label={motivo.acao === "aplicar" ? "Motivo ou observação" : "Motivo do desfazimento"} htmlFor={`${base}-motivo`} required>
              <Input id={`${base}-motivo`} maxLength={300} value={motivo.texto} onChange={(e) => setMotivo({ ...motivo, texto: e.target.value })} />
            </CampoForm>
            {motivo.acao === "desfazer" && v.aplicacao === "DESATUALIZADA" && (
              <Checkbox
                id={`${base}-preservar`}
                label="Encerrar este controle preservando a classificação atual do NEO, sem restaurar a anterior"
                checked={motivo.preservar}
                onChange={(e) => setMotivo({ ...motivo, preservar: e.target.checked })}
              />
            )}
            {erro && <Aviso>{erro}</Aviso>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setMotivo(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant={motivo.acao === "desfazer" ? "dangerSolid" : "primary"}
                disabled={!motivo.texto.trim() || (motivo.acao === "desfazer" && v.aplicacao === "DESATUALIZADA" && !motivo.preservar)}
                loading={ocupado !== null}
                onClick={() => void confirmarMotivo()}
              >
                {motivo.acao === "aplicar" ? "Aplicar" : "Desfazer"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {revisando && (
        <RevisaoDoDocumento
          empresaId={empresaId}
          urlDaFatura={urlDaFatura}
          documento={revisando}
          versao={v.versao}
          haGastos={v.itens.length > 0}
          paga={paga}
          fechar={() => setRevisando(null)}
          confirmado={(nova) => {
            setRevisando(null);
            aceitar(nova);
            mudouGastos();
          }}
        />
      )}
    </section>
  );
}

function RevisaoDoDocumento({
  empresaId,
  urlDaFatura,
  documento,
  versao,
  haGastos,
  paga,
  fechar,
  confirmado,
}: {
  empresaId: string;
  urlDaFatura: string;
  documento: DocumentoDaVista;
  versao: number;
  haGastos: boolean;
  paga: boolean;
  fechar: () => void;
  confirmado: (v: Vista) => void;
}) {
  const toast = useToast();
  const rascunho = rascunhoDe(documento.resultado);
  const [itens, setItens] = useState<ItemDoRascunho[]>(() => (rascunho.itens ?? []).map((i) => ({ ...i, valor: valorParaCampo(i.valor) })));
  const [total, setTotal] = useState(valorParaCampo(rascunho.total ?? ""));
  const [revisado, setRevisado] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [substituindo, setSubstituindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmar(principal: boolean) {
    setOcupado(true);
    setErro(null);
    const totalEmCentavos = centavosDigitados(total);
    const r = await pedir<Vista>(
      `${urlDaFatura}/documentos/${documento.id}/confirmar`,
      "distribuicao",
      comJson("POST", {
        empresa: empresaId,
        versao,
        principal,
        substituir: haGastos,
        pendenciasResolvidas: revisado,
        total: totalEmCentavos === null ? total : textoDeCentavos(totalEmCentavos),
        itens: itensParaEnviar(itens),
      }),
    );
    setOcupado(false);
    setSubstituindo(false);
    if (!r.ok) return setErro(r.erro);
    toast.success(principal ? "Os gastos da fatura agora são os deste documento." : "Documento mantido como complementar.");
    confirmado(r.valor);
  }

  const editar = (k: number, campo: keyof ItemDoRascunho, valor: string) => setItens((a) => a.map((x, j) => (j === k ? { ...x, [campo]: valor } : x)));
  const paginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const fecham = itensFecham(itens, total);
  const podePrincipal = ["revisar", "complementar"].includes(documento.status) && !paga && revisado && fecham;

  return (
    <Modal open onClose={fechar} title={`Revisar leitura: ${documento.nome}`} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3">
        {rascunho.metodo && <p className="text-micro text-fg-muted">Lido por {rascunho.metodo === "COMPOSICAO" ? "composição" : rascunho.metodo === "TEXTO" ? "texto do PDF" : "imagem (IA)"}.</p>}
        {(rascunho.pendencias ?? []).map((p, n) => (
          <Aviso key={`p${n}`} tom="atencao">
            {p}
          </Aviso>
        ))}
        {(rascunho.pagamentos_anteriores ?? []).map((p, n) => (
          <p key={`a${n}`} className="text-sm text-fg-muted">
            Pagamento da fatura anterior (fora dos gastos): {p}
          </p>
        ))}
        <CampoForm label="Total declarado na fatura" htmlFor={`rev-total-${documento.id}`}>
          <Input id={`rev-total-${documento.id}`} prefix="R$" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </CampoForm>
        <div className="flex flex-col gap-2">
          {itens.slice(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA).map((i, n) => {
            const k = pag * POR_PAGINA + n;
            return (
              <div key={k} className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_130px_auto]">
                <CampoData aria-label={`Data do item ${k + 1}`} value={i.data} onChange={(valor) => editar(k, "data", valor)} />
                <Input aria-label={`Descrição do item ${k + 1}`} maxLength={500} value={i.descricao} onChange={(e) => editar(k, "descricao", e.target.value)} />
                <Input aria-label={`Valor do item ${k + 1}`} inputMode="decimal" value={i.valor} onChange={(e) => editar(k, "valor", e.target.value)} />
                <Button type="button" size="sm" variant="danger" onClick={() => setItens((a) => a.filter((_, j) => j !== k))}>
                  Remover
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="xs" variant="secondary" disabled={pag === 0} onClick={() => setPagina(pag - 1)}>
            Anterior
          </Button>
          <span className="text-sm">
            {pag + 1} / {paginas} · {itens.length} itens
          </span>
          <Button type="button" size="xs" variant="secondary" disabled={pag + 1 >= paginas} onClick={() => setPagina(pag + 1)}>
            Próxima
          </Button>
          <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => {
              setItens((a) => [...a, { data: "", descricao: "", valor: "" }]);
              setPagina(Math.floor(itens.length / POR_PAGINA));
            }}
          >
            <Plus size={12} aria-hidden /> Adicionar item
          </Button>
        </div>
        <p className="text-sm">
          Soma dos itens:{" "}
          <strong className="tabular-nums">{(() => {
            const s = somaEmCentavos(itens.map((i) => i.valor));
            return s === null ? "—" : moeda(textoDeCentavos(s));
          })()}</strong>
          {!fecham && itens.length > 0 && <span className="text-fg-muted"> · não fecha o total declarado</span>}
        </p>
        <Checkbox id={`rev-ok-${documento.id}`} label="Conferi os itens, o total e resolvi as pendências da leitura." checked={revisado} onChange={(e) => setRevisado(e.target.checked)} />
        <p className="text-micro text-fg-muted">Usar como principal substitui a lista anterior; não soma documentos. Os gastos de fatura paga não podem ser substituídos.</p>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={fechar}>
            Cancelar
          </Button>
          <Button type="button" variant="secondary" disabled={ocupado || documento.status === "complementar"} onClick={() => void confirmar(false)}>
            Manter só como complementar
          </Button>
          <Button type="button" disabled={!podePrincipal} loading={ocupado} onClick={() => (haGastos ? setSubstituindo(true) : void confirmar(true))}>
            Confirmar fonte principal
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={substituindo}
        title="Substituir os gastos atuais?"
        description="Os gastos desta fatura passam a ser os deste documento, e a distribuição salva é limpa."
        confirmLabel="Substituir"
        cancelLabel="Voltar"
        pending={ocupado}
        error={erro}
        onConfirm={() => void confirmar(true)}
        onCancel={() => setSubstituindo(false)}
      />
    </Modal>
  );
}
