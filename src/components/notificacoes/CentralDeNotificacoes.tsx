"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Bell, EyeOff, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Contador } from "@/components/ui/Contador";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { CartaoDeNotificacao, IconeDaNotificacao } from "@/components/notificacoes/CartaoDeNotificacao";
import { AbasDasNotificacoes } from "@/components/notificacoes/AbasDasNotificacoes";
import { PreferenciasDasAbas } from "@/components/notificacoes/PreferenciasDasAbas";
import {
  arquivarLidas,
  arquivarNotificacoes,
  listarNotificacoes,
  marcarLidas,
  marcarTodasLidas,
  removerNotificacoes,
} from "@/app/(app)/notificacoes/actions";
import { ABAS, type AbaOuTodas, type IconeDaNotificacao as Icone, type Tom } from "@/lib/notificacoes/catalogo";
import type { FiltrosDasNotificacoes, NotificacaoNaTela } from "@/lib/notificacoes/consultas";
import { chaveDoDia, grupoDoDia, hora } from "@/lib/notificacoes/tempo";

// A central de notificações (02/10/2026, referências do Searcheye e da
// Biometrid): abas por natureza e preferências à esquerda; à direita, a linha
// do tempo agrupada por dia, com seleção múltipla e "carregar mais". O filtro
// mora na URL (?aba=&status=&q=), para voltar e compartilhar.
//
// Segunda leva (05/10/2026): a caixa das arquivadas (?arquivadas=1), "Arquivar
// as lidas" e o que cada aba mostra — com o aviso de quantos tipos estão
// ocultos, para nada sumir sem a pessoa saber.

type Filtros = Pick<FiltrosDasNotificacoes, "aba" | "status" | "q"> & { arquivadas: boolean };
type Contagens = Record<AbaOuTodas, number>;

const ICONE_DA_ABA: Record<AbaOuTodas, { icone: Icone; tom: Tom }> = {
  todas: { icone: "sino", tom: "brand" },
  para_mim: { icone: "mencao", tom: "brand" },
  clientes: { icone: "mensagem", tom: "info" },
  alertas: { icone: "prazo", tom: "warning" },
};
const ICONE_DAS_ARQUIVADAS: { icone: Icone; tom: Tom } = { icone: "arquivo", tom: "neutral" };

function urlDe(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.arquivadas) p.set("arquivadas", "1");
  else {
    if (f.aba !== "todas") p.set("aba", f.aba);
    if (f.status !== "todas") p.set("status", f.status);
  }
  if (f.q.trim()) p.set("q", f.q.trim());
  const qs = p.toString();
  return qs ? `/notificacoes?${qs}` : "/notificacoes";
}

export function CentralDeNotificacoes({
  filtros,
  inicial,
  contagens,
  ocultos,
  abrirPreferencias = false,
  preferencias,
}: {
  filtros: Filtros;
  inicial: { itens: NotificacaoNaTela[]; proximoCursor: string | null };
  contagens: Contagens;
  /** Os tipos que a pessoa desligou nas preferências. */
  ocultos: string[];
  /** Veio do atalho "Ajustar" do sino ou das configurações: abre já com as preferências. */
  abrirPreferencias?: boolean;
  /** O interruptor de push, renderizado no servidor. */
  preferencias: React.ReactNode;
}) {
  const router = useRouter();
  const [itens, setItens] = useState(inicial.itens);
  const [cursor, setCursor] = useState(inicial.proximoCursor);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState(filtros.q);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [prefsAbertas, setPrefsAbertas] = useState(abrirPreferencias);
  const [pendente, comecar] = useTransition();

  const irPara = (parcial: Partial<Filtros>) => router.replace(urlDe({ ...filtros, ...parcial }), { scroll: false });
  const aba = ABAS.find((a) => a.chave === filtros.aba) ?? ABAS[0];
  const cabecalho = filtros.arquivadas
    ? { rotulo: "Arquivadas", descricao: "O que você arquivou, de todas as abas. Desarquive para voltar às abas.", ...ICONE_DAS_ARQUIVADAS }
    : { rotulo: aba.rotulo, descricao: aba.descricao, ...ICONE_DA_ABA[filtros.aba] };

  async function carregarMais() {
    if (!cursor) return;
    setCarregandoMais(true);
    try {
      const r = await listarNotificacoes({ ...filtros, cursor });
      setItens((atual) => [...atual, ...r.itens.filter((n) => !atual.some((a) => a.id === n.id))]);
      setCursor(r.proximoCursor);
    } finally {
      setCarregandoMais(false);
    }
  }

  function mudarLidas(ids: string[], lida: boolean) {
    setItens((atual) => atual.map((n) => (ids.includes(n.id) ? { ...n, lida } : n)));
    comecar(async () => {
      await marcarLidas(ids, lida);
      router.refresh();
    });
  }

  /** Tira da lista atual — remover, arquivar e desarquivar fazem a notificação sair desta vista. */
  function tirarDaLista(ids: string[]) {
    setItens((atual) => atual.filter((n) => !ids.includes(n.id)));
    setSelecionadas((s) => new Set([...s].filter((id) => !ids.includes(id))));
  }

  function remover(ids: string[]) {
    tirarDaLista(ids);
    comecar(async () => {
      await removerNotificacoes(ids);
      router.refresh();
    });
  }

  function arquivar(ids: string[], guardar: boolean) {
    tirarDaLista(ids);
    comecar(async () => {
      await arquivarNotificacoes(ids, guardar);
      router.refresh();
    });
  }

  function arquivarAsLidas() {
    setItens((atual) => atual.filter((n) => !n.lida));
    setSelecionadas(new Set());
    comecar(async () => {
      await arquivarLidas(filtros.aba);
      router.refresh();
    });
  }

  function marcarTodas() {
    setItens((atual) => atual.map((n) => ({ ...n, lida: true })));
    comecar(async () => {
      await marcarTodasLidas(filtros.aba);
      router.refresh();
    });
  }

  async function abrir(n: NotificacaoNaTela) {
    if (!n.lida) await marcarLidas([n.id]);
    if (n.href) router.push(n.href);
    else {
      setItens((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      router.refresh();
    }
  }

  const ids = [...selecionadas];
  const todasMarcadas = itens.length > 0 && itens.every((n) => selecionadas.has(n.id));
  const grupos = agruparPorDia(itens);
  const temLidas = itens.some((n) => n.lida);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
      {/* ── Esquerda: busca, abas e preferências ── */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            irPara({ q: busca });
          }}
        >
          <Input
            icon={<Search />}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nas notificações…"
            aria-label="Buscar nas notificações"
          />
        </form>

        <div className="lg:hidden flex flex-col gap-2">
          <AbasDasNotificacoes
            ativa={filtros.arquivadas ? null : filtros.aba}
            contagens={contagens}
            onEscolher={(a) => irPara({ aba: a, arquivadas: false })}
          />
          <Button
            size="sm"
            variant={filtros.arquivadas ? "secondary" : "ghost"}
            className="self-start"
            onClick={() => irPara({ arquivadas: !filtros.arquivadas })}
          >
            <Archive size={14} /> {filtros.arquivadas ? "Voltar às abas" : "Arquivadas"}
          </Button>
        </div>
        <nav aria-label="Tipos de notificação" className="hidden lg:flex flex-col gap-0.5">
          {ABAS.map((a) => {
            const ativa = !filtros.arquivadas && a.chave === filtros.aba;
            const n = contagens[a.chave];
            return (
              <button
                key={a.chave}
                type="button"
                aria-current={ativa ? "page" : undefined}
                onClick={() => irPara({ aba: a.chave, arquivadas: false })}
                className={`flex items-center gap-2.5 h-10 px-2.5 rounded-lg text-left text-fs-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  ativa ? "bg-surface-elevated text-fg font-semibold shadow-[var(--c41-shadow-xs)] border border-border" : "text-fg-secondary hover:bg-surface-hover"
                }`}
              >
                <IconeDaNotificacao icone={ICONE_DA_ABA[a.chave].icone} tom={ICONE_DA_ABA[a.chave].tom} tamanho={26} />
                <span className="flex-1">{a.rotulo}</span>
                {n > 0 && <Contador valor={n} tom="cheio" />}
              </button>
            );
          })}
          <button
            type="button"
            aria-current={filtros.arquivadas ? "page" : undefined}
            onClick={() => irPara({ arquivadas: true })}
            className={`mt-1.5 flex items-center gap-2.5 h-10 px-2.5 rounded-lg text-left text-fs-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              filtros.arquivadas ? "bg-surface-elevated text-fg font-semibold shadow-[var(--c41-shadow-xs)] border border-border" : "text-fg-secondary hover:bg-surface-hover"
            }`}
          >
            <IconeDaNotificacao icone={ICONE_DAS_ARQUIVADAS.icone} tom={ICONE_DAS_ARQUIVADAS.tom} tamanho={26} />
            <span className="flex-1">Arquivadas</span>
          </button>
        </nav>

        <div className="border-t border-border pt-4 flex flex-col gap-3">
          <p className="px-1 text-fs-1 font-semibold uppercase tracking-[0.04em] text-fg-muted">Preferências</p>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setPrefsAbertas(true)}>
            <SlidersHorizontal size={14} /> O que cada aba mostra
          </Button>
          {preferencias}
        </div>
      </aside>

      {/* ── Direita: a linha do tempo ── */}
      <section className="min-w-0 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)]">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <IconeDaNotificacao icone={cabecalho.icone} tom={cabecalho.tom} />
            <div className="min-w-0">
              <h2 className="text-card-title font-semibold text-fg">{cabecalho.rotulo}</h2>
              <p className="text-fs-2 text-fg-muted">{cabecalho.descricao}</p>
            </div>
          </div>
          {!filtros.arquivadas && (
            <SegmentedControl
              label="Mostrar"
              active={filtros.status}
              items={[
                { key: "nao_lidas", label: `Não lidas${contagens[filtros.aba] ? ` (${contagens[filtros.aba]})` : ""}`, href: urlDe({ ...filtros, status: "nao_lidas" }) },
                { key: "todas", label: "Todas", href: urlDe({ ...filtros, status: "todas" }) },
              ]}
            />
          )}
        </header>

        {/* Nada some sem a pessoa saber: o que ela desligou fica dito aqui, com o atalho de volta. */}
        {!filtros.arquivadas && ocultos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-2 border-b border-border text-fs-2 text-fg-secondary">
            <span className="inline-flex items-center gap-1.5">
              <EyeOff size={13} className="text-fg-muted" />
              {ocultos.length} tipo{ocultos.length === 1 ? "" : "s"} de notificação oculto{ocultos.length === 1 ? "" : "s"} nas abas.
            </span>
            <Button size="xs" variant="ghost" onClick={() => setPrefsAbertas(true)}>
              Ajustar
            </Button>
          </div>
        )}

        {itens.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 border-b border-border bg-surface-2/40">
            <Checkbox
              checked={todasMarcadas}
              onChange={(e) => setSelecionadas(e.target.checked ? new Set(itens.map((n) => n.id)) : new Set())}
              label={selecionadas.size > 0 ? `${selecionadas.size} selecionada${selecionadas.size === 1 ? "" : "s"}` : "Selecionar todas"}
            />
            {selecionadas.size > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {filtros.arquivadas ? (
                  <Button size="sm" variant="secondary" disabled={pendente} onClick={() => arquivar(ids, false)}>
                    Desarquivar
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="secondary" disabled={pendente} onClick={() => mudarLidas(ids, true)}>
                      Marcar como lidas
                    </Button>
                    <Button size="sm" variant="secondary" disabled={pendente} onClick={() => mudarLidas(ids, false)}>
                      Marcar como não lidas
                    </Button>
                    <Button size="sm" variant="secondary" disabled={pendente} onClick={() => arquivar(ids, true)}>
                      Arquivar
                    </Button>
                  </>
                )}
                <Button size="sm" variant="danger" disabled={pendente} onClick={() => remover(ids)}>
                  Remover
                </Button>
              </div>
            ) : (
              !filtros.arquivadas && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Revisão de 05/10: botão não é link — era texto azul sublinhado. */}
                  {contagens[filtros.aba] > 0 && (
                    <Button size="sm" variant="secondary" onClick={marcarTodas} disabled={pendente}>
                      Marcar todas como lidas
                    </Button>
                  )}
                  {temLidas && (
                    <Button size="sm" variant="secondary" onClick={arquivarAsLidas} disabled={pendente}>
                      <Archive size={14} /> Arquivar as lidas
                    </Button>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {itens.length === 0 ? (
          <div className="py-10">
            {filtros.arquivadas ? (
              <EmptyState
                icon={<Archive />}
                title={filtros.q ? `Nada encontrado para “${filtros.q}”` : "Nenhuma arquivada"}
                description="Arquive o que já resolveu: sai do sino e das abas sem ser apagado."
              />
            ) : (
              <EmptyState
                icon={<Bell />}
                title={filtros.q ? `Nada encontrado para “${filtros.q}”` : "Nada por aqui"}
                description={filtros.status === "nao_lidas" ? "Nenhuma não lida nesta aba." : "Quando chegar algo desta aba, aparece aqui."}
              />
            )}
          </div>
        ) : (
          <div className="px-3 sm:px-5 py-4 flex flex-col gap-6">
            {grupos.map((g) => (
              <div key={g.chave}>
                <p className="mb-2 text-fs-2 font-semibold text-fg-muted">{g.titulo}</p>
                <ol className="flex flex-col">
                  {g.itens.map((n) => (
                    <li key={n.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-2">
                      <span className="pt-3.5 text-right text-fs-2 text-fg-muted tabular-nums">{hora(new Date(n.criadaEm))}</span>
                      <div className="relative pl-3 border-l border-border">
                        <span aria-hidden className={`absolute -left-[4.5px] top-[18px] size-2 rounded-full ${n.lida ? "bg-border-strong" : "bg-brand"}`} />
                        <CartaoDeNotificacao
                          n={n}
                          semTempo
                          onAbrir={(x) => void abrir(x)}
                          onAlternarLida={(x) => mudarLidas([x.id], !x.lida)}
                          onArquivar={(x) => arquivar([x.id], !x.arquivada)}
                          onRemover={(x) => remover([x.id])}
                          selecao={{
                            marcada: selecionadas.has(n.id),
                            onMudar: (marcada) =>
                              setSelecionadas((s) => {
                                const novo = new Set(s);
                                if (marcada) novo.add(n.id);
                                else novo.delete(n.id);
                                return novo;
                              }),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {cursor && (
              <div className="flex justify-center">
                <Button variant="secondary" size="sm" onClick={() => void carregarMais()} loading={carregandoMais} loadingLabel="Carregando…">
                  Carregar mais
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      <PreferenciasDasAbas
        aberto={prefsAbertas}
        onFechar={() => {
          setPrefsAbertas(false);
          // Veio pelo atalho (?preferencias=abrir): tira da URL, para não reabrir ao recarregar.
          if (abrirPreferencias) router.replace(urlDe(filtros), { scroll: false });
        }}
        ocultos={ocultos}
        onSalvo={() => router.refresh()}
      />
    </div>
  );
}

function agruparPorDia(itens: NotificacaoNaTela[]): { chave: string; titulo: string; itens: NotificacaoNaTela[] }[] {
  const grupos: { chave: string; titulo: string; itens: NotificacaoNaTela[] }[] = [];
  const agora = new Date();
  for (const n of itens) {
    const quando = new Date(n.criadaEm);
    const chave = chaveDoDia(quando);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.chave === chave) ultimo.itens.push(n);
    else grupos.push({ chave, titulo: grupoDoDia(quando, agora), itens: [n] });
  }
  return grupos;
}
