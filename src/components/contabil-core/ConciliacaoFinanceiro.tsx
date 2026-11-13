"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Download, FolderOpen, Pencil, Trash2, Upload } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { formatInstantDateTime } from "@/lib/format";
import { dataBr, plural } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import {
  ANALISES_POR_PAGINA,
  COMPARACOES_POR_BASE,
  NOMES_DAS_FONTES,
  PARES_DE_COMPARACAO,
  TITULO_PADRAO,
  documentoDaOrigem,
  enviarEmSequencia,
  pendenciasDoEnvio,
  validarInicio,
  type BaseFinanceiro,
  type DocumentoParaEnviar,
} from "@/lib/contabil-core/conciliacao/telaDoFinanceiro";
import type {
  AnaliseFinanceiro,
  CodigoErroFinanceiro,
  FonteFinanceiro,
  ListaAnalisesFinanceiro,
  NovaAnaliseFinanceiro,
  NovoVinculoFinanceiro,
  ResumoAnaliseFinanceiro,
  SugestoesEmLote,
  TipoComparacao,
  VinculoFinanceiro,
} from "@/lib/contabil-core/conciliacao/financeiroTipos";
import { EditorDoFinanceiro } from "./EditorDoFinanceiro";
import { VinculosDoFinanceiro } from "./VinculosDoFinanceiro";
import { TitulosAbertos } from "./TitulosAbertos";

// A conferência do financeiro (Bloco B, Fase B4, 12/11/2026): porte do `FinanceiroTab.tsx` e do
// `AcoesAnaliseSalva.tsx` do Contábil Core. Compara os relatórios do financeiro da empresa com o
// extrato já importado, o SISPAG ou o Razão da conta banco — ou o Razão com o extrato detalhado Itaú e
// o SISPAG — e registra a decisão de quem confere. Nenhum lançamento, saldo, regra ou NEO muda.
//
// A tela tem duas partes, como o original: o cartão de entrada (conta, período e documentos; depois de
// aberta a análise, os documentos novos e os arquivos já enviados) e, sem análise aberta, as análises
// salvas (abrir, renomear, excluir). Com a análise aberta, os dois painéis (`EditorDoFinanceiro`) e as
// conferências registradas (`VinculosDoFinanceiro`).
//
// Quem só consulta o módulo abre as análises, filtra os painéis e baixa os originais, sem os botões de
// alterar. Toda alteração leva a versão; conflito (409) recarrega a análise sem repetir a gravação.

const BASE = "/api/contabil-core/conciliacao/financeiro";

type Falha = { ok: false; erro: string; codigo?: CodigoErroFinanceiro; status: number };
type Resultado<T> = { ok: true; valor: T } | Falha;

async function pedir(url: string, init?: RequestInit): Promise<Resultado<Record<string, unknown>>> {
  const resp = await fetch(url, init).catch(() => null);
  const corpo = (await resp?.json().catch(() => null)) as Record<string, unknown> | null;
  if (!resp?.ok || !corpo) {
    const erro = typeof corpo?.error === "string" ? corpo.error : "Não deu para falar com o servidor. Tente de novo.";
    return { ok: false, erro, codigo: corpo?.codigo as CodigoErroFinanceiro | undefined, status: resp?.status ?? 0 };
  }
  return { ok: true, valor: corpo };
}

const comJson = (method: string, corpo: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

async function pedirAnalise(url: string, init?: RequestInit): Promise<Resultado<AnaliseFinanceiro>> {
  const r = await pedir(url, init);
  if (!r.ok) return r;
  const analise = r.valor.analise as AnaliseFinanceiro | undefined;
  return analise ? { ok: true, valor: analise } : { ok: false, erro: "Resposta inesperada do servidor. Tente de novo.", status: 500 };
}

const consulta = (empresaId: string, extra: Record<string, string> = {}) => new URLSearchParams({ empresa: empresaId, ...extra });

const api = {
  listar: async (empresaId: string, pagina: number): Promise<Resultado<ListaAnalisesFinanceiro>> => {
    const r = await pedir(`${BASE}?${consulta(empresaId, { pagina: String(pagina), porPagina: String(ANALISES_POR_PAGINA) })}`, { cache: "no-store" });
    if (!r.ok) return r;
    const lista = r.valor.lista as ListaAnalisesFinanceiro | undefined;
    return lista ? { ok: true, valor: lista } : { ok: false, erro: "Resposta inesperada do servidor.", status: 500 };
  },
  abrir: (empresaId: string, id: string) => pedirAnalise(`${BASE}/${id}?${consulta(empresaId)}`, { cache: "no-store" }),
  criar: (empresaId: string, nova: NovaAnaliseFinanceiro) => pedirAnalise(BASE, comJson("POST", { empresa: empresaId, ...nova })),
  documento: (empresaId: string, analise: AnaliseFinanceiro, doc: DocumentoParaEnviar, confirmarEmpresa: boolean) => {
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("versao", String(analise.versao));
    form.set("tipo", doc.tipo);
    form.set("arquivo", doc.arquivo);
    if (confirmarEmpresa) form.set("confirmarEmpresa", "true");
    return pedirAnalise(`${BASE}/${analise.id}/documentos`, { method: "POST", body: form });
  },
  vincular: (empresaId: string, id: string, vinculo: NovoVinculoFinanceiro) => pedirAnalise(`${BASE}/${id}/vinculos`, comJson("POST", { empresa: empresaId, ...vinculo })),
  vincularSugestoes: (empresaId: string, id: string, lote: SugestoesEmLote) =>
    pedirAnalise(`${BASE}/${id}/vinculos/sugestoes`, comJson("POST", { empresa: empresaId, ...lote })),
  desfazer: (empresaId: string, id: string, vinculoId: string, versao: number, motivo: string) =>
    pedirAnalise(`${BASE}/${id}/vinculos/${vinculoId}/desfazer`, comJson("POST", { empresa: empresaId, versao, motivo })),
  renomear: (empresaId: string, id: string, versao: number, titulo: string) => pedir(`${BASE}/${id}`, comJson("PATCH", { empresa: empresaId, versao, titulo })),
  excluir: (empresaId: string, id: string, versao: number) => pedir(`${BASE}/${id}`, comJson("DELETE", { empresa: empresaId, versao })),
  original: async (empresaId: string, id: string, fonteId: string): Promise<Resultado<Blob>> => {
    const resp = await fetch(`${BASE}/${id}/documentos/${fonteId}/arquivo?${consulta(empresaId)}`, { cache: "no-store" }).catch(() => null);
    if (resp?.ok) return { ok: true, valor: await resp.blob() };
    const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, erro: corpo?.error ?? "Não deu para baixar o arquivo. Tente de novo.", status: resp?.status ?? 0 };
  },
};

const ACEITA_PLANILHA_OU_PDF = ".xlsx,.XLSX,.xls,.XLS,.pdf,.PDF,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ACEITA_PLANILHA = ".xlsx,.XLSX,.xls,.XLS,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type EstadoDaLista = { carregando: boolean; erro: string | null; dados: ListaAnalisesFinanceiro | null };

type Props = { empresaId: string; agencias: Opcao[]; podeAgir: boolean };

export function ConciliacaoFinanceiro({ empresaId, agencias, podeAgir }: Props) {
  const base = useId();
  const toast = useToast();
  const montado = useRef(true);
  // A análise aberta agora: a resposta de uma operação sobre outra análise (a pessoa voltou à lista ou
  // abriu outra enquanto o servidor respondia) é descartada.
  const aberta = useRef<string | null>(null);
  const emCurso = useRef(false);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const [agenciaId, setAgenciaId] = useState(agencias.length === 1 ? agencias[0].value : "");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tentouIniciar, setTentouIniciar] = useState(false);
  const [analise, setAnalise] = useState<AnaliseFinanceiro | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [situacao, setSituacao] = useState("");

  const [compararCom, setCompararCom] = useState<TipoComparacao>("EXTRATO");
  const { base: documentoBase, origem } = PARES_DE_COMPARACAO[compararCom];
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [arquivoDaOrigem, setArquivoDaOrigem] = useState<File | null>(null);
  const [confirmarEmpresa, setConfirmarEmpresa] = useState(false);
  const [erroDocumentos, setErroDocumentos] = useState<string | null>(null);
  // Os campos de arquivo são recriados (vazios) quando a escolha é limpa.
  const [geracaoDosArquivos, setGeracaoDosArquivos] = useState(0);

  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [lista, setLista] = useState<EstadoDaLista>({ carregando: true, erro: null, dados: null });

  useEffect(() => {
    let vale = true;
    void api.listar(empresaId, pagina).then((r) => {
      if (!vale) return;
      setLista(r.ok ? { carregando: false, erro: null, dados: r.valor } : { carregando: false, erro: r.erro, dados: null });
    });
    return () => {
      vale = false;
    };
  }, [empresaId, pagina, recarga]);

  const recarregarLista = useCallback(() => {
    setLista((l) => ({ ...l, carregando: true, erro: null }));
    setRecarga((n) => n + 1);
  }, []);

  function mostrar(a: AnaliseFinanceiro | null) {
    aberta.current = a?.id ?? null;
    setAnalise(a);
  }

  function limparArquivos() {
    setArquivos([]);
    setArquivoDaOrigem(null);
    setConfirmarEmpresa(false);
    setErroDocumentos(null);
    setGeracaoDosArquivos((n) => n + 1);
  }

  /** Roda uma alteração com a tela travada; `null` quando outra já está em curso. */
  async function enquanto<T>(acao: () => Promise<T>): Promise<T | null> {
    if (emCurso.current) return null;
    emCurso.current = true;
    setOcupado(true);
    try {
      return await acao();
    } finally {
      emCurso.current = false;
      if (montado.current) setOcupado(false);
    }
  }

  /** Recusa do servidor: avisa e, se foi conflito, recarrega a análise aberta (sem repetir a gravação). */
  async function tratarErro(f: Falha, titulo: string, analiseId: string | null) {
    if (!montado.current) return;
    toast.error(`${titulo}: ${f.erro}`);
    setSituacao(`${titulo}: ${f.erro}`);
    if (f.status !== 409 || !analiseId || aberta.current !== analiseId) return;
    const r = await api.abrir(empresaId, analiseId);
    if (!montado.current || aberta.current !== analiseId) return;
    if (!r.ok) return toast.error(`Não deu para atualizar a análise: ${r.erro}`);
    mostrar(r.valor);
    setSituacao("Análise atualizada. Confira as seleções de novo antes de registrar.");
    toast.show("Análise atualizada. Confira as seleções de novo antes de registrar.");
  }

  /** Uma alteração na análise aberta que devolve a análise nova. */
  async function alterar(acao: (a: AnaliseFinanceiro) => Promise<Resultado<AnaliseFinanceiro>>, sucesso: string, falha: string) {
    const atual = analise;
    if (!atual) return;
    const r = await enquanto(() => acao(atual));
    if (!r || !montado.current || aberta.current !== atual.id) return;
    if (!r.ok) return tratarErro(r, falha, atual.id);
    mostrar(r.valor);
    recarregarLista();
    setSituacao(sucesso);
    toast.success(sucesso);
  }

  /**
   * Envia os documentos escolhidos, um por vez, cada um com a versão que o anterior devolveu. Na falha,
   * o que já foi enviado fica na análise e sai da escolha; os pendentes continuam escolhidos.
   */
  async function enviarDocumentos(inicial: AnaliseFinanceiro): Promise<AnaliseFinanceiro> {
    setErroDocumentos(null);
    const documentos: DocumentoParaEnviar[] = arquivos.map((arquivo) => ({ tipo: documentoBase, arquivo }));
    const daOrigem = documentoDaOrigem(origem);
    if (arquivoDaOrigem && daOrigem) documentos.push({ tipo: daOrigem, arquivo: arquivoDaOrigem });
    const r = await enviarEmSequencia(inicial, documentos, async (a, d) => {
      const resp = await api.documento(empresaId, a, d, confirmarEmpresa);
      return resp.ok ? resp : { ok: false as const, erro: resp };
    });
    if (!montado.current) return r.analise;
    const enviados = new Set(r.enviados.map((d) => d.arquivo));
    setArquivos((pendentes) => pendentes.filter((f) => !enviados.has(f)));
    if (arquivoDaOrigem && enviados.has(arquivoDaOrigem)) setArquivoDaOrigem(null);
    if (!r.erro) {
      setConfirmarEmpresa(false);
      setGeracaoDosArquivos((n) => n + 1);
      return r.analise;
    }
    setErroDocumentos(r.erro.erro);
    // Conflito: outra pessoa alterou a análise. Recarrega para mostrar o estado verdadeiro.
    if (r.erro.status === 409) {
      const atual = await api.abrir(empresaId, r.analise.id);
      if (atual.ok) return atual.valor;
    }
    return r.analise;
  }

  async function iniciar() {
    setTentouIniciar(true);
    if (errosDoInicio.length > 0) {
      setSituacao(errosDoInicio.join(" "));
      return;
    }
    const r = await enquanto(async () => {
      const criada = await api.criar(empresaId, { agenciaId, periodoInicio: inicio, periodoFim: fim, titulo: titulo.trim() || TITULO_PADRAO });
      if (!criada.ok) return criada;
      mostrar(criada.valor);
      return { ok: true as const, valor: await enviarDocumentos(criada.valor) };
    });
    if (!r || !montado.current) return;
    if (!r.ok) return tratarErro(r, "Não deu para abrir a análise", null);
    mostrar(r.valor);
    setTentouIniciar(false);
    recarregarLista();
    setSituacao("Análise aberta para conferência.");
    toast.success("Análise aberta para conferência.");
  }

  async function adicionarDocumentos() {
    if (!analise) return;
    const atual = analise;
    const r = await enquanto(() => enviarDocumentos(atual));
    if (!r || !montado.current || aberta.current !== atual.id) return;
    mostrar(r);
    recarregarLista();
    if (r.versao !== atual.versao) {
      setSituacao("Análise atualizada com os documentos.");
      toast.success("Análise atualizada com os documentos.");
    }
  }

  async function abrirSalva(item: ResumoAnaliseFinanceiro) {
    const r = await enquanto(() => api.abrir(empresaId, item.id));
    if (!r || !montado.current) return;
    if (!r.ok) {
      if (r.status === 404) recarregarLista();
      return toast.error(`Não deu para abrir a análise: ${r.erro}`);
    }
    limparArquivos();
    mostrar(r.valor);
    setSituacao(`Análise ${r.valor.titulo} aberta.`);
  }

  function voltar() {
    mostrar(null);
    limparArquivos();
    setSituacao("De volta às análises salvas.");
  }

  async function baixar(fonte: FonteFinanceiro) {
    if (!analise) return;
    const atual = analise.id;
    const r = await enquanto(() => api.original(empresaId, atual, fonte.id));
    if (!r || !montado.current || aberta.current !== atual) return;
    if (!r.ok) return toast.error(`Não deu para baixar o documento: ${r.erro}`);
    const url = URL.createObjectURL(r.valor);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = fonte.nomeArquivo || "documento";
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function trocarComparacao(tipo: TipoComparacao) {
    // Arquivos escolhidos para o outro documento base não podem ir com outro tipo.
    if (PARES_DE_COMPARACAO[tipo].base !== documentoBase) setArquivos([]);
    setCompararCom(tipo);
    setArquivoDaOrigem(null);
    setConfirmarEmpresa(false);
    setGeracaoDosArquivos((n) => n + 1);
  }

  const trocarBase = (nova: BaseFinanceiro) => {
    if (nova !== documentoBase) trocarComparacao(COMPARACOES_POR_BASE[nova][0]);
  };

  const pendenciasDosArquivos = pendenciasDoEnvio({
    base: documentoBase,
    origem,
    arquivos: arquivos.length,
    temArquivoDaOrigem: !!arquivoDaOrigem,
    confirmouEmpresa: confirmarEmpresa,
  });
  const errosDoInicio = [...validarInicio(agenciaId, inicio, fim), ...pendenciasDosArquivos];
  const temArquivo = arquivos.length > 0 || !!arquivoDaOrigem;
  const dados = lista.dados;
  const movimentosDoExtrato = analise ? analise.linhas.filter((l) => l.tipoFonte === "EXTRATO").length : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" aria-labelledby={`${base}-titulo`}>
        <div>
          <h2 id={`${base}-titulo`} className="text-base font-semibold">
            Conciliação do financeiro
          </h2>
          <p className="text-sm text-fg-muted">
            Compare os documentos do financeiro com o extrato, o SISPAG ou o Razão — ou o Razão com o extrato detalhado e o SISPAG — sem alterar
            lançamentos, saldos ou o NEO.
          </p>
        </div>

        {analise ? (
          <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="break-words font-medium">{analise.titulo}</p>
              <p className="text-fg-muted break-words">
                {analise.contaBancaria} · {dataBr(analise.periodoInicio)} a {dataBr(analise.periodoFim)}
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={voltar}>
              <ArrowLeft size={14} aria-hidden /> Voltar às análises
            </Button>
          </div>
        ) : podeAgir ? (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 md:grid-cols-3 md:items-start">
              <CampoForm label="Conta bancária" htmlFor={`${base}-agencia`} required>
                <SearchableSelect id={`${base}-agencia`} name="agencia" options={agencias} defaultValue={agenciaId} onChange={setAgenciaId} placeholder="Escolha a conta" />
              </CampoForm>
              <CampoForm label="De" htmlFor={`${base}-inicio`} required>
                <CampoData id={`${base}-inicio`} value={inicio} onChange={setInicio} disabled={ocupado} required />
              </CampoForm>
              <CampoForm label="Até" htmlFor={`${base}-fim`} required>
                <CampoData id={`${base}-fim`} value={fim} min={inicio || undefined} onChange={setFim} disabled={ocupado} required />
              </CampoForm>
            </div>
            <p className="text-micro text-fg-muted">Conta e período são obrigatórios: o período não é presumido pelo arquivo.</p>
          </div>
        ) : (
          <Aviso tom="info">Abrir uma análise e registrar conferências é de quem opera o Contábil Core. Abra uma análise salva para consultar.</Aviso>
        )}

        {podeAgir && (
          <section className="flex flex-col gap-3" aria-label="Documentos da conferência">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
                <RadioGroup<BaseFinanceiro>
                  variante="linha"
                  legenda="Documento base"
                  valor={documentoBase}
                  onChange={trocarBase}
                  disabled={ocupado}
                  opcoes={[
                    { valor: "FINANCEIRO", rotulo: "Documentos do financeiro" },
                    { valor: "RAZAO", rotulo: NOMES_DAS_FONTES.RAZAO },
                  ]}
                />
                <CampoForm
                  label={documentoBase === "RAZAO" ? "Razão da conta banco" : "Documentos do financeiro"}
                  htmlFor={`${base}-arquivos`}
                  helper={
                    documentoBase === "RAZAO"
                      ? "Razão de uma única conta bancária, em planilha ou PDF. Não é preciso enviar documentos do financeiro."
                      : "Pagamentos e recebimentos podem ser escolhidos juntos (Excel ou PDF)."
                  }
                >
                  <input
                    key={`base-${geracaoDosArquivos}-${documentoBase}`}
                    id={`${base}-arquivos`}
                    type="file"
                    multiple={documentoBase === "FINANCEIRO"}
                    accept={ACEITA_PLANILHA_OU_PDF}
                    className="block w-full text-sm"
                    disabled={ocupado}
                    onChange={(e) => {
                      setArquivos(Array.from(e.target.files ?? []));
                      setConfirmarEmpresa(false);
                    }}
                  />
                </CampoForm>
                {arquivos.length > 1 && (
                  <ul className="flex flex-col gap-0.5 text-micro text-fg-muted">
                    {arquivos.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="break-words">
                        {f.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
                <RadioGroup<TipoComparacao>
                  variante="linha"
                  legenda="Comparar com"
                  valor={compararCom}
                  onChange={trocarComparacao}
                  disabled={ocupado}
                  opcoes={COMPARACOES_POR_BASE[documentoBase].map((tipo) => ({ valor: tipo, rotulo: NOMES_DAS_FONTES[PARES_DE_COMPARACAO[tipo].origem] }))}
                />
                {origem === "EXTRATO" ? (
                  <p className="text-micro text-fg-muted">
                    Usa o extrato já importado da conta e do período. Não é preciso anexá-lo de novo.
                    {analise ? ` ${plural(movimentosDoExtrato, "movimento", "movimentos")} nesta análise.` : ""}
                  </p>
                ) : (
                  <CampoForm
                    label={`Arquivo de ${NOMES_DAS_FONTES[origem]}`}
                    htmlFor={`${base}-origem`}
                    helper={
                      origem === "EXTRATO_DETALHADO"
                        ? "Extrato do Itaú com Razão Social e CPF/CNPJ em cada linha. É lido inteiro e recusado se algum saldo diário não fechar."
                        : origem === "SISPAG"
                          ? "Consulta de pagamentos do Itaú (Excel). Só os pagamentos efetuados entram."
                          : "Razão só da conta banco (Excel ou PDF): débito é entrada, crédito é saída."
                    }
                  >
                    <input
                      key={`origem-${geracaoDosArquivos}-${origem}`}
                      id={`${base}-origem`}
                      type="file"
                      accept={origem === "RAZAO" ? ACEITA_PLANILHA_OU_PDF : ACEITA_PLANILHA}
                      className="block w-full text-sm"
                      disabled={ocupado}
                      onChange={(e) => {
                        setArquivoDaOrigem(e.target.files?.[0] ?? null);
                        setConfirmarEmpresa(false);
                      }}
                    />
                  </CampoForm>
                )}
                {analise && documentoBase === "RAZAO" && origem !== "EXTRATO" && analise.linhas.some((l) => l.tipoFonte === origem) && (
                  <p className="text-micro text-fg-muted">Esta análise já tem {NOMES_DAS_FONTES[origem]}; envie outro só se for de outro documento.</p>
                )}
              </div>
            </div>

            {temArquivo && (
              <div className="rounded-md border border-warning/40 bg-warning/8 p-3">
                <Checkbox
                  id={`${base}-empresa`}
                  checked={confirmarEmpresa}
                  disabled={ocupado}
                  onChange={(e) => setConfirmarEmpresa(e.target.checked)}
                  label="Confirmo que os arquivos pertencem à empresa selecionada."
                  helper="Arquivo com CNPJ de outra empresa é recusado mesmo com a confirmação."
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {analise ? (
                <Button type="button" disabled={!temArquivo || !confirmarEmpresa} loading={ocupado} loadingLabel="Enviando…" onClick={() => void adicionarDocumentos()}>
                  <Upload size={14} aria-hidden /> Adicionar documentos
                </Button>
              ) : (
                <Button type="button" loading={ocupado} loadingLabel="Enviando…" onClick={() => void iniciar()}>
                  <FolderOpen size={14} aria-hidden /> Enviar e iniciar conferência
                </Button>
              )}
            </div>
            {!analise && tentouIniciar && errosDoInicio.length > 0 && (
              <ul role="alert" className="flex list-disc flex-col gap-1 pl-5 text-helper text-danger">
                {errosDoInicio.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {erroDocumentos && (
              <Aviso>
                {erroDocumentos} Os documentos já enviados ficaram na análise; confira os pendentes antes de tentar de novo.
              </Aviso>
            )}

            <div className="rounded-md border border-border p-3">
              <Accordion classeDoCabecalho="text-sm font-medium" titulo="Opções e orientações">
                <div className="mt-3 flex flex-col gap-2 text-micro text-fg-muted">
                  {!analise && (
                    <CampoForm label="Nome da análise (opcional)" htmlFor={`${base}-nome`}>
                      <Input id={`${base}-nome`} maxLength={200} value={titulo} disabled={ocupado} placeholder={TITULO_PADRAO} onChange={(e) => setTitulo(e.target.value)} />
                    </CampoForm>
                  )}
                  <p>Financeiro: pagamentos e recebimentos em Excel ou PDF no modelo reconhecido. Dá para pôr vários arquivos na mesma análise. Categorias não criam regras contábeis.</p>
                  <p>SISPAG: consulta de pagamentos do Itaú. Razão: só a conta banco; débitos são entradas e créditos são saídas.</p>
                  <p>
                    Razão × extrato detalhado ou SISPAG: escolha “Razão da conta banco” como documento base. As sugestões procuram o favorecido no histórico
                    do Razão e somam os pagamentos de um lote lançado numa linha só.
                  </p>
                  <p>Extrato detalhado Itaú: planilha com Data, Lançamento, Razão Social, CPF/CNPJ, Valor e Saldo. Não é a consulta do SISPAG; envie cada um no seu campo.</p>
                  <p>Arquivo sem banco identificado não é atribuído à conta. O CNPJ/CPF dos fornecedores não identifica a empresa emissora. Datas fora do período pedem justificativa.</p>
                  <p>Só a relação entre os documentos é registrada. Lançamentos, saldos, NEO e as outras conciliações ficam como estão.</p>
                </div>
              </Accordion>
            </div>
          </section>
        )}

        {analise && (
          <div className="rounded-md border border-border p-3">
            <Accordion classeDoCabecalho="text-sm font-medium" titulo={`Arquivos da análise (${analise.fontes.length})`}>
              <ul className="mt-3 flex flex-col gap-2">
                {analise.fontes.map((f) => (
                  <li key={f.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 break-words">
                        <Selo tom="neutro">{NOMES_DAS_FONTES[f.tipo]}</Selo>
                        <span className="break-words">{f.nomeArquivo}</span>
                      </p>
                      <p className="text-micro text-fg-muted">Banco: {f.banco || "Não informado"}</p>
                    </div>
                    {f.temOriginal && (
                      <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => void baixar(f)} aria-label={`Baixar o original de ${f.nomeArquivo}`}>
                        <Download size={14} aria-hidden /> Baixar original
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Accordion>
          </div>
        )}
        {analise && analise.fontes.some((f) => f.avisos.length > 0) && (
          <Aviso tom="atencao">
            <ul className="list-disc pl-4">
              {analise.fontes.flatMap((f) =>
                f.avisos.map((a, i) => (
                  <li key={`${f.id}-${i}`} className="break-words">
                    {f.nomeArquivo}: {a}
                  </li>
                )),
              )}
            </ul>
          </Aviso>
        )}
      </section>

      <p aria-live="polite" className="sr-only">
        {situacao}
      </p>

      {analise && (
        <>
          {analise.avisos.length > 0 && (
            <Aviso tom="atencao">
              <ul className="list-disc pl-4">
                {analise.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {!podeAgir && <Aviso tom="info">Só consulta: registrar ou desfazer conferência é de quem opera o Contábil Core.</Aviso>}
          <TitulosAbertos key={`titulos-${analise.id}`} linhas={analise.titulosAbertos} />
          <EditorDoFinanceiro
            key={analise.id}
            analise={analise}
            comparacao={compararCom}
            onComparacao={trocarComparacao}
            ocupado={ocupado}
            podeAgir={podeAgir}
            empresaId={empresaId}
            onRegistrar={(v) =>
              void alterar((a) => api.vincular(empresaId, a.id, v), "Conferência registrada.", "Não deu para registrar a conferência")
            }
            onRegistrarSugestoes={(lote) =>
              void alterar(
                (a) => api.vincularSugestoes(empresaId, a.id, lote),
                lote.sugestoes.length > 1 ? `${lote.sugestoes.length} sugestões conferidas registradas.` : "Conferência registrada.",
                "Não deu para registrar as sugestões",
              )
            }
          />
          <VinculosDoFinanceiro
            key={`vinculos-${analise.id}`}
            analise={analise}
            ocupado={ocupado}
            podeDesfazer={podeAgir}
            onDesfazer={(v: VinculoFinanceiro, motivo: string) =>
              void alterar(
                (a) => api.desfazer(empresaId, a.id, v.id, a.versao, motivo),
                "Conferência desfeita. O registro e o motivo continuam no histórico.",
                "Não deu para desfazer a conferência",
              )
            }
          />
        </>
      )}

      {!analise && (
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby={`${base}-salvas`}>
          <div>
            <h2 id={`${base}-salvas`} className="flex items-center gap-2 text-base font-semibold">
              <FolderOpen size={16} aria-hidden /> Análises salvas
            </h2>
            <p className="text-sm text-fg-muted">Reabra uma conferência anterior desta empresa, sem reenviar os arquivos.</p>
          </div>
          {lista.carregando && !dados && <p className="text-sm text-fg-muted">Carregando as análises…</p>}
          {lista.erro && (
            <div className="flex flex-wrap items-center gap-2">
              <Aviso>Não deu para consultar as análises salvas. {lista.erro}</Aviso>
              <Button type="button" size="sm" variant="secondary" onClick={recarregarLista}>
                Tentar de novo
              </Button>
            </div>
          )}
          {dados && dados.itens.length === 0 && <p className="text-sm text-fg-muted">Nenhuma análise salva para esta empresa.</p>}
          {dados && dados.itens.length > 0 && (
            <ul className="flex flex-col gap-2" aria-busy={lista.carregando}>
              {dados.itens.map((item) => (
                <AnaliseSalva
                  key={item.id}
                  item={item}
                  empresaId={empresaId}
                  podeAgir={podeAgir}
                  ocupado={ocupado}
                  onAbrir={() => void abrirSalva(item)}
                  onMudou={recarregarLista}
                />
              ))}
            </ul>
          )}
          {dados && dados.total > dados.porPagina && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
              <span>
                {plural(dados.total, "análise", "análises")} · Página {dados.pagina} de {Math.ceil(dados.total / dados.porPagina)}
              </span>
              <div className="flex gap-1" role="group" aria-label="Páginas das análises salvas">
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={pagina === 1 || lista.carregando || ocupado}
                  onClick={() => {
                    setLista((l) => ({ ...l, carregando: true, erro: null }));
                    setPagina(pagina - 1);
                  }}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  disabled={pagina * dados.porPagina >= dados.total || lista.carregando || ocupado}
                  onClick={() => {
                    setLista((l) => ({ ...l, carregando: true, erro: null }));
                    setPagina(pagina + 1);
                  }}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ─── Uma análise salva: abrir, renomear e excluir ─────────────────────────

function AnaliseSalva({
  item,
  empresaId,
  podeAgir,
  ocupado,
  onAbrir,
  onMudou,
}: {
  item: ResumoAnaliseFinanceiro;
  empresaId: string;
  podeAgir: boolean;
  ocupado: boolean;
  onAbrir: () => void;
  /** Renomeada, excluída ou recusada (versão velha, já excluída): a lista recarrega. */
  onMudou: () => void;
}) {
  const base = useId();
  const nome = item.titulo.trim() || TITULO_PADRAO;
  const [modo, setModo] = useState<"renomear" | "excluir" | null>(null);
  const [titulo, setTitulo] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrirModo(m: "renomear" | "excluir") {
    setModo(m);
    setTitulo(nome);
    setErro(null);
  }

  async function confirmar() {
    if (salvando || !modo) return;
    if (modo === "renomear" && !titulo.trim()) return setErro("Informe um nome para a análise.");
    setSalvando(true);
    setErro(null);
    const r = modo === "renomear" ? await api.renomear(empresaId, item.id, item.versao, titulo.trim()) : await api.excluir(empresaId, item.id, item.versao);
    setSalvando(false);
    if (!r.ok) {
      setErro(r.erro);
      if (r.status === 409 || r.status === 404) onMudou();
      return;
    }
    setModo(null);
    onMudou();
  }

  const bloqueado = ocupado || salvando;
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="break-words font-medium">{nome}</p>
        <p className="text-micro text-fg-muted break-words">
          {item.contaBancaria} · {dataBr(item.periodoInicio)} a {dataBr(item.periodoFim)}
        </p>
        <p className="text-micro text-fg-muted">Atualizada em {formatInstantDateTime(new Date(item.atualizadaEm))}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="secondary" disabled={bloqueado} onClick={onAbrir} aria-label={`Abrir a análise ${nome}`}>
          Abrir
        </Button>
        {podeAgir && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={bloqueado} onClick={() => abrirModo("renomear")} aria-label={`Renomear a análise ${nome}`}>
              <Pencil size={14} aria-hidden /> Renomear
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={bloqueado}
              onClick={() => abrirModo("excluir")}
              aria-label={`Excluir a análise ${nome}`}
            >
              <Trash2 size={14} aria-hidden /> Excluir
            </Button>
          </>
        )}
      </div>

      <Modal open={modo === "renomear"} onClose={() => !salvando && setModo(null)} title="Renomear a análise">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmar();
          }}
        >
          <p className="text-sm text-fg-muted">Muda só o nome. Banco, período, arquivos e conferências ficam como estão; para corrigir uma conferência, desfaça-a com o motivo.</p>
          <CampoForm label="Nome" htmlFor={`${base}-nome`} required error={erro ?? undefined}>
            <Input id={`${base}-nome`} value={titulo} maxLength={200} disabled={salvando} autoFocus onChange={(e) => setTitulo(e.target.value)} />
          </CampoForm>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" disabled={salvando} onClick={() => setModo(null)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!titulo.trim()} loading={salvando} loadingLabel="Salvando…">
              Salvar nome
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={modo === "excluir"}
        title="Excluir a análise salva?"
        description="Ela sai da lista. Os arquivos, as conferências e o histórico ficam guardados, e nenhum lançamento, saldo ou classificação muda."
        confirmLabel="Excluir análise"
        pendingLabel="Excluindo…"
        destructive
        pending={salvando}
        error={erro}
        onConfirm={() => void confirmar()}
        onCancel={() => setModo(null)}
      >
        <p className="text-sm break-words font-medium">{nome}</p>
      </ConfirmDialog>
    </li>
  );
}
