"use client";

// As categorias do cliente no Modelo do fluxo (25/11/2026, funcionalidade-837).
//
// À esquerda, a nomenclatura do cliente (cada categoria dele numa linha do
// fluxo); à direita, as categorias do Omie desta empresa, cada uma ligada a
// uma categoria do cliente. Escolher no seletor já grava, como na fila da DRE.
// Importar o de-para de uma planilha e copiar de outra empresa abrem janelas,
// as duas com prévia antes de gravar.
//
// Redesenho de 26/11/2026 (melhoria-879): a lista do Omie, longa, ficava à
// direita com as seções de importar e copiar lá embaixo, e a página esticava.
// Agora uma barra no padrão das tabelas (contagem, busca, filtro e as duas
// ações) e as duas listas lado a lado, com a mesma altura máxima e rolagem
// própria; as frases de explicação foram para o "?" da barra.

import { useMemo, useState, useTransition } from "react";
import { Check, Pencil, Trash2, Upload, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Modal } from "@/components/ui/Modal";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { BotaoDaDica } from "@/components/dre/BotaoDaDica";
import { GRUPOS_DO_FLUXO, LINHAS_DAS_CATEGORIAS, LINHAS_DO_FLUXO, chaveDeTexto, rotuloDaLinha } from "@/lib/fluxoDeCaixa/estrutura";
import type { DadosDasCategoriasDoCliente, CategoriaDoClienteNaTela, CategoriaDoOmieNaTela } from "@/lib/fluxoDeCaixa/categoriasDoClienteServidor";
import {
  apagarCategoriaDoCliente,
  copiarDePara,
  criarCategoriaDoCliente,
  editarCategoriaDoCliente,
  importarDePara,
  ligarCategoria,
  preverCopiaDoDePara,
  preverImportacaoDoDePara,
  type AcaoDasCategorias,
  type PreviaDoDePara,
} from "@/app/(app)/fluxo-de-caixa/actions";

type Props = { companyId: string; dados: DadosDasCategoriasDoCliente };

type Andamento = { tipo: "salvando" } | { tipo: "salvo" } | { tipo: "erro"; mensagem: string };

const DICA_DO_DE_PARA =
  "Cada categoria do Omie ligada a uma categoria do cliente, para o fluxo de caixa sair na nomenclatura dele. Vale só para esta empresa: o plano de contas e as outras empresas não mudam. " +
  "O cliente vê estes nomes no portal, mas quem mantém é a equipe. Categoria do Omie sem categoria do cliente fica na linha sugerida pelo nome.";

// As duas colunas com o mesmo desenho (melhoria-879): mesma altura máxima,
// cabeçalho fixo, rolagem própria e linhas da mesma altura, com controles de
// 32 px. No computador elas moram dentro do casco; no celular o casco não
// desenha nada, e cada coluna vira um cartão.
const COLUNA = "flex min-w-0 max-h-[70vh] flex-col max-md:rounded-lg max-md:border max-md:border-border max-md:bg-surface max-md:shadow-xs";
const CABECALHO_DA_COLUNA = "flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-4";
const ROLAGEM = "min-h-0 flex-1 overflow-y-auto";
const LINHA = "flex flex-col gap-1.5 px-4 py-1.5 sm:min-h-14 sm:flex-row sm:items-center sm:gap-3";
const NOME = "truncate text-ui font-medium text-fg";
const DETALHE = "flex h-[22px] min-w-0 items-center gap-1.5 text-fs-2 text-fg-muted";
const VAZIO = "px-4 py-3 text-helper text-fg-muted";

/** O que a ação devolveu, como andamento da linha. */
function andamentoDe(r: AcaoDasCategorias): Andamento {
  return "error" in r ? { tipo: "erro", mensagem: r.error } : { tipo: "salvo" };
}

/** As linhas do fluxo no seletor, agrupadas como no fluxo direto. */
function OpcoesDeLinha() {
  return (
    <>
      {GRUPOS_DO_FLUXO.map((g) => (
        <optgroup key={g.code} label={g.label}>
          {LINHAS_DAS_CATEGORIAS.filter((l) => l.grupo === g.code).map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

/** "Salvando…" e "Salvo", na linha do detalhe. O erro vai embaixo (`ErroDoAndamento`). */
function TextoDoAndamento({ andamento }: { andamento: Andamento | undefined }) {
  return (
    <span role="status" className="shrink-0">
      {andamento?.tipo === "salvando" && <span className="text-fg-muted">· Salvando…</span>}
      {andamento?.tipo === "salvo" && (
        <span className="font-medium text-success-fg">
          · <Check size={12} className="inline -mt-0.5" aria-hidden /> Salvo
        </span>
      )}
    </span>
  );
}

function ErroDoAndamento({ andamento }: { andamento: Andamento | undefined }) {
  return andamento?.tipo === "erro" ? (
    <p role="alert" className="text-fs-2 text-danger">
      {andamento.mensagem}
    </p>
  ) : null;
}

export function CategoriasDoCliente({ companyId, dados }: Props) {
  const { categoriasDoCliente, categoriasDoOmie, empresasComDePara } = dados;
  const ligadas = categoriasDoOmie.filter((c) => c.clienteId).length;
  const semLigacao = categoriasDoOmie.length - ligadas;
  // Abre no que pede ação: as sem categoria do cliente, quando há.
  const [soSem, setSoSem] = useState(semLigacao > 0 && semLigacao < categoriasDoOmie.length);
  const [busca, setBusca] = useState("");
  const [janela, setJanela] = useState<"importar" | "copiar" | null>(null);
  const fechar = () => setJanela(null);

  // Sem outra empresa com de-para, o botão aparece desligado e diz por quê
  // (a regra do campo que aparece sempre); antes, o bloco sumia.
  const semOrigem = empresasComDePara.length === 0;
  const botaoDeCopiar = (
    <Button type="button" size="sm" variant="secondary" disabled={semOrigem} onClick={() => setJanela("copiar")}>
      <Copy size={14} /> Copiar de outra empresa
    </Button>
  );

  return (
    <>
      <CascoDaTabela
        contagem={
          categoriasDoOmie.length > 0 ? (
            <span className="tabular-nums" title="Categorias do Omie com categoria do cliente">
              {ligadas} de {categoriasDoOmie.length} ligadas
            </span>
          ) : undefined
        }
        fora={<BotaoDaDica rotulo="o de-para das categorias" dica={DICA_DO_DE_PARA} />}
        busca={
          <CampoDeBusca
            compact
            aria-label="Buscar categoria"
            placeholder="Buscar pelo nome ou código"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full sm:w-60"
          />
        }
        filtros={<Checkbox label="Só as sem categoria do cliente" checked={soSem} onChange={(e) => setSoSem(e.target.checked)} />}
        acoes={
          <>
            <Button type="button" size="sm" variant="secondary" onClick={() => setJanela("importar")}>
              <Upload size={14} /> Importar planilha
            </Button>
            {semOrigem ? (
              <span className="inline-flex" title="Nenhuma outra empresa do escritório tem de-para para copiar.">
                {botaoDeCopiar}
              </span>
            ) : (
              botaoDeCopiar
            )}
          </>
        }
      >
        <div className="grid divide-border max-md:gap-2 md:divide-y xl:grid-cols-2 xl:divide-x xl:divide-y-0">
          <ListaDoCliente companyId={companyId} categorias={categoriasDoCliente} busca={busca} />
          <ListaDoOmie companyId={companyId} categorias={categoriasDoOmie} doCliente={categoriasDoCliente} busca={busca} soSem={soSem} />
        </div>
      </CascoDaTabela>

      <Modal open={janela === "importar"} onClose={fechar} title="Importar o de-para da planilha" maxWidth="max-w-2xl">
        <ImportarDePara companyId={companyId} onFeito={fechar} onCancelar={fechar} />
      </Modal>
      <Modal open={janela === "copiar"} onClose={fechar} title="Copiar de outra empresa" maxWidth="max-w-2xl">
        <CopiarDePara companyId={companyId} empresas={empresasComDePara} onFeito={fechar} onCancelar={fechar} />
      </Modal>
    </>
  );
}

// ─── A nomenclatura do cliente ──────────────────────────────────────────────

function ListaDoCliente({ companyId, categorias, busca }: { companyId: string; categorias: CategoriaDoClienteNaTela[]; busca: string }) {
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const { requestConfirm, dialog } = useConfirm();

  // Agrupadas pela linha do fluxo, na ordem do fluxo direto (melhoria-879).
  // A busca da barra vale para as duas listas.
  const grupos = useMemo(() => {
    const k = chaveDeTexto(busca);
    const visiveis = k ? categorias.filter((c) => chaveDeTexto(c.nome).includes(k)) : categorias;
    const conhecidas = new Set(LINHAS_DO_FLUXO.map((l) => l.code));
    const porLinha = LINHAS_DO_FLUXO.map((l) => ({ code: l.code, label: l.label, itens: visiveis.filter((c) => c.linha === l.code) }));
    const outras = visiveis.filter((c) => !conhecidas.has(c.linha));
    if (outras.length > 0) porLinha.push({ code: "_outras", label: "Outra linha", itens: outras });
    return porLinha.filter((g) => g.itens.length > 0);
  }, [categorias, busca]);

  async function rodar(id: string, acao: () => Promise<AcaoDasCategorias>) {
    setAndamento((a) => ({ ...a, [id]: { tipo: "salvando" } }));
    let r: AcaoDasCategorias;
    try {
      r = await acao();
    } catch {
      r = { error: "Não consegui gravar. Tente de novo." };
    }
    setAndamento((a) => ({ ...a, [id]: andamentoDe(r) }));
    return r;
  }

  function apagar(c: CategoriaDoClienteNaTela) {
    requestConfirm(
      {
        title: `Apagar “${c.nome}”?`,
        description:
          c.ligadas === 0
            ? "Nenhuma categoria do Omie está ligada a ela."
            : `${c.ligadas === 1 ? "A categoria do Omie ligada a ela fica" : `As ${c.ligadas} categorias do Omie ligadas a ela ficam`} sem categoria do cliente, e o fluxo volta a usar a linha sugerida.`,
        confirmLabel: "Apagar",
        destructive: true,
      },
      async () => {
        const r = await apagarCategoriaDoCliente(companyId, c.id);
        return "error" in r ? r : null;
      }
    );
  }

  return (
    <section className={COLUNA} aria-labelledby="h-do-cliente">
      <div className={CABECALHO_DA_COLUNA}>
        <h2 id="h-do-cliente" className="text-label font-semibold text-fg">
          Categorias do cliente
        </h2>
        <span className="text-fs-2 text-fg-muted tabular-nums">{categorias.length}</span>
      </div>
      <div className={ROLAGEM}>
        {categorias.length === 0 ? (
          <p className={VAZIO}>Nenhuma ainda. Crie no pé desta lista ou use “Importar planilha”.</p>
        ) : grupos.length === 0 ? (
          <p className={VAZIO}>Nenhuma com esse nome.</p>
        ) : (
          grupos.map((g) => (
            <div key={g.code}>
              <h3 className="sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-4 py-1 text-micro font-semibold uppercase tracking-wide text-fg-muted">
                <span className="truncate" title={g.label}>
                  {g.label}
                </span>
                <span className="shrink-0 tabular-nums">{g.itens.length}</span>
              </h3>
              <ul className="divide-y divide-border">
                {g.itens.map((c) =>
                  editando === c.id ? (
                    <li key={c.id} className={LINHA}>
                      <Renomear
                        nomeAtual={c.nome}
                        onCancelar={() => setEditando(null)}
                        onSalvar={async (nome) => {
                          const r = await rodar(c.id, () => editarCategoriaDoCliente(companyId, c.id, { nome }));
                          if (!("error" in r)) setEditando(null);
                        }}
                      />
                    </li>
                  ) : (
                    <li key={c.id} className={LINHA}>
                      <div className="min-w-0 flex-1">
                        <p className={NOME} title={c.nome}>
                          {c.nome}
                        </p>
                        <p className={`${DETALHE} tabular-nums`}>
                          <span className="shrink-0">{c.ligadas === 0 ? "nenhuma do Omie" : c.ligadas === 1 ? "1 do Omie" : `${c.ligadas} do Omie`}</span>
                          <TextoDoAndamento andamento={andamento[c.id]} />
                        </p>
                        <ErroDoAndamento andamento={andamento[c.id]} />
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {/* Não controlado, com a chave na linha gravada: a escolha fica
                            no seletor enquanto grava, e a volta do servidor o remonta. */}
                        <Select
                          key={c.linha}
                          compact
                          aria-label={`Linha do fluxo de ${c.nome}`}
                          defaultValue={c.linha}
                          onChange={(e) => rodar(c.id, () => editarCategoriaDoCliente(companyId, c.id, { linha: e.target.value }))}
                          className="w-full sm:w-48"
                        >
                          <OpcoesDeLinha />
                        </Select>
                        <IconButton size="md" variant="ghost" title={`Renomear ${c.nome}`} onClick={() => setEditando(c.id)}>
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton size="md" variant="ghost" title={`Apagar ${c.nome}`} onClick={() => apagar(c)}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </li>
                  )
                )}
              </ul>
            </div>
          ))
        )}
      </div>
      <NovaCategoria companyId={companyId} />
      {dialog}
    </section>
  );
}

function Renomear({ nomeAtual, onSalvar, onCancelar }: { nomeAtual: string; onSalvar: (nome: string) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(nomeAtual);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(() => onSalvar(nome));
      }}
    >
      <Input compact aria-label="Novo nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus className="min-w-0 flex-1" />
      <Button type="submit" size="sm" loading={pendente} loadingLabel="Salvando…" disabled={!nome.trim()}>
        Salvar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancelar}>
        Cancelar
      </Button>
    </form>
  );
}

/** No pé da coluna, fora da rolagem: criar não some quando a lista cresce. */
function NovaCategoria({ companyId }: { companyId: string }) {
  const [nome, setNome] = useState("");
  const [linha, setLinha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border px-4 py-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await criarCategoriaDoCliente(companyId, nome, linha);
          if ("error" in r) setErro(r.error);
          else {
            setNome("");
            setLinha("");
          }
        });
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input compact aria-label="Nome da categoria do cliente" placeholder="Nova categoria (ex.: Folha)" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className="min-w-0 flex-1" />
        <Select compact aria-label="Linha do fluxo da categoria nova" value={linha} onChange={(e) => setLinha(e.target.value)} className="sm:w-48">
          <option value="">Linha do fluxo…</option>
          <OpcoesDeLinha />
        </Select>
        <Button type="submit" size="sm" variant="secondary" loading={pendente} loadingLabel="Criando…" disabled={!nome.trim() || !linha}>
          Criar
        </Button>
      </div>
      {erro && <p className="text-fs-2 text-danger">{erro}</p>}
    </form>
  );
}

// ─── As categorias do Omie ──────────────────────────────────────────────────

function ListaDoOmie({
  companyId,
  categorias,
  doCliente,
  busca,
  soSem,
}: {
  companyId: string;
  categorias: CategoriaDoOmieNaTela[];
  doCliente: CategoriaDoClienteNaTela[];
  busca: string;
  soSem: boolean;
}) {
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const clientePorId = useMemo(() => new Map(doCliente.map((c) => [c.id, c])), [doCliente]);

  const visiveis = useMemo(() => {
    const k = chaveDeTexto(busca);
    return categorias.filter(
      (c) => (!soSem || !c.clienteId) && (!k || chaveDeTexto(c.nome).includes(k) || (c.codigo ?? "").includes(busca.trim()))
    );
  }, [categorias, soSem, busca]);

  async function ligar(c: CategoriaDoOmieNaTela, clienteId: string) {
    setAndamento((a) => ({ ...a, [c.id]: { tipo: "salvando" } }));
    let r: AcaoDasCategorias;
    try {
      r = await ligarCategoria(companyId, c.id, clienteId || null);
    } catch {
      r = { error: "Não consegui gravar. Tente de novo." };
    }
    setAndamento((a) => ({ ...a, [c.id]: andamentoDe(r) }));
  }

  return (
    <section className={COLUNA} aria-labelledby="h-do-omie">
      <div className={CABECALHO_DA_COLUNA}>
        <h2 id="h-do-omie" className="text-label font-semibold text-fg">
          Categorias do Omie
        </h2>
        <span className="text-fs-2 text-fg-muted tabular-nums">
          {visiveis.length === categorias.length ? categorias.length : `${visiveis.length} de ${categorias.length}`}
        </span>
      </div>
      <div className={ROLAGEM}>
        {categorias.length === 0 ? (
          <EmptyState title="Esta empresa não tem categorias no plano de contas" description="Elas chegam com a importação do Omie, ou pelo plano de contas em Fornecedores e sacados." />
        ) : visiveis.length === 0 ? (
          <p className={VAZIO}>{soSem && !busca ? "Todas as categorias do Omie já têm categoria do cliente." : "Nenhuma categoria com esse nome."}</p>
        ) : (
          <ul className="divide-y divide-border">
            {visiveis.map((c) => {
              const cliente = c.clienteId ? clientePorId.get(c.clienteId) : undefined;
              const sugerida = rotuloDaLinha(c.sugerida);
              return (
                <li key={c.id} className={LINHA}>
                  <div className="min-w-0 flex-1">
                    <p className={NOME} title={c.nome}>
                      {c.nome}
                    </p>
                    <p className={DETALHE}>
                      <span className="shrink-0">
                        {c.kind === "RECEBER" ? "a receber" : "a pagar"}
                        {c.codigo && <span className="tabular-nums"> · {c.codigo}</span>}
                      </span>
                      <span aria-hidden>·</span>
                      {cliente ? (
                        <span className="min-w-0 truncate text-fg-secondary" title={rotuloDaLinha(cliente.linha)}>
                          {rotuloDaLinha(cliente.linha)}
                        </span>
                      ) : (
                        <span className="flex min-w-0" title={`Linha sugerida pelo nome: ${sugerida}`}>
                          <Selo className="min-w-0 max-w-full">
                            <span className="min-w-0 truncate">sugerida · {sugerida}</span>
                          </Selo>
                        </span>
                      )}
                      <TextoDoAndamento andamento={andamento[c.id]} />
                    </p>
                    <ErroDoAndamento andamento={andamento[c.id]} />
                  </div>
                  <Select
                    key={c.clienteId ?? "-"}
                    compact
                    aria-label={`Categoria do cliente para ${c.nome}`}
                    defaultValue={c.clienteId ?? ""}
                    disabled={doCliente.length === 0}
                    onChange={(e) => ligar(c, e.target.value)}
                    className="w-full shrink-0 sm:w-56"
                  >
                    <option value="">{doCliente.length === 0 ? "Crie as categorias do cliente" : "Sem categoria do cliente"}</option>
                    {GRUPOS_DO_FLUXO.map((g) => {
                      const doGrupo = doCliente.filter((d) => LINHAS_DO_FLUXO.find((l) => l.code === d.linha)?.grupo === g.code);
                      return doGrupo.length === 0 ? null : (
                        <optgroup key={g.code} label={g.label}>
                          {doGrupo.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nome}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Importar e copiar (nas janelas) ────────────────────────────────────────

type DaJanela = { companyId: string; onFeito: () => void; onCancelar: () => void };

const DICA_DA_PLANILHA =
  "A planilha que liga só a categoria do cliente à linha (a tabela do DFC, sem a coluna do Omie) também serve. O cabeçalho diz qual coluna é qual. " +
  "O que já está gravado e não aparece na planilha fica como está.";

function ImportarDePara({ companyId, onFeito, onCancelar }: DaJanela) {
  const toast = useToast();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaDoDePara | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function comArquivo(f: File): FormData {
    const form = new FormData();
    form.set("arquivo", f);
    return form;
  }

  function escolher(f: File | null) {
    setArquivo(f);
    setPrevia(null);
    setErro(null);
    if (!f) return;
    startTransition(async () => {
      const r = await preverImportacaoDoDePara(companyId, comArquivo(f));
      if ("error" in r) setErro(r.error);
      else setPrevia(r.previa);
    });
  }

  function confirmar() {
    if (!arquivo) return;
    setErro(null);
    startTransition(async () => {
      // Manda o arquivo de novo: o servidor relê e refaz o plano.
      const r = await importarDePara(companyId, comArquivo(arquivo));
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      toast.success(frase(r.resumo));
      onFeito();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-0.5 text-helper text-fg-muted">
        <span className="py-1">Colunas: a categoria no Omie (nome ou código), a categoria do cliente e, se tiver, a linha do fluxo.</span>
        <BotaoDaDica rotulo="a planilha do de-para" dica={DICA_DA_PLANILHA} />
      </p>
      <FileDropzoneField name="arquivo" accept=".xlsx,.csv,.txt" maxSizeMb={8} compacto convite="Escolher a planilha do de-para" onFileChange={escolher} />
      {pendente && !previa && <p className="text-helper text-fg-muted">Lendo…</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {previa && <PreviaDoPlano previa={previa} rotulo="Importar" icone={<Upload size={15} />} pendente={pendente} onConfirmar={confirmar} onCancelar={onCancelar} />}
    </div>
  );
}

function CopiarDePara({ companyId, empresas, onFeito, onCancelar }: DaJanela & { empresas: { id: string; nome: string }[] }) {
  const toast = useToast();
  const [origem, setOrigem] = useState("");
  const [previa, setPrevia] = useState<PreviaDoDePara | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function escolher(id: string) {
    setOrigem(id);
    setPrevia(null);
    setErro(null);
    if (!id) return;
    startTransition(async () => {
      const r = await preverCopiaDoDePara(companyId, id);
      if ("error" in r) setErro(r.error);
      else setPrevia(r.previa);
    });
  }

  function confirmar() {
    startTransition(async () => {
      const r = await copiarDePara(companyId, origem);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      toast.success(frase(r.resumo));
      onFeito();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-helper text-fg-muted">Para matriz e filiais com a mesma nomenclatura. As categorias do Omie casam pelo nome.</p>
      <Select compact aria-label="Empresa de onde copiar" value={origem} onChange={(e) => escolher(e.target.value)} className="w-full">
        <option value="">Copiar de…</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </Select>
      {pendente && !previa && origem && <p className="text-helper text-fg-muted">Comparando…</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {previa && <PreviaDoPlano previa={previa} rotulo="Copiar" icone={<Copy size={15} />} pendente={pendente} onConfirmar={confirmar} onCancelar={onCancelar} />}
    </div>
  );
}

function frase(r: PreviaDoDePara["resumo"]): string {
  const partes = [
    r.mudam > 0 && `${r.mudam} ${r.mudam === 1 ? "ligação gravada" : "ligações gravadas"}`,
    r.novas > 0 && `${r.novas} ${r.novas === 1 ? "categoria do cliente criada" : "categorias do cliente criadas"}`,
    r.mudamDeLinha > 0 && `${r.mudamDeLinha} ${r.mudamDeLinha === 1 ? "mudou de linha" : "mudaram de linha"}`,
  ].filter(Boolean);
  return `Pronto: ${partes.join(", ")}.`;
}

const MOSTRAR = 12;

/** O que a importação ou a cópia vai fazer, antes de fazer. */
function PreviaDoPlano({
  previa,
  rotulo,
  icone,
  pendente,
  onConfirmar,
  onCancelar,
}: {
  previa: PreviaDoDePara;
  rotulo: string;
  icone: React.ReactNode;
  pendente: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const { plano, resumo } = previa;
  const nada = resumo.mudam === 0 && resumo.novas === 0 && resumo.mudamDeLinha === 0;
  const lista = <T,>(itens: T[], texto: (t: T) => string) => (
    <ul className="text-fs-2 text-fg-secondary list-disc pl-5">
      {itens.slice(0, MOSTRAR).map((t, i) => (
        <li key={i}>{texto(t)}</li>
      ))}
      {itens.length > MOSTRAR && <li className="text-fg-muted">e mais {itens.length - MOSTRAR}</li>}
    </ul>
  );
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-ui text-fg">
        {previa.modo === "linhas" ? "Planilha de linhas do fluxo. " : ""}
        {nada ? (
          <span className="font-semibold">Nada muda no de-para desta empresa.</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{resumo.mudam}</span> {resumo.mudam === 1 ? "ligação nova ou trocada" : "ligações novas ou trocadas"}
            {previa.modo === "ligacoes" && <span className="text-fg-muted tabular-nums"> (de {resumo.ligacoes} na planilha)</span>}
            {" · "}
            <span className="font-semibold tabular-nums">{resumo.novas}</span> {resumo.novas === 1 ? "categoria do cliente nova" : "categorias do cliente novas"}
            {resumo.mudamDeLinha > 0 && (
              <>
                {" · "}
                <span className="font-semibold tabular-nums">{resumo.mudamDeLinha}</span> {resumo.mudamDeLinha === 1 ? "muda de linha" : "mudam de linha"}
              </>
            )}
          </>
        )}
      </p>
      {plano.novas.length > 0 && (
        <div>
          <p className="text-micro uppercase tracking-wide text-fg-muted font-semibold mb-1">Categorias do cliente novas</p>
          {lista(plano.novas, (n) => `${n.nome} → ${rotuloDaLinha(n.linha)}${n.linhaSugerida ? " (sugerida)" : ""}`)}
        </div>
      )}
      {plano.mudamDeLinha.length > 0 && (
        <div>
          <p className="text-micro uppercase tracking-wide text-fg-muted font-semibold mb-1">Mudam de linha</p>
          {lista(plano.mudamDeLinha, (m) => `${m.nome}: ${rotuloDaLinha(m.de)} → ${rotuloDaLinha(m.para)}`)}
        </div>
      )}
      {plano.semPar.length > 0 && (
        <Aviso tom="atencao">
          <p className="mb-1">
            {plano.semPar.length === 1 ? "1 linha cita" : `${plano.semPar.length} linhas citam`} categoria que o plano desta empresa não tem. Ficam de fora:
          </p>
          {lista(plano.semPar, (s) => `linha ${s.linha}: ${s.omie}`)}
        </Aviso>
      )}
      {plano.invalidas.length > 0 && (
        <Aviso tom="atencao">
          <p className="mb-1">{plano.invalidas.length === 1 ? "1 linha não dá para usar:" : `${plano.invalidas.length} linhas não dão para usar:`}</p>
          {lista(plano.invalidas, (s) => `linha ${s.linha}: ${s.texto || "—"} (${s.motivo})`)}
        </Aviso>
      )}
      {plano.repetidas.length > 0 && (
        <p className="text-fs-2 text-fg-muted">
          {plano.repetidas.length === 1 ? "1 categoria do Omie aparece" : `${plano.repetidas.length} categorias do Omie aparecem`} mais de uma vez: vale a primeira.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancelar} disabled={pendente}>
          Cancelar
        </Button>
        <Button onClick={onConfirmar} disabled={nada} loading={pendente} loadingLabel="Gravando…">
          {icone}
          {rotulo}
        </Button>
      </div>
    </div>
  );
}
