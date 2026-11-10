"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Folder, Trash2, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Popover } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";
import { IconPicker } from "@/components/bpoManual/ManualWorkspace";
import type { FluxoAberto, OpcaoDeSetor, OpcaoDeTela, PastaDaArvore, Pessoa, VersaoAberta } from "@/lib/fluxos/tipos";
import type { EntradaDaVersao, Resultado, ResultadoDaVersao } from "@/app/(app)/fluxos/actions";
import { LeituraDoFluxo } from "./LeituraDoFluxo";
import { EditorDoFluxo } from "./EditorDoFluxo";
import { NovaPastaDeFluxos, NovoFluxo } from "./NovosNoRepositorio";

type Props = {
  setor: string;
  setorRotulo: string;
  /** Os rótulos dos setores do escritório (o chip "Pessoa · DP"). */
  rotulosDosSetores: Record<string, string>;
  /** Com mais de um setor ao alcance, o endereço leva o `?setor=`. */
  comSetorNoEndereco: boolean;
  pastas: PastaDaArvore[];
  aberto: FluxoAberto | null;
  versaoAberta: VersaoAberta | null;
  /** `?editar=1`: o fluxo recém-criado abre na edição. */
  editarDeInicio: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  pessoas: Pessoa[];
  setores: OpcaoDeSetor[];
  telas: OpcaoDeTela[];
  /** As abas de setor do Apoio (só em "Todos os setores", para quem alcança mais de um). */
  seletorDoSetor?: React.ReactNode;
  acoes: {
    criarPasta: (titulo: string) => Promise<Resultado>;
    renomearPasta: (pastaId: string, titulo: string) => Promise<void>;
    mudarIcone: (pastaId: string, icone: string | null) => Promise<void>;
    excluirPasta: (pastaId: string) => Promise<{ error: string } | null>;
    criarFluxo: (pastaId: string, titulo: string) => Promise<Resultado>;
    salvarVersao: (entrada: EntradaDaVersao) => Promise<ResultadoDaVersao>;
    excluirFluxo: (fluxoId: string) => Promise<{ error: string } | null>;
    excluirAnexo: (anexoId: string) => Promise<{ error: string } | null>;
  };
};

/**
 * O Repositório de fluxos (10/11/2026, pedido do Kauan): a árvore de pastas e
 * fluxos à esquerda, como a dos manuais, e o fluxo aberto à direita — para
 * ler (desenho com a etapa ao lado) ou para editar (a lista que vira
 * desenho). No celular a árvore vai em cima, com teto de altura, e o fluxo
 * embaixo.
 *
 * O fluxo aberto vem do endereço (`?fluxo=`): a página só carrega a lista de
 * etapas dele, e não a de todos.
 */
export function RepositorioDeFluxos({
  setor,
  setorRotulo,
  rotulosDosSetores,
  comSetorNoEndereco,
  pastas,
  aberto,
  versaoAberta,
  editarDeInicio,
  podeEditar,
  podeExcluir,
  pessoas,
  setores,
  telas,
  seletorDoSetor,
  acoes,
}: Props) {
  const router = useRouter();
  const { dialog, requestConfirm } = useConfirm();
  const [, startTransition] = useTransition();
  const [editando, setEditando] = useState<string | null>(editarDeInicio && aberto && podeEditar ? aberto.id : null);
  const [sujo, setSujo] = useState(false);
  const [busca, setBusca] = useState("");
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [expandidas, setExpandidas] = useState<Set<string>>(() => new Set(aberto ? [aberto.pastaId] : pastas[0] ? [pastas[0].id] : []));

  // A pasta criada agora chega aberta na árvore (como nos manuais).
  const [conhecidas, setConhecidas] = useState(() => new Set(pastas.map((p) => p.id)));
  const novas = pastas.filter((p) => !conhecidas.has(p.id));
  if (novas.length > 0) {
    setConhecidas(new Set(pastas.map((p) => p.id)));
    setExpandidas((prev) => new Set([...prev, ...novas.map((p) => p.id)]));
  }
  // O fluxo aberto por endereço tem a pasta dele aberta.
  const [pastaVista, setPastaVista] = useState(aberto?.pastaId ?? null);
  if (aberto && aberto.pastaId !== pastaVista) {
    setPastaVista(aberto.pastaId);
    setExpandidas((prev) => new Set([...prev, aberto.pastaId]));
  }

  // A área de trabalho continua montada de um fluxo para outro (só o endereço
  // muda): o fluxo recém-criado, que chega com `?editar=1`, abre na edição.
  const pedidoDeEdicao = editarDeInicio && aberto && podeEditar ? aberto.id : null;
  const [ultimoPedido, setUltimoPedido] = useState(pedidoDeEdicao);
  if (pedidoDeEdicao !== ultimoPedido) {
    setUltimoPedido(pedidoDeEdicao);
    if (pedidoDeEdicao) setEditando(pedidoDeEdicao);
  }

  // O `?editar=1` serve uma vez: depois de abrir a edição, sai do endereço (recarregar não reabre).
  useEffect(() => {
    if (!pedidoDeEdicao) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("editar");
    window.history.replaceState(null, "", url);
  }, [pedidoDeEdicao]);

  const rotuloDoSetor = useMemo(() => (codigo: string) => rotulosDosSetores[codigo] ?? codigo, [rotulosDosSetores]);
  const endereco = (fluxoId: string | null, versao?: number | null, editar = false) => {
    const q = new URLSearchParams();
    if (comSetorNoEndereco) q.set("setor", setor);
    if (fluxoId) q.set("fluxo", fluxoId);
    if (versao) q.set("versao", String(versao));
    if (editar) q.set("editar", "1");
    const s = q.toString();
    return s ? `/fluxos?${s}` : "/fluxos";
  };

  /** Ir para outro fluxo por código (depois de criar): com edição não salva, pergunta antes. */
  function irPara(href: string) {
    if (!sujo) return router.push(href);
    requestConfirm({ title: "Sair sem salvar?", description: "As mudanças do fluxo em edição ainda não viraram uma versão e serão perdidas.", confirmLabel: "Sair sem salvar", destructive: true }, async () => {
      setSujo(false);
      router.push(href);
      return null;
    });
  }

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const arvore = termo
    ? pastas.map((p) => ({ ...p, fluxos: p.fluxos.filter((f) => f.titulo.toLocaleLowerCase("pt-BR").includes(termo)) })).filter((p) => p.fluxos.length > 0 || p.titulo.toLocaleLowerCase("pt-BR").includes(termo))
    : pastas;

  function alternar(id: string) {
    setExpandidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function renomear(pastaId: string) {
    const titulo = nomeNovo.trim();
    setRenomeando(null);
    if (titulo) startTransition(() => acoes.renomearPasta(pastaId, titulo));
  }

  function excluirPasta(p: PastaDaArvore) {
    requestConfirm(
      {
        title: `Excluir a pasta “${p.titulo}”?`,
        description: p.fluxos.length > 0 ? `Isso remove ${p.fluxos.length === 1 ? "o fluxo" : `os ${p.fluxos.length} fluxos`} dela, com as versões e os arquivos. Esta ação não pode ser desfeita.` : "Esta ação não pode ser desfeita.",
        destructive: true,
        confirmLabel: "Excluir",
      },
      async () => {
        const r = await acoes.excluirPasta(p.id);
        if (r) return r;
        if (aberto && p.fluxos.some((f) => f.id === aberto.id)) router.push(endereco(null));
        return null;
      }
    );
  }

  function excluirFluxo(f: FluxoAberto) {
    requestConfirm(
      { title: `Excluir o fluxo “${f.titulo}”?`, description: "Saem junto as versões e os arquivos anexados. Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" },
      async () => {
        const r = await acoes.excluirFluxo(f.id);
        if (r) return r;
        router.push(endereco(null));
        return null;
      }
    );
  }

  const listaDePastas = pastas.map((p) => ({ id: p.id, titulo: p.titulo }));
  const emEdicao = !!aberto && editando === aberto.id && !versaoAberta;
  const aoCriarFluxo = (id: string) => irPara(endereco(id, null, true));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* O cabeçalho mora aqui, e não na página: o "Novo fluxo" confere a edição não salva antes de sair dela. */}
      <div className="flex-shrink-0">
        <PageHeader
          title="Repositório de fluxos"
          subtitle={`Os fluxogramas e as metodologias de ${setorRotulo}: o setor escreve as etapas em lista, e o Connect desenha.`}
          action={podeEditar && pastas.length > 0 ? <NovoFluxo noCabecalho pastas={listaDePastas} pastaInicial={aberto?.pastaId} action={acoes.criarFluxo} aoCriar={aoCriarFluxo} /> : undefined}
        />
        {seletorDoSetor}
      </div>

      {/* h-full, sem altura em vh: a página reserva exatamente o espaço que sobra, e as rolagens são as de dentro (como nos manuais). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xs md:flex-row">
        <nav aria-label="Pastas e fluxos" className="flex max-h-[40%] w-full flex-shrink-0 flex-col border-b border-border p-3 md:max-h-none md:w-72 md:border-r md:border-b-0">
          {pastas.some((p) => p.fluxos.length > 0) && (
            <Input compact value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fluxo" aria-label="Buscar fluxo pelo nome" className="mb-2 flex-shrink-0" />
          )}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
            {arvore.map((p) => {
              const aberta = termo ? true : expandidas.has(p.id);
              return (
                <div key={p.id}>
                  <div className="group flex items-center gap-1">
                    <Button variant="linkMuted" className="flex-shrink-0 p-0.5 max-md:size-11" onClick={() => alternar(p.id)} aria-label={aberta ? `Recolher ${p.titulo}` : `Expandir ${p.titulo}`} aria-expanded={aberta}>
                      {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </Button>
                    <div className="relative flex-shrink-0">
                      {podeEditar ? (
                        <Popover
                          width={240}
                          aria-label="Ícone da pasta"
                          trigger={({ toggle }) => (
                            <button type="button" onClick={toggle} className="flex size-7 items-center justify-center rounded-md text-label leading-none hover:bg-surface-hover" title="Escolher ícone" aria-label={`Escolher ícone da pasta ${p.titulo}`}>
                              {p.icone ?? <Folder size={14} className="text-fg-muted" />}
                            </button>
                          )}
                        >
                          {({ close }) => <IconPicker value={p.icone} onChange={(icone) => startTransition(() => acoes.mudarIcone(p.id, icone))} onClose={close} />}
                        </Popover>
                      ) : (
                        <span className="flex size-7 items-center justify-center text-label leading-none">{p.icone ?? <Folder size={14} className="text-fg-muted" />}</span>
                      )}
                    </div>
                    {renomeando === p.id ? (
                      <Input
                        autoFocus
                        value={nomeNovo}
                        maxLength={160}
                        aria-label="Nome da pasta"
                        onChange={(e) => setNomeNovo(e.target.value)}
                        onBlur={() => renomear(p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renomear(p.id);
                          if (e.key === "Escape") setRenomeando(null);
                        }}
                        className="!h-7 min-w-0 flex-1 px-2 text-ui"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (podeEditar) {
                            setRenomeando(p.id);
                            setNomeNovo(p.titulo);
                          } else alternar(p.id);
                        }}
                        className="min-w-0 flex-1 truncate py-1 text-left text-ui font-medium text-fg max-md:min-h-11"
                        title={podeEditar ? "Clique para renomear" : p.titulo}
                      >
                        {p.titulo}
                      </button>
                    )}
                    {podeExcluir && (
                      <button
                        type="button"
                        onClick={() => excluirPasta(p)}
                        className="inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-opacity hover:bg-surface-hover hover:text-danger max-md:size-11 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                        aria-label={`Excluir a pasta ${p.titulo}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>

                  {aberta && (
                    <div className="ml-6 space-y-0.5">
                      {p.fluxos.map((f) => {
                        const ativo = aberto?.id === f.id;
                        return (
                          <Link
                            key={f.id}
                            href={endereco(f.id)}
                            aria-current={ativo ? "page" : undefined}
                            className={`flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-fs-2 transition-colors max-md:min-h-11 ${ativo ? "bg-brand-subtle font-medium text-brand" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"}`}
                          >
                            <Workflow size={12} className="flex-shrink-0" aria-hidden />
                            <span className="truncate">{f.titulo}</span>
                          </Link>
                        );
                      })}
                      {p.fluxos.length === 0 && !termo && <p className="px-2 py-1 text-fs-2 text-fg-muted">Nenhum fluxo nesta pasta.</p>}
                      {podeEditar && !termo && <NovoFluxo pastas={listaDePastas} pastaInicial={p.id} action={acoes.criarFluxo} aoCriar={aoCriarFluxo} />}
                    </div>
                  )}
                </div>
              );
            })}
            {termo && arvore.length === 0 && <p className="px-2 py-1 text-fs-2 text-fg-muted">Nenhum fluxo com “{busca.trim()}”.</p>}
          </div>
          {podeEditar && (
            <div className="mt-2 flex-shrink-0 border-t border-border pt-2">
              <NovaPastaDeFluxos action={acoes.criarPasta} />
            </div>
          )}
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">
            {aberto ? (
              emEdicao ? (
                <EditorDoFluxo
                  key={aberto.id}
                  fluxo={aberto}
                  pessoas={pessoas}
                  setores={setores}
                  telas={telas}
                  setorDaTela={setor}
                  rotuloDoSetor={rotuloDoSetor}
                  salvarAction={acoes.salvarVersao}
                  aoSair={() => setEditando(null)}
                  aoMudarSujo={setSujo}
                />
              ) : (
                <LeituraDoFluxo
                  key={`${aberto.id}-${versaoAberta?.versao ?? "vigente"}`}
                  fluxo={aberto}
                  versaoAberta={versaoAberta}
                  setorRotulo={setorRotulo}
                  rotuloDoSetor={rotuloDoSetor}
                  podeEditar={podeEditar}
                  podeExcluir={podeExcluir}
                  enderecoDaVersao={(v) => endereco(aberto.id, v)}
                  aoEditar={() => setEditando(aberto.id)}
                  aoExcluir={() => excluirFluxo(aberto)}
                  excluirAnexoAction={acoes.excluirAnexo}
                />
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                <EmptyState
                  icon={<Workflow />}
                  title={pastas.length === 0 ? "Nenhum fluxo ainda" : "Nenhum fluxo aberto"}
                  description={
                    pastas.length === 0
                      ? podeEditar
                        ? "Comece por uma pasta para o processo (ex.: “Admissão”), no pé da coluna. Dentro dela, “+ Fluxo” abre um fluxo já com o Início e o Fim: é só escrever as etapas na ordem, e o desenho se monta sozinho."
                        : `Peça à coordenação de ${setorRotulo} para criar o primeiro fluxo.`
                      : "Escolha um fluxo na coluna ao lado, ou crie um com “+ Fluxo” dentro de uma pasta."
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {dialog}
    </div>
  );
}
