"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Ban, CheckCircle2, Eye, FileUp, Link2, Loader2, Plus, SkipForward, Trash2, Unlink, Upload } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { formatCalendarDate } from "@/lib/format";
import { moeda } from "@/lib/contabil-core/tela";
import type { TransacaoParaAssociar } from "@/lib/contabil-core/notas/telaDasNotas";
import {
  ACEITA,
  COMPROVANTES_POR_PAGINA,
  consultaDaLista,
  diaDigitado,
  diaDoInstante,
  ERROS_QUE_PULAM_O_ARQUIVO,
  separarArquivos,
  textoDaExclusao,
  valorDigitado,
  valorParaCampo,
  type ComprovanteDaTela,
  type ExtracaoDoComprovante,
  type FiltrosDaTela,
  type ListaDeComprovantes,
} from "@/lib/contabil-core/comprovantes/telaDosComprovantes";

// Os comprovantes de pagamento (Bloco C, Fase C2, 19/11/2026): porte do `Comprovantes.tsx` do Contábil
// Core. Arrastar um ou vários PDFs ou imagens (ou escolher no botão) abre o cadastro, um arquivo por vez:
// o arquivo é lido para pré-preencher o formulário (rótulos do texto e, com a chave ligada, a IA), a
// pessoa revisa e salva, e a fila segue. A nota fiscal e o arquivo já importado são pulados sozinhos; o
// possível duplicado (mesmo valor, dia e favorecido) pede confirmação. A lista tem o filtro de status,
// associa a uma transação pendente do extrato, desfaz a associação e exclui. Quem só lê vê a lista.

const BASE = "/api/contabil-core/comprovantes";

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

const dataDoDia = (d: string) => formatCalendarDate(new Date(`${d.slice(0, 10)}T00:00:00.000Z`));
/** A data do comprovante é a meia-noite UTC do dia lido: mostra o dia gravado. */
const dataDoPagamento = (iso: string | null) => (iso ? formatCalendarDate(new Date(iso), { timeZone: "UTC" }) : "—");

type Props = { empresaId: string; podeAgir: boolean };

export function Comprovantes({ empresaId, podeAgir }: Props) {
  const base = useId();
  const toast = useToast();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const arrastando = useRef(0);
  const [sobre, setSobre] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosDaTela>({ status: "" });
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<{ chave: string; recarga: number; erro: string | null; dados: ListaDeComprovantes | null }>({ chave: "", recarga: 0, erro: null, dados: null });
  const [fila, setFila] = useState<File[] | null>(null);
  const [associando, setAssociando] = useState<ComprovanteDaTela | null>(null);
  const [excluindo, setExcluindo] = useState<ComprovanteDaTela | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erroDoDialogo, setErroDoDialogo] = useState<string | null>(null);

  const consulta = consultaDaLista(empresaId, filtros, pagina).toString();
  const [recarga, setRecarga] = useState(0);
  const carregar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    let vivo = true;
    void pedir<ListaDeComprovantes>(`${BASE}?${consulta}`, "lista").then((r) => {
      if (vivo) setLista(r.ok ? { chave: consulta, recarga, erro: null, dados: r.valor } : { chave: consulta, recarga, erro: r.erro, dados: null });
    });
    return () => {
      vivo = false;
    };
  }, [consulta, recarga]);
  const carregando = lista.chave !== consulta || lista.recarga !== recarga;

  function abrirFila(arquivos: File[]) {
    const { validos, ignorados } = separarArquivos(arquivos);
    if (validos.length === 0) return toast.error("Escolha arquivos .pdf, .png ou .jpg.");
    if (ignorados > 0) toast.show("Alguns arquivos ficaram de fora: só .pdf, .png e .jpg são aceitos.", "info");
    setFila(validos);
    if (arquivoRef.current) arquivoRef.current.value = "";
  }

  const arrastar = {
    onDragEnter: (e: React.DragEvent) => {
      if (!podeAgir || fila || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      arrastando.current += 1;
      setSobre(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (podeAgir && !fila) e.preventDefault();
    },
    onDragLeave: () => {
      arrastando.current = Math.max(0, arrastando.current - 1);
      if (arrastando.current === 0) setSobre(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!podeAgir || fila) return;
      e.preventDefault();
      arrastando.current = 0;
      setSobre(false);
      abrirFila(Array.from(e.dataTransfer.files));
    },
  };

  async function escrever(c: ComprovanteDaTela, caminho: string, init: RequestInit, sucesso: string): Promise<boolean> {
    setOcupado(c.id);
    setErroDoDialogo(null);
    const r = await pedir<unknown>(`${BASE}/${c.id}${caminho}`, "ok", init);
    setOcupado(null);
    if (!r.ok) {
      setErroDoDialogo(r.erro);
      toast.error(r.erro);
      carregar();
      return false;
    }
    toast.success(sucesso);
    carregar();
    return true;
  }

  const desassociar = (c: ComprovanteDaTela) => void escrever(c, "/associar", comJson("DELETE", { empresa: empresaId }), "Associação removida.");

  async function associar(transacaoId: string) {
    if (!associando) return;
    if (await escrever(associando, "/associar", comJson("POST", { empresa: empresaId, transacaoId }), "Comprovante associado à transação.")) setAssociando(null);
  }

  async function excluir() {
    if (!excluindo) return;
    if (await escrever(excluindo, "", comJson("DELETE", { empresa: empresaId }), "Comprovante excluído.")) setExcluindo(null);
  }

  const dados = lista.dados;
  const total = dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / COMPROVANTES_POR_PAGINA));

  return (
    <div className="relative flex flex-col gap-4" {...arrastar}>
      {sobre && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-surface/90">
          <p className="flex flex-col items-center gap-1 text-center text-sm font-medium">
            <FileUp size={28} aria-hidden className="text-brand" />
            Solte os comprovantes aqui
            <span className="text-micro font-normal text-fg-muted">PDF, PNG ou JPG; pode soltar vários de uma vez</span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          Comprovantes de pagamento ligados às transações do extrato.
          {podeAgir && " Arraste um ou vários arquivos .pdf, .png ou .jpg para esta área para cadastrar."}
        </p>
        {podeAgir && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => arquivoRef.current?.click()}>
              <Upload size={14} aria-hidden /> Escolher arquivos
            </Button>
            <input
              ref={arquivoRef}
              type="file"
              accept={ACEITA}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivos de comprovantes"
              onChange={(e) => abrirFila(Array.from(e.target.files ?? []))}
            />
            <Button type="button" onClick={() => setFila([])}>
              <Plus size={14} aria-hidden /> Novo comprovante
            </Button>
          </div>
        )}
      </div>

      <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <legend className="sr-only">Filtro dos comprovantes</legend>
        <CampoForm label="Status" htmlFor={`${base}-status`}>
          <Select
            id={`${base}-status`}
            compact
            value={filtros.status}
            onChange={(e) => {
              setFiltros({ status: e.target.value as FiltrosDaTela["status"] });
              setPagina(1);
            }}
          >
            <option value="">Todos</option>
            <option value="associado">Associados</option>
            <option value="nao_associado">Não associados</option>
          </Select>
        </CampoForm>
        {filtros.status && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setFiltros({ status: "" });
              setPagina(1);
            }}
          >
            Limpar filtro
          </Button>
        )}
      </fieldset>

      <section aria-labelledby={`${base}-titulo`} aria-busy={carregando}>
        <h2 id={`${base}-titulo`} className="mb-2 text-base font-semibold">
          Comprovantes {total > 0 && <span className="text-sm font-normal text-fg-muted">({total} no total)</span>}
        </h2>
        {lista.erro ? (
          <Aviso>
            {lista.erro}{" "}
            <button type="button" className="underline" onClick={carregar}>
              Tentar de novo
            </button>
          </Aviso>
        ) : !dados ? (
          <p className="text-sm text-fg-muted">Carregando…</p>
        ) : dados.itens.length === 0 ? (
          <p className="text-sm text-fg-muted">{filtros.status ? "Nenhum comprovante encontrado com esse filtro." : "Nenhum comprovante cadastrado."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Pagamento</th>
                  <th className="py-2 pr-3 font-medium">Favorecido</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor pago</th>
                  <th className="py-2 pr-3 text-right font-medium">Juros</th>
                  <th className="py-2 pr-3 text-right font-medium">Multa</th>
                  <th className="py-2 pr-3 text-right font-medium">Desconto</th>
                  <th className="py-2 pr-3 font-medium">Arquivo</th>
                  <th className="py-2 pr-3 font-medium">Transação vinculada</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  {podeAgir && <th className="py-2 font-medium"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((c) => (
                  <LinhaDoComprovante
                    key={c.id}
                    c={c}
                    empresaId={empresaId}
                    podeAgir={podeAgir}
                    ocupado={ocupado === c.id}
                    onAssociar={() => {
                      setErroDoDialogo(null);
                      setAssociando(c);
                    }}
                    onDesassociar={() => desassociar(c)}
                    onExcluir={() => {
                      setErroDoDialogo(null);
                      setExcluindo(c);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <nav className="mt-3 flex items-center gap-3 text-sm" aria-label="Páginas dos comprovantes">
            <Button type="button" size="sm" variant="ghost" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-fg-muted">
              Página {pagina} de {paginas}
            </span>
            <Button type="button" size="sm" variant="ghost" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </Button>
          </nav>
        )}
      </section>

      {fila && (
        <NovoComprovante
          empresaId={empresaId}
          fila={fila}
          onSalvo={carregar}
          onFechar={() => {
            setFila(null);
            carregar();
          }}
        />
      )}

      {associando && (
        <AssociarTransacao
          empresaId={empresaId}
          comprovante={associando}
          ocupado={ocupado === associando.id}
          erro={erroDoDialogo}
          onEscolher={(id) => void associar(id)}
          onFechar={() => setAssociando(null)}
        />
      )}

      <ConfirmDialog
        open={!!excluindo}
        title="Excluir comprovante?"
        description={excluindo ? textoDaExclusao(excluindo) : undefined}
        confirmLabel="Excluir"
        cancelLabel="Voltar"
        pendingLabel="Excluindo…"
        destructive
        pending={!!excluindo && ocupado === excluindo.id}
        error={erroDoDialogo}
        onConfirm={() => void excluir()}
        onCancel={() => setExcluindo(null)}
      >
        {excluindo && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-surface-2 p-3 text-sm">
            <dt className="text-fg-muted">Valor pago</dt>
            <dd className="font-medium">{moeda(excluindo.valorPago)}</dd>
            <dt className="text-fg-muted">Favorecido</dt>
            <dd className="font-medium">{excluindo.favorecido || "Não informado"}</dd>
            <dt className="text-fg-muted">Pagamento</dt>
            <dd className="font-medium">{dataDoPagamento(excluindo.dataPagamento)}</dd>
            {excluindo.arquivoNome && (
              <>
                <dt className="text-fg-muted">Arquivo</dt>
                <dd className="truncate font-medium">{excluindo.arquivoNome}</dd>
              </>
            )}
          </dl>
        )}
      </ConfirmDialog>
    </div>
  );
}

// ─── Linha ──────────────────────────────────────────────────────────────────

function LinhaDoComprovante({
  c,
  empresaId,
  podeAgir,
  ocupado,
  onAssociar,
  onDesassociar,
  onExcluir,
}: {
  c: ComprovanteDaTela;
  empresaId: string;
  podeAgir: boolean;
  ocupado: boolean;
  onAssociar: () => void;
  onDesassociar: () => void;
  onExcluir: () => void;
}) {
  const acrescimo = (v: string) => (Number(v) > 0 ? moeda(v) : "—");
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dataDoPagamento(c.dataPagamento)}</td>
      <td className="max-w-[220px] py-2 pr-3">
        <span className="block truncate" title={c.favorecido ?? undefined}>
          {c.favorecido || "—"}
        </span>
        {c.cpfCnpj && <span className="block text-micro text-fg-muted tabular-nums">{c.cpfCnpj}</span>}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{moeda(c.valorPago)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-right text-micro tabular-nums">{acrescimo(c.juros)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-right text-micro tabular-nums">{acrescimo(c.multa)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-right text-micro tabular-nums">{acrescimo(c.desconto)}</td>
      <td className="py-2 pr-3">
        {c.temArquivo ? (
          <a
            href={`${BASE}/${c.id}/arquivo?empresa=${empresaId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-micro text-brand underline"
            title={c.arquivoNome ?? undefined}
          >
            <Eye size={12} aria-hidden /> Ver<span className="sr-only"> o arquivo {c.arquivoNome}</span>
          </a>
        ) : (
          <span className="text-micro text-fg-muted">—</span>
        )}
      </td>
      <td className="min-w-[200px] py-2 pr-3">
        {c.transacao ? (
          <span className="block">
            <span className="block max-w-[240px] truncate text-micro font-medium" title={c.transacao.historico}>
              {c.transacao.historico || "—"}
            </span>
            <span className="block whitespace-nowrap text-micro text-fg-muted">
              {dataDoDia(c.transacao.data)} · {c.transacao.dc === "D" ? "Débito" : "Crédito"} · {moeda(c.transacao.valor)}
            </span>
            {c.transacao.desfeita && <span className="block text-micro text-warning-fg">A importação desta transação foi desfeita.</span>}
          </span>
        ) : c.transacaoId ? (
          <span className="font-mono text-micro text-fg-muted" title={c.transacaoId}>
            ID {c.transacaoId.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-micro text-fg-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <Selo tom={c.transacaoId ? "sucesso" : "atencao"}>{c.transacaoId ? "Associado" : "Pendente"}</Selo>
      </td>
      {podeAgir && (
        <td className="py-2">
          <span className="flex flex-wrap items-center gap-1">
            {c.transacaoId ? (
              <Button type="button" size="xs" variant="secondary" onClick={onDesassociar} loading={ocupado} loadingLabel="Removendo…">
                <Unlink size={12} aria-hidden /> Remover associação
              </Button>
            ) : (
              <Button type="button" size="xs" variant="secondary" onClick={onAssociar} disabled={ocupado}>
                <Link2 size={12} aria-hidden /> Associar
              </Button>
            )}
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-danger"
              onClick={onExcluir}
              disabled={ocupado}
              aria-label={`Excluir comprovante de ${moeda(c.valorPago)}${c.favorecido ? ` para ${c.favorecido}` : ""}`}
            >
              <Trash2 size={12} aria-hidden /> Excluir
            </Button>
          </span>
        </td>
      )}
    </tr>
  );
}

// ─── Associar ───────────────────────────────────────────────────────────────

function AssociarTransacao({
  empresaId,
  comprovante,
  ocupado,
  erro,
  onEscolher,
  onFechar,
}: {
  empresaId: string;
  comprovante: ComprovanteDaTela;
  ocupado: boolean;
  erro: string | null;
  onEscolher: (transacaoId: string) => void;
  onFechar: () => void;
}) {
  const base = useId();
  const [busca, setBusca] = useState("");
  const [estado, setEstado] = useState<{ carregando: boolean; erro: string | null; itens: TransacaoParaAssociar[] }>({ carregando: true, erro: null, itens: [] });

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ empresa: empresaId, ...(busca.trim() ? { busca: busca.trim() } : {}) });
      const r = await pedir<TransacaoParaAssociar[]>(`${BASE}/transacoes?${q}`, "transacoes");
      if (vivo) setEstado(r.ok ? { carregando: false, erro: null, itens: r.valor } : { carregando: false, erro: r.erro, itens: [] });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [empresaId, busca]);

  return (
    <Modal open onClose={onFechar} title="Associar a uma transação" maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Escolha a transação pendente que corresponde ao comprovante de {moeda(comprovante.valorPago)}
          {comprovante.favorecido ? ` para ${comprovante.favorecido}` : ""}.
        </p>
        <CampoForm label="Buscar no histórico" htmlFor={`${base}-busca`}>
          <Input id={`${base}-busca`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Trecho do histórico" />
        </CampoForm>
        {erro && <Aviso>{erro}</Aviso>}
        {estado.erro ? (
          <Aviso>{estado.erro}</Aviso>
        ) : estado.carregando ? (
          <p className="text-sm text-fg-muted">Carregando…</p>
        ) : estado.itens.length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-muted">Nenhuma transação pendente encontrada.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-label="Transações pendentes">
            {estado.itens.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onEscolher(t.id)}
                  className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-60"
                >
                  <span className="block text-sm font-medium">{t.historico || "—"}</span>
                  <span className="block text-micro text-fg-muted">
                    {dataDoDia(t.data)} · {t.dc === "D" ? "Débito" : "Crédito"} · {moeda(t.valor)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Novo comprovante (com a fila de arquivos) ──────────────────────────────

type Campos = {
  favorecido: string;
  cpfCnpj: string;
  valorPago: string;
  valorDocumento: string;
  dataPagamento: string;
  dataVencimento: string;
  juros: string;
  multa: string;
  desconto: string;
  observacao: string;
};

const VAZIOS: Campos = { favorecido: "", cpfCnpj: "", valorPago: "", valorDocumento: "", dataPagamento: "", dataVencimento: "", juros: "", multa: "", desconto: "", observacao: "" };

type Extracao = { estado: "parado" | "lendo" | "lido" | "falhou" | "recusado"; ia: boolean; motivo: string | null };
/** O resultado da leitura, preso ao arquivo lido: enquanto o arquivo da vez não tem o seu, ele está sendo lido. */
type Leitura = Extracao & { arquivo: File };

/**
 * O cadastro, um arquivo da fila por vez (ou nenhum, no "Novo comprovante"). Cada arquivo é lido para
 * pré-preencher; salvar ou pular segue para o próximo, e o último fecha. Fechar com arquivos pela frente
 * pede confirmação: um toque errado não joga a fila fora.
 */
function NovoComprovante({ empresaId, fila, onSalvo, onFechar }: { empresaId: string; fila: File[]; onSalvo: () => void; onFechar: () => void }) {
  const base = useId();
  const toast = useToast();
  const escolherRef = useRef<HTMLInputElement>(null);
  const [indice, setIndice] = useState(0);
  // O arquivo da fila na tela; trocado à mão no "Escolher arquivo" quando a fila está vazia.
  const [avulso, setAvulso] = useState<File | null>(null);
  const atual: File | null = fila.length ? (fila[indice] ?? null) : avulso;
  const emLote = fila.length > 1;
  const [campos, setCampos] = useState<Campos>(VAZIOS);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const extracao: Extracao = !atual
    ? { estado: "parado", ia: false, motivo: null }
    : leitura && leitura.arquivo === atual
      ? leitura
      : { estado: "lendo", ia: false, motivo: null };
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<string | null>(null);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  const avancar = useCallback(() => {
    setCampos(VAZIOS);
    setErro(null);
    if (fila.length && indice + 1 < fila.length) setIndice((k) => k + 1);
    else onFechar();
  }, [fila.length, indice, onFechar]);

  // Lê o arquivo da vez para pré-preencher (a resposta de um arquivo que já saiu da tela é descartada).
  useEffect(() => {
    if (!atual) return;
    let vivo = true;
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("arquivo", atual);
    void pedir<ExtracaoDoComprovante>(`${BASE}/extrair`, "extracao", { method: "POST", body: form }).then((r) => {
      if (!vivo) return;
      if (r.ok) {
        const d = r.valor;
        setCampos((c) => ({
          ...c,
          favorecido: d.favorecido ?? c.favorecido,
          cpfCnpj: d.cpfCnpj ?? c.cpfCnpj,
          valorPago: d.valorPago !== null ? valorParaCampo(d.valorPago) : c.valorPago,
          valorDocumento: d.valorDocumento !== null ? valorParaCampo(d.valorDocumento) : c.valorDocumento,
          dataPagamento: d.dataPagamento ? diaDoInstante(d.dataPagamento) : c.dataPagamento,
          dataVencimento: d.dataVencimento ? diaDoInstante(d.dataVencimento) : c.dataVencimento,
          juros: d.juros !== null ? valorParaCampo(d.juros) : c.juros,
          multa: d.multa !== null ? valorParaCampo(d.multa) : c.multa,
          desconto: d.desconto !== null ? valorParaCampo(d.desconto) : c.desconto,
        }));
        setLeitura({ arquivo: atual, estado: "lido", ia: d.confianca === "ia", motivo: null });
        return;
      }
      if (r.codigo && ERROS_QUE_PULAM_O_ARQUIVO.has(r.codigo)) {
        // A nota fiscal e o arquivo já importado: preencher à mão não resolve. Na fila, segue sozinho.
        toast.error(`${atual.name}: ${r.codigo === "COMPROVANTE_JA_IMPORTADO" ? "já importado" : "não é comprovante"}. ${r.erro}`);
        if (emLote) return avancar();
        setLeitura({ arquivo: atual, estado: "recusado", ia: false, motivo: r.erro });
        return;
      }
      setLeitura({ arquivo: atual, estado: "falhou", ia: false, motivo: r.erro });
    });
    return () => {
      vivo = false;
    };
    // `avancar` muda junto com o índice; a leitura só depende do arquivo da vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, empresaId]);

  const mudar = (campo: keyof Campos) => (e: React.ChangeEvent<HTMLInputElement>) => setCampos((c) => ({ ...c, [campo]: e.target.value }));

  async function salvar(permitirDuplicado: boolean) {
    if (!campos.valorPago.trim()) return setErro("Informe o valor pago.");
    setErro(null);
    setEnviando(true);
    const texto = (v: string) => (v.trim() ? v.trim() : undefined);
    const valor = (v: string) => (v.trim() ? valorDigitado(v) : undefined);
    const dados = {
      favorecido: texto(campos.favorecido),
      cpfCnpj: texto(campos.cpfCnpj),
      valorPago: valorDigitado(campos.valorPago),
      valorDocumento: valor(campos.valorDocumento),
      dataPagamento: campos.dataPagamento ? diaDigitado(campos.dataPagamento) : undefined,
      dataVencimento: campos.dataVencimento ? diaDigitado(campos.dataVencimento) : undefined,
      juros: valor(campos.juros),
      multa: valor(campos.multa),
      desconto: valor(campos.desconto),
      observacao: texto(campos.observacao),
      permitirDuplicado,
    };
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("dados", JSON.stringify(dados));
    if (atual && extracao.estado !== "recusado") form.set("arquivo", atual);
    const r = await pedir<ComprovanteDaTela>(BASE, "comprovante", { method: "POST", body: form });
    setEnviando(false);
    if (r.ok) {
      toast.success("Comprovante cadastrado.");
      onSalvo();
      return avancar();
    }
    if (r.codigo === "COMPROVANTE_POSSIVEL_DUPLICADO") return setDuplicado(r.erro);
    if (r.codigo === "COMPROVANTE_JA_IMPORTADO") {
      toast.error(r.erro);
      return avancar();
    }
    setErro(r.erro);
  }

  const restantes = fila.length ? fila.length - indice : 0;
  const pedirParaFechar = () => {
    if (enviando || restantes > 1) return setConfirmarDescarte(true);
    onFechar();
  };

  return (
    <Modal
      open
      onClose={pedirParaFechar}
      title={emLote ? `Novo comprovante (${indice + 1} de ${fila.length})` : "Novo comprovante"}
      maxWidth="max-w-lg"
    >
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar(false);
        }}
      >
        {emLote && atual && <p className="truncate text-micro text-fg-muted">{atual.name}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoForm label="Favorecido" htmlFor={`${base}-favorecido`} className="sm:col-span-2">
            <Input id={`${base}-favorecido`} value={campos.favorecido} onChange={mudar("favorecido")} maxLength={300} placeholder="Nome do favorecido" />
          </CampoForm>
          <CampoForm label="CPF/CNPJ" htmlFor={`${base}-documento`}>
            <Input id={`${base}-documento`} value={campos.cpfCnpj} onChange={mudar("cpfCnpj")} maxLength={18} inputMode="numeric" placeholder="000.000.000-00" />
          </CampoForm>
          <CampoForm label="Valor pago" htmlFor={`${base}-valor`} required>
            <Input id={`${base}-valor`} value={campos.valorPago} onChange={mudar("valorPago")} inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Valor do documento" htmlFor={`${base}-documento-valor`}>
            <Input id={`${base}-documento-valor`} value={campos.valorDocumento} onChange={mudar("valorDocumento")} inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Data do pagamento" htmlFor={`${base}-pagamento`}>
            <CampoData id={`${base}-pagamento`} value={campos.dataPagamento} onChange={(v) => setCampos((c) => ({ ...c, dataPagamento: v }))} />
          </CampoForm>
          <CampoForm label="Data de vencimento" htmlFor={`${base}-vencimento`}>
            <CampoData id={`${base}-vencimento`} value={campos.dataVencimento} onChange={(v) => setCampos((c) => ({ ...c, dataVencimento: v }))} />
          </CampoForm>
          <CampoForm label="Juros" htmlFor={`${base}-juros`}>
            <Input id={`${base}-juros`} value={campos.juros} onChange={mudar("juros")} inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Multa" htmlFor={`${base}-multa`}>
            <Input id={`${base}-multa`} value={campos.multa} onChange={mudar("multa")} inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Desconto" htmlFor={`${base}-desconto`}>
            <Input id={`${base}-desconto`} value={campos.desconto} onChange={mudar("desconto")} inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Observação" htmlFor={`${base}-obs`} className="sm:col-span-2">
            <Input id={`${base}-obs`} value={campos.observacao} onChange={mudar("observacao")} maxLength={500} placeholder="Opcional" />
          </CampoForm>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Arquivo (PDF, JPG ou PNG)</p>
          <div className="flex flex-wrap items-center gap-2">
            {!fila.length && (
              <>
                <Button type="button" size="sm" variant="secondary" onClick={() => escolherRef.current?.click()}>
                  <FileUp size={14} aria-hidden /> {avulso ? avulso.name : "Escolher arquivo"}
                </Button>
                <input
                  ref={escolherRef}
                  type="file"
                  accept={ACEITA}
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Arquivo do comprovante"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setAvulso(f);
                    e.target.value = "";
                  }}
                />
                {avulso && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setAvulso(null)}
                  >
                    Remover
                  </Button>
                )}
              </>
            )}
          </div>
          <p className="text-micro text-fg-muted">O PDF e a imagem do comprovante preenchem os campos sozinhos; revise antes de salvar.</p>
          {extracao.estado === "lendo" && (
            <p className="flex items-center gap-1.5 text-micro text-fg-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Lendo o arquivo…
            </p>
          )}
          {extracao.estado === "lido" && (
            <p className="flex items-center gap-1.5 text-micro text-success-fg">
              <CheckCircle2 size={12} aria-hidden /> Dados lidos{extracao.ia ? " pela IA" : ""}. Revise os campos antes de salvar.
            </p>
          )}
          {extracao.estado === "recusado" && (
            <p role="alert" className="flex items-start gap-1.5 text-micro text-danger">
              <Ban size={12} className="mt-0.5 shrink-0" aria-hidden /> {extracao.motivo} Escolha outro arquivo.
            </p>
          )}
          {extracao.estado === "falhou" && <Aviso tom="atencao">{extracao.motivo || "Não foi possível ler o arquivo. Preencha os campos manualmente."}</Aviso>}
        </div>

        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={pedirParaFechar} disabled={enviando}>
            {emLote ? "Cancelar tudo" : "Cancelar"}
          </Button>
          {emLote && (
            <Button
              type="button"
              variant="secondary"
              disabled={enviando}
              onClick={() => {
                toast.show(`${atual?.name ?? "Arquivo"} pulado.`, "info");
                avancar();
              }}
            >
              <SkipForward size={14} aria-hidden /> Pular este
            </Button>
          )}
          <Button type="submit" loading={enviando} loadingLabel="Salvando…" disabled={extracao.estado === "recusado" || extracao.estado === "lendo"}>
            {emLote ? "Salvar e continuar" : "Cadastrar comprovante"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={!!duplicado}
        title="Esse comprovante pode já existir"
        description={duplicado ?? undefined}
        confirmLabel="São pagamentos diferentes: salvar"
        cancelLabel="Voltar e revisar"
        pending={enviando}
        onConfirm={() => {
          setDuplicado(null);
          void salvar(true);
        }}
        onCancel={() => setDuplicado(null)}
      />

      <ConfirmDialog
        open={confirmarDescarte}
        title="Descartar a fila?"
        description={
          enviando
            ? "Há um envio em andamento. Fechar agora tira a fila da tela, mas o comprovante que já foi enviado continua sendo gravado."
            : `Ainda faltam ${restantes} comprovantes nesta fila. Fechar descarta todos, e os arquivos precisam ser escolhidos de novo.`
        }
        confirmLabel="Descartar"
        cancelLabel="Continuar cadastrando"
        destructive
        onConfirm={() => {
          setConfirmarDescarte(false);
          onFechar();
        }}
        onCancel={() => setConfirmarDescarte(false)}
      />
    </Modal>
  );
}
