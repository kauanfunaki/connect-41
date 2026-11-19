"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileUp, Link2, Plus, Unlink, Upload, XCircle } from "lucide-react";
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
import {
  ACEITA,
  acaoDaLinha,
  avisoDaImportacao,
  consultaDaLista,
  diaDaEmissao,
  emissaoDigitada,
  FILTROS_VAZIOS,
  filtrosAtivos,
  NOTAS_POR_PAGINA,
  numeroComSerie,
  podeCancelar,
  ROTULO_DO_STATUS,
  ROTULO_DO_TIPO,
  seloDaProcedencia,
  separarArquivos,
  somarImportacoes,
  textoDoCancelamento,
  valorDigitado,
  type FiltrosDaTela,
  type ImportacaoDeNotas,
  type ListaDeNotas,
  type NotaDaTela,
  type TransacaoParaAssociar,
} from "@/lib/contabil-core/notas/telaDasNotas";

// As notas fiscais (Bloco C, Fase C1, 18/11/2026): porte do `Notas.tsx` do Contábil Core. Importa XML,
// ZIP, PDF ou imagem (arrastando para a área ou pelo botão; um envio por arquivo, para um arquivo com
// defeito não derrubar os outros), lista com filtros e paginação, mostra a procedência (OCR,
// assinatura não conferida e o motivo), associa a nota a uma transação pendente do extrato, desfaz a
// associação e cancela. Quem só lê o módulo vê a lista, sem os botões.

const BASE = "/api/contabil-core/notas";

type Falha = { ok: false; erro: string };
type Resultado<T> = { ok: true; valor: T } | Falha;

async function pedir<T>(url: string, chave: string, init?: RequestInit): Promise<Resultado<T>> {
  const resp = await fetch(url, { cache: "no-store", ...init }).catch(() => null);
  const corpo = (await resp?.json().catch(() => null)) as Record<string, unknown> | null;
  if (!resp?.ok || !corpo || corpo[chave] === undefined) {
    return { ok: false, erro: typeof corpo?.error === "string" ? corpo.error : "Não deu para falar com o servidor. Tente de novo." };
  }
  return { ok: true, valor: corpo[chave] as T };
}

const comJson = (method: string, corpo: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

const dataDaTransacao = (d: string) => formatCalendarDate(new Date(`${d}T00:00:00.000Z`));
const dataDaEmissao = (iso: string) => {
  const { data, fuso } = diaDaEmissao(iso);
  return formatCalendarDate(data, { timeZone: fuso });
};

type Props = { empresaId: string; podeAgir: boolean };

export function Notas({ empresaId, podeAgir }: Props) {
  const base = useId();
  const toast = useToast();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const arrastando = useRef(0);
  const [sobre, setSobre] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosDaTela>(FILTROS_VAZIOS);
  // Os campos de texto esperam a pessoa parar de digitar (400 ms), como no original.
  const [digitados, setDigitados] = useState<FiltrosDaTela>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState<{ chave: string; recarga: number; erro: string | null; dados: ListaDeNotas | null }>({ chave: "", recarga: 0, erro: null, dados: null });
  const [importando, setImportando] = useState(false);
  const [importacao, setImportacao] = useState<{ importadas: number; duplicadas: number; erros: string[] } | null>(null);
  const [associando, setAssociando] = useState<NotaDaTela | null>(null);
  const [cancelando, setCancelando] = useState<NotaDaTela | null>(null);
  const [criando, setCriando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erroDoDialogo, setErroDoDialogo] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setFiltros((f) => {
        const novo = { ...f, numero: digitados.numero, emitente: digitados.emitente, cnpj: digitados.cnpj, chave: digitados.chave };
        if (JSON.stringify(novo) !== JSON.stringify(f)) setPagina(1);
        return novo;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [digitados.numero, digitados.emitente, digitados.cnpj, digitados.chave]);

  // A lista é da consulta atual: enquanto a resposta não chega, a tela mostra que está carregando.
  const consulta = consultaDaLista(empresaId, filtros, pagina).toString();
  const [recarga, setRecarga] = useState(0);
  const carregar = useCallback(() => setRecarga((n) => n + 1), []);
  useEffect(() => {
    let vivo = true;
    void pedir<ListaDeNotas>(`${BASE}?${consulta}`, "lista").then((r) => {
      if (vivo) setLista(r.ok ? { chave: consulta, recarga, erro: null, dados: r.valor } : { chave: consulta, recarga, erro: r.erro, dados: null });
    });
    return () => {
      vivo = false;
    };
  }, [consulta, recarga]);
  const carregando = lista.chave !== consulta || lista.recarga !== recarga;

  const mudarFiltro = (campo: keyof FiltrosDaTela, valor: string, digitado = false) => {
    setDigitados((f) => ({ ...f, [campo]: valor }));
    if (!digitado) {
      setFiltros((f) => ({ ...f, [campo]: valor }));
      setPagina(1);
    }
  };

  const limpar = () => {
    setDigitados(FILTROS_VAZIOS);
    setFiltros(FILTROS_VAZIOS);
    setPagina(1);
  };

  // ─── Importar ───────────────────────────────────────────────────────────

  async function importar(arquivos: File[]) {
    const { validos, ignorados } = separarArquivos(arquivos);
    if (validos.length === 0) return toast.error("Escolha arquivos .xml, .zip, .pdf, .png ou .jpg.");
    if (ignorados > 0) toast.show("Alguns arquivos ficaram de fora: só .xml, .zip, .pdf, .png e .jpg são aceitos.", "info");
    setImportando(true);
    const partes = [];
    for (const arquivo of validos) {
      const form = new FormData();
      form.set("empresa", empresaId);
      form.set("arquivo", arquivo);
      partes.push({ nome: arquivo.name, ...(await pedir<ImportacaoDeNotas>(`${BASE}/importar`, "importacao", { method: "POST", body: form })) });
    }
    setImportando(false);
    const soma = somarImportacoes(partes);
    const aviso = avisoDaImportacao(soma);
    if (aviso.tom === "erro") toast.error(`${aviso.titulo}. ${aviso.texto}`);
    else if (aviso.tom === "atencao") toast.show(`${aviso.titulo}. ${aviso.texto}`, "info");
    else toast.success(`${aviso.titulo}. ${aviso.texto}`);
    setImportacao(soma);
    if (arquivoRef.current) arquivoRef.current.value = "";
    carregar();
  }

  const arrastar = {
    onDragEnter: (e: React.DragEvent) => {
      if (!podeAgir || !Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      arrastando.current += 1;
      setSobre(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (podeAgir) e.preventDefault();
    },
    onDragLeave: () => {
      arrastando.current = Math.max(0, arrastando.current - 1);
      if (arrastando.current === 0) setSobre(false);
    },
    onDrop: (e: React.DragEvent) => {
      if (!podeAgir) return;
      e.preventDefault();
      arrastando.current = 0;
      setSobre(false);
      if (!importando) void importar(Array.from(e.dataTransfer.files));
    },
  };

  // ─── Escritas de uma nota ───────────────────────────────────────────────

  async function escrever(nota: NotaDaTela, caminho: string, init: RequestInit, sucesso: string): Promise<boolean> {
    setOcupado(nota.id);
    setErroDoDialogo(null);
    const r = await pedir<NotaDaTela>(`${BASE}/${nota.id}${caminho}`, "nota", init);
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

  const desassociar = (n: NotaDaTela) => void escrever(n, "/associar", comJson("DELETE", { empresa: empresaId }), "Associação removida.");

  async function associar(transacaoId: string) {
    if (!associando) return;
    if (await escrever(associando, "/associar", comJson("POST", { empresa: empresaId, transacaoId }), "Nota associada à transação.")) setAssociando(null);
  }

  async function cancelar() {
    if (!cancelando) return;
    if (await escrever(cancelando, "/cancelar", comJson("POST", { empresa: empresaId }), "Nota cancelada.")) setCancelando(null);
  }

  // ─── Tela ───────────────────────────────────────────────────────────────

  const dados = lista.dados;
  const total = dados?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / NOTAS_POR_PAGINA));

  return (
    <div className="relative flex flex-col gap-4" {...arrastar}>
      {sobre && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-surface/90">
          <p className="flex flex-col items-center gap-1 text-center text-sm font-medium">
            <FileUp size={28} aria-hidden className="text-brand" />
            Solte os arquivos aqui
            <span className="text-micro font-normal text-fg-muted">XML, ZIP, PDF ou imagem de notas fiscais</span>
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          NF-e e NFS-e da empresa, associadas às transações do extrato.
          {podeAgir && " Arraste arquivos .xml, .zip, .pdf ou imagem para esta área para importar."}
        </p>
        {podeAgir && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => arquivoRef.current?.click()} loading={importando} loadingLabel="Importando…">
              <Upload size={14} aria-hidden /> Importar notas
            </Button>
            <input
              ref={arquivoRef}
              type="file"
              accept={ACEITA}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Arquivos de notas fiscais"
              onChange={(e) => void importar(Array.from(e.target.files ?? []))}
            />
            <Button type="button" onClick={() => setCriando(true)}>
              <Plus size={14} aria-hidden /> Nova nota
            </Button>
          </div>
        )}
      </div>

      {importacao && (
        <Aviso tom={importacao.erros.length ? (importacao.importadas ? "atencao" : "perigo") : "sucesso"}>
          <div className="flex items-start justify-between gap-2">
            <p>
              {importacao.importadas} importada(s), {importacao.duplicadas} duplicada(s) ignorada(s)
              {importacao.erros.length ? `, ${importacao.erros.length} erro(s)` : ""}.
            </p>
            <button type="button" className="text-micro underline" onClick={() => setImportacao(null)}>
              Fechar
            </button>
          </div>
          {importacao.erros.length > 0 && (
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-micro">
              {importacao.erros.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </Aviso>
      )}

      <fieldset className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="sr-only">Filtros das notas</legend>
        <CampoForm label="Tipo" htmlFor={`${base}-tipo`}>
          <Select id={`${base}-tipo`} compact value={filtros.tipo} onChange={(e) => mudarFiltro("tipo", e.target.value)}>
            <option value="">Todos</option>
            <option value="nfe">NF-e</option>
            <option value="nfse">NFS-e</option>
          </Select>
        </CampoForm>
        <CampoForm label="Situação" htmlFor={`${base}-status`}>
          <Select id={`${base}-status`} compact value={filtros.status} onChange={(e) => mudarFiltro("status", e.target.value)}>
            <option value="">Todas</option>
            <option value="pendente">Pendente</option>
            <option value="associada">Associada</option>
            <option value="cancelada">Cancelada</option>
          </Select>
        </CampoForm>
        <CampoForm label="Número" htmlFor={`${base}-numero`}>
          <Input id={`${base}-numero`} compact value={digitados.numero} placeholder="Buscar por número" onChange={(e) => mudarFiltro("numero", e.target.value, true)} />
        </CampoForm>
        <CampoForm label="Emitente" htmlFor={`${base}-emitente`}>
          <Input id={`${base}-emitente`} compact value={digitados.emitente} placeholder="Nome do emitente" onChange={(e) => mudarFiltro("emitente", e.target.value, true)} />
        </CampoForm>
        <CampoForm label="CNPJ" htmlFor={`${base}-cnpj`}>
          <Input id={`${base}-cnpj`} compact value={digitados.cnpj} placeholder="Emitente ou destinatário" onChange={(e) => mudarFiltro("cnpj", e.target.value, true)} />
        </CampoForm>
        <CampoForm label="Chave de acesso" htmlFor={`${base}-chave`}>
          <Input id={`${base}-chave`} compact value={digitados.chave} placeholder="Trecho da chave" inputMode="numeric" onChange={(e) => mudarFiltro("chave", e.target.value, true)} />
        </CampoForm>
        <CampoForm label="Emissão de" htmlFor={`${base}-de`}>
          <CampoData id={`${base}-de`} compact value={filtros.de} onChange={(v) => mudarFiltro("de", v)} />
        </CampoForm>
        <CampoForm label="Emissão até" htmlFor={`${base}-ate`}>
          <CampoData id={`${base}-ate`} compact value={filtros.ate} min={filtros.de || undefined} onChange={(v) => mudarFiltro("ate", v)} />
        </CampoForm>
        {filtrosAtivos(digitados) && (
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="button" size="sm" variant="ghost" onClick={limpar}>
              Limpar busca
            </Button>
          </div>
        )}
      </fieldset>

      <section aria-labelledby={`${base}-titulo`} aria-busy={carregando}>
        <h2 id={`${base}-titulo`} className="mb-2 text-base font-semibold">
          Notas {total > 0 && <span className="text-sm font-normal text-fg-muted">({total} no total)</span>}
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
          <p className="text-sm text-fg-muted">{filtrosAtivos(filtros) ? "Nenhuma nota fiscal encontrada com esses filtros." : "Nenhuma nota fiscal cadastrada."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Número</th>
                  <th className="py-2 pr-3 font-medium">Emitente</th>
                  <th className="py-2 pr-3 font-medium">Emissão</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor</th>
                  <th className="py-2 pr-3 font-medium">Transação vinculada</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  {podeAgir && <th className="py-2 font-medium"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((n) => (
                  <LinhaDaNota
                    key={n.id}
                    n={n}
                    podeAgir={podeAgir}
                    ocupado={ocupado === n.id}
                    onAssociar={() => {
                      setErroDoDialogo(null);
                      setAssociando(n);
                    }}
                    onDesassociar={() => desassociar(n)}
                    onCancelar={() => {
                      setErroDoDialogo(null);
                      setCancelando(n);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {paginas > 1 && (
          <nav className="mt-3 flex items-center gap-3 text-sm" aria-label="Páginas das notas">
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

      {associando && (
        <AssociarTransacao
          empresaId={empresaId}
          nota={associando}
          ocupado={ocupado === associando.id}
          erro={erroDoDialogo}
          onEscolher={(id) => void associar(id)}
          onFechar={() => setAssociando(null)}
        />
      )}

      <ConfirmDialog
        open={!!cancelando}
        title="Cancelar nota fiscal"
        description={cancelando ? textoDoCancelamento(cancelando) : undefined}
        confirmLabel="Cancelar nota"
        cancelLabel="Voltar"
        pendingLabel="Cancelando…"
        destructive
        pending={!!cancelando && ocupado === cancelando.id}
        error={erroDoDialogo}
        onConfirm={() => void cancelar()}
        onCancel={() => setCancelando(null)}
      >
        {cancelando && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-border bg-surface-2 p-3 text-sm">
            <dt className="text-fg-muted">Nota</dt>
            <dd className="font-medium">{numeroComSerie(cancelando)}</dd>
            <dt className="text-fg-muted">Emitente</dt>
            <dd className="font-medium">{cancelando.nomeEmitente || cancelando.cnpjEmitente || "Não informado"}</dd>
            <dt className="text-fg-muted">Valor</dt>
            <dd className="font-medium">{moeda(cancelando.valor)}</dd>
          </dl>
        )}
      </ConfirmDialog>

      {criando && (
        <NovaNota
          empresaId={empresaId}
          onFechar={() => setCriando(false)}
          onCriada={() => {
            setCriando(false);
            toast.success("Nota fiscal cadastrada.");
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ─── Linha ──────────────────────────────────────────────────────────────────

function LinhaDaNota({
  n,
  podeAgir,
  ocupado,
  onAssociar,
  onDesassociar,
  onCancelar,
}: {
  n: NotaDaTela;
  podeAgir: boolean;
  ocupado: boolean;
  onAssociar: () => void;
  onDesassociar: () => void;
  onCancelar: () => void;
}) {
  const procedencia = seloDaProcedencia(n);
  const acao = acaoDaLinha(n);
  const status = ROTULO_DO_STATUS[n.status] ?? { texto: n.status, tom: "atencao" as const };
  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="py-2 pr-3">
        <span className="flex flex-wrap items-center gap-1">
          <Selo tom="neutro">{ROTULO_DO_TIPO[n.tipo] ?? n.tipo}</Selo>
          {procedencia && (
            <span title={procedencia.explicacao}>
              <Selo tom="atencao">{procedencia.texto}</Selo>
              <span className="sr-only">: {procedencia.explicacao}</span>
            </span>
          )}
        </span>
        {n.origem === "xml_nao_verificado" && n.assinaturaMotivo && <span className="mt-1 block max-w-[220px] text-micro text-fg-muted">{n.assinaturaMotivo}</span>}
      </td>
      <td className="py-2 pr-3 font-mono text-micro">{numeroComSerie(n)}</td>
      <td className="max-w-[220px] py-2 pr-3">
        <span className="block truncate" title={n.nomeEmitente ?? undefined}>
          {n.nomeEmitente ?? "—"}
        </span>
        <span className="block text-micro text-fg-muted tabular-nums">{n.cnpjEmitente}</span>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 tabular-nums">{dataDaEmissao(n.dataEmissao)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{moeda(n.valor)}</td>
      <td className="min-w-[200px] py-2 pr-3">
        {n.transacao ? (
          <span className="block">
            <span className="block max-w-[240px] truncate text-micro font-medium" title={n.transacao.historico}>
              {n.transacao.historico || "—"}
            </span>
            <span className="block whitespace-nowrap text-micro text-fg-muted">
              {dataDaTransacao(n.transacao.data)} · {n.transacao.dc === "D" ? "Débito" : "Crédito"} · {moeda(n.transacao.valor)}
            </span>
            {n.transacao.desfeita && <span className="block text-micro text-warning-fg">A importação desta transação foi desfeita.</span>}
          </span>
        ) : n.transacaoId ? (
          <span className="font-mono text-micro text-fg-muted" title={n.transacaoId}>
            ID {n.transacaoId.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-micro text-fg-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <Selo tom={status.tom}>{status.texto}</Selo>
      </td>
      {podeAgir && (
        <td className="py-2">
          <span className="flex flex-wrap items-center gap-1">
            {acao === "associar" && (
              <Button type="button" size="xs" variant="secondary" onClick={onAssociar} disabled={ocupado}>
                <Link2 size={12} aria-hidden /> Associar
              </Button>
            )}
            {acao === "desassociar" && (
              <Button type="button" size="xs" variant="secondary" onClick={onDesassociar} loading={ocupado} loadingLabel="Removendo…">
                <Unlink size={12} aria-hidden /> Remover associação
              </Button>
            )}
            {podeCancelar(n) && (
              <Button type="button" size="xs" variant="ghost" className="text-danger" onClick={onCancelar} disabled={ocupado}>
                <XCircle size={12} aria-hidden /> Cancelar
              </Button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

// ─── Associar ───────────────────────────────────────────────────────────────

function AssociarTransacao({
  empresaId,
  nota,
  ocupado,
  erro,
  onEscolher,
  onFechar,
}: {
  empresaId: string;
  nota: NotaDaTela;
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
    <Modal open onClose={onFechar} title="Associar transação" maxWidth="max-w-lg">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Escolha a transação pendente que corresponde à nota {numeroComSerie(nota)} ({moeda(nota.valor)}).
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
                    {dataDaTransacao(t.data)} · {t.dc === "D" ? "Débito" : "Crédito"} · {moeda(t.valor)}
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

// ─── Nova nota (cadastro à mão) ─────────────────────────────────────────────

function NovaNota({ empresaId, onFechar, onCriada }: { empresaId: string; onFechar: () => void; onCriada: () => void }) {
  const base = useId();
  const [tipo, setTipo] = useState("nfe");
  const [data, setData] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const texto = (nome: string) => String(f.get(nome) ?? "").trim();
    if (!texto("numero")) return setErro("Informe o número da nota.");
    if (!texto("cnpjEmitente")) return setErro("Informe o CNPJ do emitente.");
    if (!texto("valor")) return setErro("Informe o valor da nota.");
    if (!data) return setErro("Informe a data de emissão.");
    // Os opcionais vazios não vão: vazio não é "informado" (a chave vazia falharia nos 44 dígitos).
    const opcional = (nome: string) => (texto(nome) ? { [nome]: texto(nome) } : {});
    setErro(null);
    setEnviando(true);
    const r = await pedir<NotaDaTela>(
      BASE,
      "nota",
      comJson("POST", {
        empresa: empresaId,
        tipo,
        numero: texto("numero"),
        cnpjEmitente: texto("cnpjEmitente"),
        valor: valorDigitado(texto("valor")),
        // Meia-noite UTC, como o original: a identidade da NFS-e cadastrada à mão depende disso.
        dataEmissao: emissaoDigitada(data),
        ...opcional("serie"),
        ...opcional("nomeEmitente"),
        ...opcional("chaveAcesso"),
        ...opcional("observacao"),
      }),
    );
    setEnviando(false);
    if (!r.ok) return setErro(r.erro);
    onCriada();
  }

  return (
    <Modal open onClose={onFechar} title="Nova nota fiscal" maxWidth="max-w-lg">
      <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoForm label="Tipo" htmlFor={`${base}-tipo`} required>
            <Select id={`${base}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="nfe">NF-e (produto)</option>
              <option value="nfse">NFS-e (serviço)</option>
            </Select>
          </CampoForm>
          <CampoForm label="Número" htmlFor={`${base}-numero`} required>
            <Input id={`${base}-numero`} name="numero" maxLength={50} placeholder="000001" />
          </CampoForm>
          <CampoForm label="Série" htmlFor={`${base}-serie`}>
            <Input id={`${base}-serie`} name="serie" maxLength={10} placeholder="1" />
          </CampoForm>
          <CampoForm label="Data de emissão" htmlFor={`${base}-data`} required>
            <CampoData id={`${base}-data`} value={data} onChange={setData} required />
          </CampoForm>
          <CampoForm label="CNPJ do emitente" htmlFor={`${base}-cnpj`} required className="sm:col-span-2">
            <Input id={`${base}-cnpj`} name="cnpjEmitente" inputMode="numeric" placeholder="00.000.000/0000-00" />
          </CampoForm>
          <CampoForm label="Nome do emitente" htmlFor={`${base}-nome`} className="sm:col-span-2">
            <Input id={`${base}-nome`} name="nomeEmitente" maxLength={300} />
          </CampoForm>
          <CampoForm label="Valor" htmlFor={`${base}-valor`} required>
            <Input id={`${base}-valor`} name="valor" inputMode="decimal" prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Chave de acesso" htmlFor={`${base}-chave`}>
            <Input id={`${base}-chave`} name="chaveAcesso" inputMode="numeric" placeholder="44 dígitos" />
          </CampoForm>
          <CampoForm label="Observação" htmlFor={`${base}-obs`} className="sm:col-span-2">
            <Input id={`${base}-obs`} name="observacao" maxLength={500} />
          </CampoForm>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando} loadingLabel="Salvando…">
            Cadastrar nota
          </Button>
        </div>
      </form>
    </Modal>
  );
}
