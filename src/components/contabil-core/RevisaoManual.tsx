"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FolderOpen, Pencil, Trash2, Upload } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { formatInstantDateTime } from "@/lib/format";
import { dataBr, type SomasDoGrupo } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import { nomeDaRevisao } from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import type {
  CodigoErroRevisao,
  DesfazerVinculo,
  ListaRevisoes,
  NovoVinculo,
  ResumoRevisao,
  Revisao,
  VinculoRevisao,
} from "@/lib/contabil-core/conciliacao/revisaoTipos";
import { EditorDaRevisao } from "./EditorDaRevisao";
import { VinculosManuais } from "./VinculosManuais";

// A revisão manual da conciliação (Bloco B, Fase B3, 12/11/2026): porte do `RevisaoManual.tsx` e do
// `AcoesAnaliseSalva.tsx` do Contábil Core. Duas partes:
// - "Revisões salvas": as análises da empresa (e da conta, se escolhida), para reabrir sem reenviar o
//   Razão, renomear ou excluir (exclusão lógica: o histórico fica);
// - a janela da revisão: salva a análise (o Razão, o relatório e as referências do extrato), recebe o
//   Razão de apoio e registra ou desfaz conferências manuais.
// Quem só consulta o módulo vê as revisões e as conferências, sem os botões de alterar. Toda alteração
// leva a versão; conflito (409) recarrega a revisão para a pessoa conferir de novo.

/** A revisão com as somas do relatório guardado, como as rotas devolvem. */
export type RevisaoNaTela = { revisao: Revisao; somas: SomasDoGrupo[] };

const BASE = "/api/contabil-core/conciliacao/revisoes";

type Falha = { ok: false; erro: string; codigo?: CodigoErroRevisao; status: number };
type Resultado<T> = { ok: true; valor: T } | Falha;

async function pedir(url: string, init?: RequestInit): Promise<Resultado<Record<string, unknown>>> {
  const resp = await fetch(url, init).catch(() => null);
  const corpo = (await resp?.json().catch(() => null)) as Record<string, unknown> | null;
  if (!resp?.ok || !corpo) {
    const erro = typeof corpo?.error === "string" ? corpo.error : "Não deu para falar com o servidor. Tente de novo.";
    return { ok: false, erro, codigo: corpo?.codigo as CodigoErroRevisao | undefined, status: resp?.status ?? 0 };
  }
  return { ok: true, valor: corpo };
}

const comJson = (method: string, corpo: object): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });

async function pedirRevisao(url: string, init?: RequestInit): Promise<Resultado<RevisaoNaTela>> {
  const r = await pedir(url, init);
  if (!r.ok) return r;
  const { revisao, somas } = r.valor as Partial<RevisaoNaTela>;
  if (!revisao || !somas) return { ok: false, erro: "Resposta inesperada do servidor. Tente de novo.", status: 500 };
  return { ok: true, valor: { revisao, somas } };
}

const api = {
  listar: async (empresaId: string, agenciaId: string, pagina: number): Promise<Resultado<ListaRevisoes>> => {
    const q = new URLSearchParams({ empresa: empresaId, pagina: String(pagina) });
    if (agenciaId) q.set("agencia", agenciaId);
    const r = await pedir(`${BASE}?${q}`, { cache: "no-store" });
    if (!r.ok) return r;
    const lista = r.valor.lista as ListaRevisoes | undefined;
    return lista ? { ok: true, valor: lista } : { ok: false, erro: "Resposta inesperada do servidor.", status: 500 };
  },
  abrir: (empresaId: string, id: string) => pedirRevisao(`${BASE}/${id}?${new URLSearchParams({ empresa: empresaId })}`, { cache: "no-store" }),
  criar: (empresaId: string, agenciaId: string, arquivo: File, sispag: File | null, confirmarEmpresa: boolean) => {
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("agencia", agenciaId);
    form.set("arquivo", arquivo);
    if (sispag) form.set("sispag", sispag);
    if (confirmarEmpresa) form.set("confirmarEmpresa", "true");
    return pedirRevisao(BASE, { method: "POST", body: form });
  },
  apoio: (empresaId: string, id: string, versao: number, arquivo: File, confirmarEmpresa: boolean) => {
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("versao", String(versao));
    form.set("arquivo", arquivo);
    if (confirmarEmpresa) form.set("confirmarEmpresa", "true");
    return pedirRevisao(`${BASE}/${id}/apoio`, { method: "POST", body: form });
  },
  vincular: (empresaId: string, id: string, vinculo: NovoVinculo) => pedirRevisao(`${BASE}/${id}/vinculos`, comJson("POST", { empresa: empresaId, ...vinculo })),
  desfazer: (empresaId: string, id: string, vinculoId: string, corpo: DesfazerVinculo) =>
    pedirRevisao(`${BASE}/${id}/vinculos/${vinculoId}/desfazer`, comJson("POST", { empresa: empresaId, ...corpo })),
  renomear: (empresaId: string, id: string, versao: number, titulo: string) => pedirRevisao(`${BASE}/${id}`, comJson("PATCH", { empresa: empresaId, versao, titulo })),
  excluir: (empresaId: string, id: string, versao: number) => pedir(`${BASE}/${id}`, comJson("DELETE", { empresa: empresaId, versao })),
};

function ConfirmacaoDaEmpresa({ id, empresa, marcada, onChange }: { id: string; empresa: string; marcada: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/8 p-3">
      <Checkbox
        id={id}
        checked={marcada}
        onChange={(e) => onChange(e.target.checked)}
        label={
          <>
            O arquivo não informa o CNPJ. Confirmo que este Razão é de <strong>{empresa}</strong>.
          </>
        }
      />
    </div>
  );
}

type Props = {
  empresaId: string;
  /** O nome da empresa no relatório, para a confirmação quando o Razão não traz CNPJ. */
  empresaNome: string;
  agenciaId: string;
  arquivo: File | null;
  sispag: File | null;
  podeAgir: boolean;
  revisao: RevisaoNaTela | null;
  aberta: boolean;
  extratoInicialIds: string[];
  onFechar: () => void;
  /** A revisão aberta mudou (salva, conferência registrada ou desfeita, apoio, recarga). */
  onRevisao: (r: RevisaoNaTela) => void;
  /** Uma revisão salva foi aberta pela lista. */
  onAbrirSalva: (r: RevisaoNaTela) => void;
  onExcluida: (id: string) => void;
};

type EstadoDaLista = { carregando: boolean; erro: string | null; dados: ListaRevisoes | null };

export function RevisaoManual(props: Props) {
  const { empresaId, empresaNome, agenciaId, arquivo, sispag, podeAgir, revisao, aberta, extratoInicialIds, onFechar, onRevisao, onAbrirSalva, onExcluida } = props;
  const base = useId();
  const toast = useToast();
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const [pagina, setPagina] = useState(1);
  const [recarga, setRecarga] = useState(0);
  const [lista, setLista] = useState<EstadoDaLista>({ carregando: true, erro: null, dados: null });
  const [ocupado, setOcupado] = useState(false);
  const [situacao, setSituacao] = useState("");
  const [exigeConfirmarCriacao, setExigeConfirmarCriacao] = useState(false);
  const [confirmarCriacao, setConfirmarCriacao] = useState(false);
  const [arquivoApoio, setArquivoApoio] = useState<File | null>(null);
  const [exigeConfirmarApoio, setExigeConfirmarApoio] = useState(false);
  const [confirmarApoio, setConfirmarApoio] = useState(false);
  const apoioRef = useRef<HTMLInputElement>(null);

  // A lista das revisões salvas: recarrega ao mudar a página, depois de cada alteração e no "Tentar de novo".
  useEffect(() => {
    let vale = true;
    void api.listar(empresaId, agenciaId, pagina).then((r) => {
      if (!vale) return;
      setLista(r.ok ? { carregando: false, erro: null, dados: r.valor } : { carregando: false, erro: r.erro, dados: null });
    });
    return () => {
      vale = false;
    };
  }, [empresaId, agenciaId, pagina, recarga]);

  const recarregarLista = useCallback(() => {
    setLista((l) => ({ ...l, carregando: true, erro: null }));
    setRecarga((n) => n + 1);
  }, []);

  function irParaPagina(p: number) {
    setLista((l) => ({ ...l, carregando: true, erro: null }));
    setPagina(p);
  }

  function atualizar(r: RevisaoNaTela) {
    if (!montado.current) return;
    onRevisao(r);
    recarregarLista();
  }

  /** Recusa do servidor: avisa e, se foi conflito de versão ou de fonte, recarrega a revisão aberta. */
  async function tratarErro(f: Falha, titulo: string) {
    if (!montado.current) return;
    toast.error(`${titulo}: ${f.erro}`);
    if (f.status !== 409 || !revisao) return;
    setSituacao("Recarregando a revisão…");
    const r = await api.abrir(empresaId, revisao.revisao.id);
    if (!montado.current) return;
    if (!r.ok) return toast.error(`Não deu para atualizar a revisão: ${r.erro}`);
    atualizar(r.valor);
    setSituacao("Revisão atualizada. Confira as seleções de novo antes de registrar.");
    toast.show("Revisão atualizada. Confira as seleções de novo antes de registrar.");
  }

  /** Roda uma alteração com a tela travada; `false` quando outra já está em curso. */
  async function enquanto<T>(acao: () => Promise<T>): Promise<T | null> {
    if (ocupado) return null;
    setOcupado(true);
    try {
      return await acao();
    } finally {
      if (montado.current) setOcupado(false);
    }
  }

  async function criar() {
    if (!arquivo || !agenciaId) return;
    const r = await enquanto(() => api.criar(empresaId, agenciaId, arquivo, sispag, confirmarCriacao));
    if (!r || !montado.current) return;
    if (!r.ok) {
      if (r.codigo === "CONFIRMAR_EMPRESA") {
        setExigeConfirmarCriacao(true);
        setSituacao("Confirme a empresa do Razão para salvar a análise.");
        return;
      }
      return tratarErro(r, "Não deu para salvar a análise");
    }
    setExigeConfirmarCriacao(false);
    setConfirmarCriacao(false);
    atualizar(r.valor);
    setSituacao("Análise salva para revisão.");
    toast.success("Análise salva para revisão. Dá para reabri-la depois em Revisões salvas.");
  }

  async function abrir(item: ResumoRevisao) {
    const r = await enquanto(() => api.abrir(empresaId, item.id));
    if (!r || !montado.current) return;
    if (!r.ok) {
      if (r.status === 404) recarregarLista();
      return toast.error(`Não deu para abrir a revisão: ${r.erro}`);
    }
    setArquivoApoio(null);
    setExigeConfirmarApoio(false);
    setConfirmarApoio(false);
    onAbrirSalva(r.valor);
  }

  async function adicionarApoio() {
    if (!revisao || !arquivoApoio) return;
    const r = await enquanto(() => api.apoio(empresaId, revisao.revisao.id, revisao.revisao.versao, arquivoApoio, confirmarApoio));
    if (!r || !montado.current) return;
    if (!r.ok) {
      if (r.codigo === "CONFIRMAR_EMPRESA") {
        setExigeConfirmarApoio(true);
        setSituacao("Confirme a empresa do Razão de apoio para continuar.");
        return;
      }
      return tratarErro(r, "Não deu para pôr o Razão de apoio");
    }
    setArquivoApoio(null);
    if (apoioRef.current) apoioRef.current.value = "";
    setExigeConfirmarApoio(false);
    setConfirmarApoio(false);
    atualizar(r.valor);
    setSituacao("Razão de apoio adicionado.");
    toast.success("Razão de apoio adicionado. Os lançamentos estão em “Outras contas”.");
  }

  async function vincular(vinculo: NovoVinculo) {
    if (!revisao) return;
    const r = await enquanto(() => api.vincular(empresaId, revisao.revisao.id, vinculo));
    if (!r || !montado.current) return;
    if (!r.ok) return tratarErro(r, "Não deu para registrar a conferência");
    atualizar(r.valor);
    setSituacao("Conferência manual registrada.");
    toast.success("Conferência manual registrada.");
  }

  async function desfazer(v: VinculoRevisao, motivo: string) {
    if (!revisao) return;
    const r = await enquanto(() => api.desfazer(empresaId, revisao.revisao.id, v.id, { versao: revisao.revisao.versao, motivo }));
    if (!r || !montado.current) return;
    if (!r.ok) return tratarErro(r, "Não deu para desfazer a conferência");
    atualizar(r.valor);
    setSituacao("Conferência desfeita.");
    toast.success("Conferência desfeita. O registro e o motivo continuam no histórico.");
  }

  const rev = revisao?.revisao ?? null;
  const editavel = podeAgir && !!rev?.fontesValidas;
  const dados = lista.dados;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby={`${base}-salvas`}>
        <div>
          <h2 id={`${base}-salvas`} className="flex items-center gap-2 text-base font-semibold">
            <FolderOpen size={16} aria-hidden /> Revisões salvas
          </h2>
          <p className="text-sm text-fg-muted">Reabra as conferências desta empresa{agenciaId ? " e desta conta bancária" : ""}, sem reenviar o Razão.</p>
        </div>
        {lista.carregando && !dados && <p className="text-sm text-fg-muted">Carregando as revisões…</p>}
        {lista.erro && (
          <div className="flex flex-wrap items-center gap-2">
            <Aviso>Não deu para consultar as revisões salvas. {lista.erro}</Aviso>
            <Button type="button" size="sm" variant="secondary" onClick={recarregarLista}>
              Tentar de novo
            </Button>
          </div>
        )}
        {dados && dados.itens.length === 0 && (
          <p className="text-sm text-fg-muted">
            Nenhuma revisão salva.{podeAgir ? " Depois de conciliar, use “Revisar composição manualmente” nas pendências." : ""}
          </p>
        )}
        {dados && dados.itens.length > 0 && (
          <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-busy={lista.carregando}>
            {dados.itens.map((item) => (
              <ItemSalvo
                key={item.id}
                item={item}
                empresaId={empresaId}
                podeAgir={podeAgir}
                aberta={rev?.id === item.id}
                ocupado={ocupado}
                onAbrir={() => void abrir(item)}
                onRenomeada={(r) => {
                  if (rev?.id === item.id) onRevisao(r);
                  recarregarLista();
                }}
                onExcluida={() => {
                  onExcluida(item.id);
                  recarregarLista();
                }}
                onRecusa={recarregarLista}
              />
            ))}
          </ul>
        )}
        {dados && dados.total > dados.porPagina && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
            <span>
              {dados.total} revisões · Página {dados.pagina} de {Math.ceil(dados.total / dados.porPagina)}
            </span>
            <div className="flex gap-1" role="group" aria-label="Páginas das revisões salvas">
              <Button type="button" size="xs" variant="secondary" disabled={pagina === 1 || lista.carregando || ocupado} onClick={() => irParaPagina(pagina - 1)}>
                Anterior
              </Button>
              <Button
                type="button"
                size="xs"
                variant="secondary"
                disabled={pagina * dados.porPagina >= dados.total || lista.carregando || ocupado}
                onClick={() => irParaPagina(pagina + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>

      <p aria-live="polite" className="sr-only">
        {situacao}
      </p>

      <Modal open={aberta} onClose={() => !ocupado && onFechar()} title="Revisar composição manualmente" maxWidth="max-w-[min(96vw,1440px)]">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-fg-muted">
            Registre quais lançamentos compõem o valor do banco. A conferência guarda as referências do Razão e do extrato; nenhum lançamento, saldo
            ou classificação do NEO muda.
          </p>
          {!rev ? (
            podeAgir ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm">O Razão, o relatório e as referências do extrato ficam guardados nesta análise, para consultar depois.</p>
                <p className="text-sm text-fg-muted">
                  Razão: {arquivo?.name ?? "nenhum arquivo escolhido"} · Empresa: {empresaNome}
                </p>
                {exigeConfirmarCriacao && <ConfirmacaoDaEmpresa id={`${base}-conf-criar`} empresa={empresaNome} marcada={confirmarCriacao} onChange={setConfirmarCriacao} />}
                <div>
                  <Button
                    type="button"
                    disabled={!arquivo || !agenciaId || (exigeConfirmarCriacao && !confirmarCriacao)}
                    loading={ocupado}
                    loadingLabel="Salvando…"
                    onClick={() => void criar()}
                  >
                    Salvar análise e começar a revisão
                  </Button>
                </div>
                {(!arquivo || !agenciaId) && <p className="text-micro text-fg-muted">Escolha a conta e o arquivo do Razão e concilie antes de salvar a análise.</p>}
              </div>
            ) : (
              <Aviso tom="info">A revisão manual é de quem opera o Contábil Core. Abra uma revisão salva para consultar.</Aviso>
            )
          ) : (
            <>
              <div className="flex flex-col gap-1 rounded-md bg-surface-2 p-3 text-sm">
                <p className="font-medium">
                  {rev.relatorio.resumo.empresa} · {rev.contaBancaria}
                </p>
                {rev.titulo && <p className="font-medium">{rev.titulo}</p>}
                <p className="text-fg-muted break-words">
                  {dataBr(rev.periodoInicio)} a {dataBr(rev.periodoFim)} · {rev.nomeArquivo}
                </p>
                <p className="text-micro text-fg-muted">
                  As sugestões e as pendências do relatório automático continuam na tela. As conferências manuais ficam registradas abaixo.
                </p>
              </div>
              {rev.avisos.length > 0 && (
                <Aviso tom="atencao">
                  <ul className="list-disc pl-4">
                    {rev.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
              {!rev.fontesValidas && (
                <Aviso>
                  Histórico: o extrato desta revisão mudou ou foi desfeito depois que ela foi salva. As conferências continuam aqui para consulta, mas
                  novas composições estão bloqueadas. Para conferir com os dados atuais, salve outra análise.
                </Aviso>
              )}
              {!podeAgir && <Aviso tom="info">Só consulta: registrar ou desfazer conferência é de quem opera o Contábil Core.</Aviso>}

              <div className="rounded-lg border border-border p-3">
                <Accordion abertoInicial={rev.fontes.length === 1} classeDoCabecalho="text-sm font-medium" titulo={`Arquivos da análise e Razão de apoio (${rev.fontes.length})`}>
                  <div className="mt-3 flex flex-col gap-3">
                    <ul className="flex flex-col gap-1 text-micro text-fg-muted">
                      {rev.fontes.map((f) => (
                        <li key={f.id} className="break-words">
                          {f.tipo === "RAZAO_BANCO" ? "Conta do banco" : "Apoio"}: {f.nomeArquivo}
                          {f.periodoInicio && f.periodoFim ? ` · ${dataBr(f.periodoInicio)} a ${dataBr(f.periodoFim)}` : ""}
                        </li>
                      ))}
                    </ul>
                    {editavel && (
                      <>
                        <p className="text-sm">
                          Ponha o Razão de FGTS a recolher, de impostos ou de outras contas para buscar a composição. Provisões de períodos anteriores também
                          podem ser consultadas.
                        </p>
                        <CampoForm
                          label="Razão de apoio"
                          htmlFor={`${base}-apoio`}
                          helper="Excel (.xls ou .xlsx): uma ou várias contas no layout do Razão, com a identificação da conta e os totais. PDF: o Razão de uma conta só."
                        >
                          <input
                            id={`${base}-apoio`}
                            ref={apoioRef}
                            type="file"
                            accept=".xlsx,.XLSX,.xls,.XLS,.pdf,.PDF,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="block w-full text-sm"
                            disabled={ocupado}
                            onChange={(e) => {
                              setArquivoApoio(e.target.files?.[0] ?? null);
                              setExigeConfirmarApoio(false);
                              setConfirmarApoio(false);
                            }}
                          />
                        </CampoForm>
                        {exigeConfirmarApoio && (
                          <ConfirmacaoDaEmpresa id={`${base}-conf-apoio`} empresa={rev.relatorio.resumo.empresa} marcada={confirmarApoio} onChange={setConfirmarApoio} />
                        )}
                        {arquivoApoio && (
                          <div>
                            <Button
                              type="button"
                              size="sm"
                              disabled={exigeConfirmarApoio && !confirmarApoio}
                              loading={ocupado}
                              loadingLabel="Lendo…"
                              onClick={() => void adicionarApoio()}
                            >
                              <Upload size={14} aria-hidden /> Pôr o Razão de apoio
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Accordion>
              </div>

              {editavel && (
                <EditorDaRevisao
                  key={`${rev.id}-${rev.versao}-${extratoInicialIds.join(",")}`}
                  revisao={rev}
                  extratoInicialIds={extratoInicialIds}
                  ocupado={ocupado}
                  onRegistrar={(v) => void vincular(v)}
                />
              )}
              <VinculosManuais key={`${rev.id}-${rev.versao}`} revisao={rev} ocupado={ocupado} podeDesfazer={podeAgir} onDesfazer={(v, m) => void desfazer(v, m)} />
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

// ─── Uma revisão salva: abrir, renomear e excluir ─────────────────────────

function ItemSalvo({
  item,
  empresaId,
  podeAgir,
  aberta,
  ocupado,
  onAbrir,
  onRenomeada,
  onExcluida,
  onRecusa,
}: {
  item: ResumoRevisao;
  empresaId: string;
  podeAgir: boolean;
  aberta: boolean;
  ocupado: boolean;
  onAbrir: () => void;
  onRenomeada: (r: RevisaoNaTela) => void;
  onExcluida: () => void;
  /** A recusa pode ser versão velha ou revisão já excluída: a lista recarrega. */
  onRecusa: () => void;
}) {
  const base = useId();
  const nome = nomeDaRevisao(item);
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
    if (modo === "renomear") {
      const r = await api.renomear(empresaId, item.id, item.versao, titulo.trim());
      setSalvando(false);
      if (!r.ok) {
        setErro(r.erro);
        if (r.status === 409 || r.status === 404) onRecusa();
        return;
      }
      setModo(null);
      onRenomeada(r.valor);
    } else {
      const r = await api.excluir(empresaId, item.id, item.versao);
      setSalvando(false);
      if (!r.ok) {
        setErro(r.erro);
        if (r.status === 409 || r.status === 404) onRecusa();
        return;
      }
      setModo(null);
      onExcluida();
    }
  }

  const bloqueado = ocupado || salvando;
  return (
    <li className={`flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between ${aberta ? "border-brand bg-brand/8" : "border-border"}`}>
      <div className="min-w-0 text-sm">
        <p className="break-words font-medium">{nome}</p>
        <p className="text-micro text-fg-muted">
          {item.contaBancaria} · {dataBr(item.periodoInicio)} a {dataBr(item.periodoFim)}
        </p>
        <p className="text-micro text-fg-muted">Atualizada em {formatInstantDateTime(new Date(item.atualizadaEm))}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Button type="button" size="sm" variant="secondary" disabled={bloqueado} onClick={onAbrir} aria-label={`Abrir a revisão ${nome}`}>
          Abrir
        </Button>
        {podeAgir && (
          <>
            <Button type="button" size="sm" variant="ghost" disabled={bloqueado} onClick={() => abrirModo("renomear")} aria-label={`Renomear a revisão ${nome}`}>
              <Pencil size={14} aria-hidden /> Renomear
            </Button>
            <Button type="button" size="sm" variant="ghost" className="text-danger" disabled={bloqueado} onClick={() => abrirModo("excluir")} aria-label={`Excluir a revisão ${nome}`}>
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
          <p className="text-sm text-fg-muted">Muda só o nome. Banco, período, arquivos e conferências ficam como estão.</p>
          <CampoForm label="Nome" htmlFor={`${base}-nome`} required error={erro ?? undefined}>
            <Input id={`${base}-nome`} value={titulo} maxLength={200} disabled={salvando} onChange={(e) => setTitulo(e.target.value)} />
          </CampoForm>
          <div className="flex justify-end gap-2">
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
        description="Ela sai da lista. O histórico fica guardado, e nenhum lançamento, saldo ou classificação muda."
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
