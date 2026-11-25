"use client";

// A aba "Categorias do cliente" do Fluxo de caixa (25/11/2026, funcionalidade-837).
//
// À esquerda, a nomenclatura do cliente (cada categoria dele numa linha do
// fluxo); à direita, as categorias do Omie desta empresa, cada uma ligada a
// uma categoria do cliente. Escolher no seletor já grava, como na fila da DRE.
// Embaixo, recolhidos, importar o de-para de uma planilha e copiar de outra
// empresa — os dois com prévia antes de gravar.

import { useMemo, useState, useTransition } from "react";
import { Check, Pencil, Trash2, Upload, Copy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconButton } from "@/components/ui/IconButton";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { EmptyState } from "@/components/ui/EmptyState";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useConfirm } from "@/components/ui/useConfirm";
import { GRUPOS_DO_FLUXO, LINHAS_DO_FLUXO, chaveDeTexto, rotuloDaLinha } from "@/lib/fluxoDeCaixa/estrutura";
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
          {LINHAS_DO_FLUXO.filter((l) => l.grupo === g.code).map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

function TextoDoAndamento({ andamento }: { andamento: Andamento | undefined }) {
  return (
    <span role="status" className="text-fs-2">
      {andamento?.tipo === "salvando" && <span className="text-fg-muted"> · Salvando…</span>}
      {andamento?.tipo === "salvo" && (
        <span className="font-medium text-success-fg">
          {" "}
          · <Check size={12} className="inline -mt-0.5" aria-hidden /> Salvo
        </span>
      )}
      {andamento?.tipo === "erro" && <span className="block text-danger">{andamento.mensagem}</span>}
    </span>
  );
}

export function CategoriasDoCliente({ companyId, dados }: Props) {
  const { categoriasDoCliente, categoriasDoOmie, empresasComDePara } = dados;
  const ligadas = categoriasDoOmie.filter((c) => c.clienteId).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-ui text-fg">
          <span className="font-semibold tabular-nums">
            {ligadas} de {categoriasDoOmie.length}
          </span>{" "}
          categorias do Omie com categoria do cliente
          <span className="text-fg-muted"> · {categoriasDoCliente.length === 1 ? "1 categoria do cliente" : `${categoriasDoCliente.length} categorias do cliente`}</span>
        </p>
        <p className="text-helper text-fg-muted max-w-[72ch]">
          O nome que o cliente dá às categorias, para o fluxo de caixa sair na nomenclatura dele. Vale só para esta empresa: o plano de
          contas e as outras empresas não mudam. O cliente vê estes nomes no portal, mas quem mantém é a equipe.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
        <ListaDoCliente companyId={companyId} categorias={categoriasDoCliente} />
        <ListaDoOmie companyId={companyId} categorias={categoriasDoOmie} doCliente={categoriasDoCliente} />
      </div>

      <BlocoRecolhivel titulo="Importar o de-para de uma planilha" resumo=".xlsx ou .csv, com prévia antes de gravar" className="bg-surface">
        <ImportarDePara companyId={companyId} />
      </BlocoRecolhivel>
      {empresasComDePara.length > 0 && (
        <BlocoRecolhivel
          titulo="Copiar de outra empresa"
          resumo={empresasComDePara.length === 1 ? "1 empresa com de-para" : `${empresasComDePara.length} empresas com de-para`}
          className="bg-surface"
        >
          <CopiarDePara companyId={companyId} empresas={empresasComDePara} />
        </BlocoRecolhivel>
      )}
    </div>
  );
}

// ─── A nomenclatura do cliente ──────────────────────────────────────────────

function ListaDoCliente({ companyId, categorias }: { companyId: string; categorias: CategoriaDoClienteNaTela[] }) {
  const [andamento, setAndamento] = useState<Record<string, Andamento>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const { requestConfirm, dialog } = useConfirm();

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
    <Card as="section" className="p-4 flex flex-col gap-3" aria-labelledby="h-do-cliente">
      <h2 id="h-do-cliente" className="text-section font-semibold text-fg">
        Categorias do cliente
      </h2>
      {categorias.length === 0 ? (
        <p className="text-helper text-fg-muted">
          Nenhuma ainda. Crie abaixo ou importe o de-para da planilha do cliente. Sem categoria do cliente, o fluxo usa o nome do Omie.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {categorias.map((c) =>
            editando === c.id ? (
              <li key={c.id} className="py-2">
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
              <li key={c.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium text-fg truncate" title={c.nome}>
                    {c.nome}
                  </p>
                  <p className="text-fs-2 text-fg-muted tabular-nums">
                    {c.ligadas === 0 ? "nenhuma do Omie" : c.ligadas === 1 ? "1 do Omie" : `${c.ligadas} do Omie`}
                    <TextoDoAndamento andamento={andamento[c.id]} />
                  </p>
                </div>
                <div className="flex items-center gap-1 sm:w-64 shrink-0">
                  {/* Não controlado, com a chave na linha gravada: a escolha fica
                      no seletor enquanto grava, e a volta do servidor o remonta. */}
                  <Select
                    key={c.linha}
                    compact
                    aria-label={`Linha do fluxo de ${c.nome}`}
                    defaultValue={c.linha}
                    onChange={(e) => rodar(c.id, () => editarCategoriaDoCliente(companyId, c.id, { linha: e.target.value }))}
                    className="w-full"
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
      )}
      <NovaCategoria companyId={companyId} />
      {dialog}
    </Card>
  );
}

function Renomear({ nomeAtual, onSalvar, onCancelar }: { nomeAtual: string; onSalvar: (nome: string) => Promise<void>; onCancelar: () => void }) {
  const [nome, setNome] = useState(nomeAtual);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
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

function NovaCategoria({ companyId }: { companyId: string }) {
  const [nome, setNome] = useState("");
  const [linha, setLinha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
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
      <p className="text-micro uppercase tracking-wide text-fg-muted font-semibold">Nova categoria do cliente</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input compact aria-label="Nome da categoria do cliente" placeholder="Ex.: Folha" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className="min-w-0 flex-1" />
        <Select compact aria-label="Linha do fluxo da categoria nova" value={linha} onChange={(e) => setLinha(e.target.value)} className="sm:w-56">
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
}: {
  companyId: string;
  categorias: CategoriaDoOmieNaTela[];
  doCliente: CategoriaDoClienteNaTela[];
}) {
  const semLigacao = categorias.filter((c) => !c.clienteId).length;
  // Abre no que pede ação: as sem categoria do cliente, quando há.
  const [soSem, setSoSem] = useState(semLigacao > 0 && semLigacao < categorias.length);
  const [busca, setBusca] = useState("");
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
    <Card as="section" className="p-4 flex flex-col gap-3" aria-labelledby="h-do-omie">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="h-do-omie" className="text-section font-semibold text-fg">
          Categorias do Omie
        </h2>
        {semLigacao > 0 && <Selo tom="atencao">{semLigacao === 1 ? "1 sem categoria do cliente" : `${semLigacao} sem categoria do cliente`}</Selo>}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <CampoDeBusca compact aria-label="Buscar categoria do Omie" placeholder="Buscar pelo nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-0 flex-1" />
        <Checkbox label="Só as sem categoria do cliente" checked={soSem} onChange={(e) => setSoSem(e.target.checked)} />
      </div>
      {categorias.length === 0 ? (
        <EmptyState title="Esta empresa não tem categorias no plano de contas" description="Elas chegam com a importação do Omie, ou pelo plano de contas em Fornecedores e sacados." />
      ) : visiveis.length === 0 ? (
        <p className="text-helper text-fg-muted py-2">{soSem && !busca ? "Todas as categorias do Omie já têm categoria do cliente." : "Nenhuma categoria com esse nome."}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {visiveis.map((c) => {
            const cliente = c.clienteId ? clientePorId.get(c.clienteId) : undefined;
            return (
              <li key={c.id} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ui font-medium text-fg truncate" title={c.nome}>
                    {c.nome}
                  </p>
                  <p className="text-fs-2 text-fg-muted">
                    {c.kind === "RECEBER" ? "a receber" : "a pagar"}
                    {c.codigo && <span className="tabular-nums"> · {c.codigo}</span>}
                    {" · "}
                    {cliente ? (
                      <span className="text-fg-secondary">{rotuloDaLinha(cliente.linha)}</span>
                    ) : (
                      <span>
                        sugerida: <span className="text-fg-secondary">{rotuloDaLinha(c.sugerida)}</span>
                      </span>
                    )}
                    <TextoDoAndamento andamento={andamento[c.id]} />
                  </p>
                </div>
                <Select
                  key={c.clienteId ?? "-"}
                  compact
                  aria-label={`Categoria do cliente para ${c.nome}`}
                  defaultValue={c.clienteId ?? ""}
                  disabled={doCliente.length === 0}
                  onChange={(e) => ligar(c, e.target.value)}
                  className="w-full sm:w-60 shrink-0"
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
    </Card>
  );
}

// ─── Importar e copiar ──────────────────────────────────────────────────────

function ImportarDePara({ companyId }: { companyId: string }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaDoDePara | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
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
    setFeito(null);
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
      setFeito(frase(r.resumo));
      setPrevia(null);
      setArquivo(null);
      setVersao((v) => v + 1);
    });
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-helper text-fg-muted max-w-[72ch]">
        Duas ou três colunas: a categoria no Omie (o nome ou o código), a categoria do cliente e, se tiver, a linha do fluxo. A planilha
        que liga só a categoria do cliente à linha (a tabela do DFC, sem a coluna do Omie) também serve. O cabeçalho diz qual coluna é
        qual. O que já está gravado e não aparece na planilha fica como está.
      </p>
      <FileDropzoneField key={versao} name="arquivo" accept=".xlsx,.csv,.txt" maxSizeMb={8} compacto convite="Escolher a planilha do de-para" onFileChange={escolher} />
      {pendente && !previa && <p className="text-helper text-fg-muted">Lendo…</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {feito && (
        <Aviso tom="sucesso" icone={<Check />}>
          {feito}
        </Aviso>
      )}
      {previa && <PreviaDoPlano previa={previa} rotulo="Importar" icone={<Upload size={15} />} pendente={pendente} onConfirmar={confirmar} />}
    </div>
  );
}

function CopiarDePara({ companyId, empresas }: { companyId: string; empresas: { id: string; nome: string }[] }) {
  const [origem, setOrigem] = useState("");
  const [previa, setPrevia] = useState<PreviaDoDePara | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function escolher(id: string) {
    setOrigem(id);
    setPrevia(null);
    setErro(null);
    setFeito(null);
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
      setFeito(frase(r.resumo));
      setPrevia(null);
      setOrigem("");
    });
  }

  return (
    <div className="flex flex-col gap-3 pb-1">
      <p className="text-helper text-fg-muted max-w-[72ch]">
        Para matriz e filiais com a mesma nomenclatura. As categorias do Omie casam pelo nome; as que esta empresa não tem ficam de fora.
      </p>
      <Select compact aria-label="Empresa de onde copiar" value={origem} onChange={(e) => escolher(e.target.value)} className="sm:w-80">
        <option value="">Copiar de…</option>
        {empresas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nome}
          </option>
        ))}
      </Select>
      {pendente && !previa && origem && <p className="text-helper text-fg-muted">Comparando…</p>}
      {erro && <Aviso>{erro}</Aviso>}
      {feito && (
        <Aviso tom="sucesso" icone={<Check />}>
          {feito}
        </Aviso>
      )}
      {previa && <PreviaDoPlano previa={previa} rotulo="Copiar" icone={<Copy size={15} />} pendente={pendente} onConfirmar={confirmar} />}
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
}: {
  previa: PreviaDoDePara;
  rotulo: string;
  icone: React.ReactNode;
  pendente: boolean;
  onConfirmar: () => void;
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
      <div>
        <Button onClick={onConfirmar} disabled={nada} loading={pendente} loadingLabel="Gravando…">
          {icone}
          {rotulo}
        </Button>
      </div>
    </div>
  );
}
