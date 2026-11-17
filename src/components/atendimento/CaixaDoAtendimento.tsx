"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, MessageCircle } from "lucide-react";
import { CaixaDeConversas, Iniciais, PainelVazio } from "@/components/conversas/caixa/Caixa";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { quandoCurto } from "@/lib/conversas/caixa";
import { horaDeAtualizar } from "@/lib/whatsapp/caixa";
import { marcaDoAtendimentoAction } from "@/app/(app)/atendimento/contagem-actions";
import type { CartaoDaLista, ListaDoAtendimento } from "@/lib/atendimento/consultas";
import { ROTULO_DA_SITUACAO, ROTULO_DO_RECORTE, noRecorte, recorteValido, type Recorte } from "@/lib/atendimento/regras";

type Valor = ListaDoAtendimento & { recorte: Recorte; abertaId: string | null; hrefDoCiclo: (id: string) => string; hrefDaLista: string };
const Contexto = createContext<Valor | null>(null);

export function useCaixaDoAtendimento(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("Fora da caixa do Atendimento.");
  return v;
}

const CHAVE_DA_LISTA = "atendimento:lista-recolhida";
const ouvintesDaLista = new Set<() => void>();
function assinarLista(avisar: () => void) {
  ouvintesDaLista.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    ouvintesDaLista.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}
function lerLista(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DA_LISTA) === "1";
  } catch {
    return false;
  }
}

/**
 * A caixa do Atendimento, no layout de /atendimento. Como no WhatsApp do
 * Recrutamento, a lista não remonta ao abrir outra conversa: só o painel da
 * direita (a página) muda, e trocar de recorte é só a URL.
 *
 * Fila em tabela desde 17/11/2026 (melhoria-728, protótipo aprovado pelo
 * Victor): Cliente, Situação, Última mensagem, Desde e as novas no fim da
 * linha; as conversas com a pessoa no topo, em destaque. A lista recolhe numa
 * faixa estreita pela alça da borda, a mesma do menu lateral, e a escolha fica
 * guardada neste navegador.
 */
export function CaixaDoAtendimento({ dados, cabecalho, children }: { dados: ListaDoAtendimento; cabecalho: ReactNode; children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const abertaId = typeof params.id === "string" ? params.id : null;
  const recorte = recorteValido(useSearchParams().get("ver"), dados.recortes);
  // Lida como loja externa: o servidor desenha a lista aberta, e o navegador
  // traz a escolha guardada sem um efeito a mais (o mesmo jeito da FaixaDoFoco).
  const recolhida = useSyncExternalStore(assinarLista, () => lerLista(), () => false);
  function alternarLista(v: boolean) {
    try {
      window.localStorage.setItem(CHAVE_DA_LISTA, v ? "1" : "0");
    } catch {
      // Sem armazenamento (janela anônima): vale só até recarregar.
    }
    for (const avisar of ouvintesDaLista) avisar();
  }

  const valor = useMemo<Valor>(() => {
    const sufixo = recorte === dados.recortes[0] ? "" : `?ver=${recorte}`;
    return {
      ...dados,
      recorte,
      abertaId,
      hrefDoCiclo: (id) => `/atendimento/${id}${sufixo}`,
      hrefDaLista: `/atendimento${sufixo}`,
    };
  }, [dados, recorte, abertaId]);

  useAtualizacaoPeriodica();

  return (
    <Contexto.Provider value={valor}>
      <div className={abertaId ? "hidden lg:block" : undefined}>{cabecalho}</div>
      <CaixaDeConversas
        aberta={!!abertaId}
        listaRecolhida={recolhida}
        colunasDaLista="lg:grid-cols-[minmax(420px,600px)_minmax(0,1fr)]"
        lista={
          <>
            {recolhida ? <FaixaDaLista /> : <ListaDoAtendimentoNaCaixa />}
            <AlcaDaLista recolhida={recolhida} aoAlternar={() => alternarLista(!recolhida)} />
          </>
        }
        painel={children}
      />
    </Contexto.Provider>
  );
}

/** A cada quantos ms a tela confere a marca da caixa (só com a aba visível). */
const CONFERIR_A_CADA_MS = 5_000;

/**
 * A lista e a conversa aberta se atualizam sozinhas. A cada 5 s (aba visível),
 * uma consulta barata diz se chegou mensagem ou se algum atendimento mudou de
 * situação; só então a tela recarrega. Além disso, recarrega a cada 30 s, para
 * o que a marca não pega (nome do contato, responsável trocado no mesmo setor).
 */
function useAtualizacaoPeriodica() {
  const router = useRouter();
  useEffect(() => {
    let ultimaEm = Date.now();
    let marca: string | null = null;
    let conferindo = false;
    function recarregar() {
      ultimaEm = Date.now();
      router.refresh();
    }
    async function conferir() {
      if (document.visibilityState !== "visible" || conferindo) return;
      conferindo = true;
      try {
        const nova = await marcaDoAtendimentoAction();
        if (nova && marca !== null && nova !== marca) recarregar();
        if (nova) marca = nova;
      } catch {
        // Sem rede por um instante: a próxima conferência tenta de novo.
      } finally {
        conferindo = false;
      }
      if (horaDeAtualizar(ultimaEm, Date.now(), document.visibilityState === "visible")) recarregar();
    }
    void conferir();
    const intervalo = window.setInterval(conferir, CONFERIR_A_CADA_MS);
    document.addEventListener("visibilitychange", conferir);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", conferir);
    };
  }, [router]);
}

/**
 * A alça na borda da lista (17/11/2026, melhoria-728): a mesma do menu lateral
 * do Connect (melhoria-697), um traço que vira seta ao passar o mouse. Só no
 * computador: no celular a lista e a conversa já se revezam na tela.
 */
function AlcaDaLista({ recolhida, aoAlternar }: { recolhida: boolean; aoAlternar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAlternar}
      aria-label={recolhida ? "Mostrar a lista de conversas" : "Recolher a lista de conversas"}
      data-dica={recolhida ? "Mostrar a lista" : "Recolher a lista"}
      aria-expanded={!recolhida}
      className="group/alca hidden lg:grid absolute -right-1.5 top-1/2 z-20 translate-x-1/2 -translate-y-1/2 place-items-center h-9 w-1.5 rounded-full bg-brand opacity-55 text-on-brand cursor-pointer transition-[width,border-radius,opacity,background-color] duration-150 motion-reduce:transition-none before:absolute before:-inset-x-2.5 before:-inset-y-1 before:content-[''] hover:w-6 hover:rounded-lg hover:opacity-100 hover:bg-brand-solid focus-visible:w-6 focus-visible:rounded-lg focus-visible:opacity-100 focus-visible:bg-brand-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <ChevronLeft
        size={14}
        strokeWidth={2.6}
        aria-hidden
        className={`opacity-0 transition-[opacity,rotate] duration-150 motion-reduce:transition-none group-hover/alca:opacity-100 group-focus-visible/alca:opacity-100 ${recolhida ? "rotate-180" : ""}`}
      />
    </button>
  );
}

const TOM_DA_SITUACAO: Record<CartaoDaLista["situacao"], TomDoSelo> = {
  TRIAGEM: "atencao",
  NO_SETOR: "perigo",
  EM_ATENDIMENTO: "marca",
  AGUARDANDO_CLIENTE: "neutro",
  ENCERRADO: "sucesso",
};

/** O selo da linha: a situação, ou o que pede atenção agora (passada para você, pedido). */
function seloDo(c: CartaoDaLista): { tom: TomDoSelo; texto: string } {
  if (c.transferidaParaMim) return { tom: "marca", texto: "Passada para você" };
  if (c.pedidoPendente) return { tom: "atencao", texto: "Pedido" };
  return { tom: TOM_DA_SITUACAO[c.situacao], texto: ROTULO_DA_SITUACAO[c.situacao] };
}

/** A linha de apoio do cliente: quem é, e com quem está. */
function apoioDo(c: CartaoDaLista, geral: boolean): string {
  const partes: string[] = [];
  if (c.subtitulo) partes.push(c.subtitulo);
  else if (c.tipoContato === "DESCONHECIDO") partes.push("Contato novo");
  else if (c.tipoContato === "NOVO") partes.push("Ainda não é cliente");
  if (geral && c.setor) partes.push(c.setor.label);
  if (c.responsavel) partes.push(c.responsavel);
  else if (c.transferidaPara && !c.transferidaParaMim) partes.push(`passada para ${c.transferidaPara}`);
  return partes.join(" · ");
}

/** A conversa é de quem está vendo: com ela, ou passada para ela esperando que assuma. */
const ehMinha = (c: CartaoDaLista, userId: string) => c.assignedToId === userId || c.transferidaParaMim;

const COLUNAS = "grid grid-cols-[4px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.3fr)_3.25rem_2.25rem] items-center gap-3";

function ListaDoAtendimentoNaCaixa() {
  const v = useCaixaDoAtendimento();
  const [busca, setBusca] = useState("");
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem, veTudo: v.veTudo };
  const geral = v.ehTriagem || v.veTudo;
  const doRecorte = v.cartoes.filter((c) => noRecorte(c, v.recorte, quem));
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? doRecorte.filter((c) => `${c.titulo} ${c.subtitulo ?? ""} ${c.previa}`.toLowerCase().includes(termo)) : doRecorte;
  // As da pessoa sobem para o topo, num grupo próprio; a passada para ela vem primeiro.
  const minhas = visiveis.filter((c) => ehMinha(c, v.userId)).sort((a, b) => Number(b.transferidaParaMim) - Number(a.transferidaParaMim));
  const outras = visiveis.filter((c) => !ehMinha(c, v.userId));
  const agora = new Date();
  const hrefDoRecorte = (r: Recorte) => {
    const q = r === v.recortes[0] ? "" : `?ver=${r}`;
    return v.abertaId ? `/atendimento/${v.abertaId}${q}` : `/atendimento${q}`;
  };

  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!v.abertaId) return;
    raiz.current?.querySelector(`[data-cartao="${CSS.escape(v.abertaId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [v.abertaId]);

  const linha = (c: CartaoDaLista) => {
    const selo = seloDo(c);
    const aberta = c.cicloId === v.abertaId;
    const novas = c.situacao !== "ENCERRADO" ? c.semResposta : 0;
    const cor = c.setor?.cor ?? v.triagem.cor;
    return (
      <Link
        key={c.cicloId}
        data-cartao={c.cicloId}
        href={v.hrefDoCiclo(c.cicloId)}
        scroll={false}
        aria-current={aberta ? "page" : undefined}
        className={`${COLUNAS} pr-3 py-2.5 border-b border-border-soft text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${
          aberta ? "bg-brand-subtle" : ehMinha(c, v.userId) ? "bg-[color-mix(in_srgb,var(--c41-grupo-atendimento)_7%,var(--c41-surface))] hover:bg-surface-hover" : "hover:bg-surface-hover"
        }`}
      >
        {geral ? (
          <span
            className="self-stretch rounded-r-sm"
            style={{ background: cor }}
            role="img"
            aria-label={c.setor ? `Setor: ${c.setor.label}` : `Na triagem (${v.triagem.label})`}
          />
        ) : (
          <span aria-hidden />
        )}
        <span className="min-w-0">
          <span className="block truncate text-ui font-semibold text-fg">{c.titulo}</span>
          <span className="block truncate text-micro text-fg-muted">{apoioDo(c, geral)}</span>
        </span>
        <span className="min-w-0">
          <Selo tom={selo.tom}>{selo.texto}</Selo>
        </span>
        <span className="min-w-0 truncate text-ui text-fg-secondary">{c.previa}</span>
        <span className="text-micro text-fg-muted tabular-nums">{quandoCurto(c.quando ? new Date(c.quando) : null, agora)}</span>
        <span className="flex justify-end">
          {novas > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-micro font-semibold tabular-nums grid place-items-center" aria-label={`${novas} esperando resposta`}>
              {novas > 99 ? "99+" : novas}
            </span>
          )}
        </span>
      </Link>
    );
  };

  const grupo = (texto: string, n: number, destaque = false) => (
    <p className={`px-3 pt-3 pb-1.5 text-micro font-semibold uppercase tracking-wide ${destaque ? "text-grupo-fg" : "text-fg-muted"}`}>
      {texto} · {n}
    </p>
  );

  return (
    <div ref={raiz} data-grupo="atendimento" className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-surface overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center gap-2 p-3">
        <CampoDeBusca compact value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, empresa ou mensagem" aria-label="Buscar conversa" className="flex-1 min-w-48" />
        <Select compact aria-label="Recorte" className="w-52 shrink-0" value={v.recorte} onChange={(e) => window.history.pushState(null, "", hrefDoRecorte(e.target.value as Recorte))}>
          {v.recortes.map((r) => (
            <option key={r} value={r}>
              {ROTULO_DO_RECORTE[r]} ({v.cartoes.filter((c) => noRecorte(c, r, quem)).length})
            </option>
          ))}
        </Select>
      </div>
      <div className={`${COLUNAS} shrink-0 pr-3 py-2 border-y border-border bg-surface-2 text-micro font-semibold uppercase tracking-wide text-fg-muted`} aria-hidden>
        <span />
        <span>Cliente</span>
        <span>Situação</span>
        <span>Última mensagem</span>
        <span>Desde</span>
        <span />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-y">
        {visiveis.length === 0 ? (
          <EmptyState
            icon={<MessageCircle />}
            title={termo ? "Nada com essa busca" : "Nada por aqui"}
            description={
              termo
                ? "Tente outro nome ou parte da mensagem."
                : v.recorte === "triagem"
                  ? "Quando um cliente escrever no WhatsApp do escritório, a conversa aparece aqui."
                  : "As conversas deste recorte aparecem aqui."
            }
          />
        ) : (
          <>
            {minhas.length > 0 && (
              <section aria-label="Com você">
                {grupo("Com você", minhas.length, true)}
                {minhas.map(linha)}
              </section>
            )}
            {outras.length > 0 && (
              <section aria-label={minhas.length > 0 ? "Outras conversas" : "Conversas"}>
                {minhas.length > 0 && grupo(geral ? "Fila" : "Do setor", outras.length)}
                {outras.map(linha)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A lista recolhida: só as iniciais, com a cor do setor e a marca de quem espera resposta. */
function FaixaDaLista() {
  const v = useCaixaDoAtendimento();
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem, veTudo: v.veTudo };
  const geral = v.ehTriagem || v.veTudo;
  const doRecorte = v.cartoes.filter((c) => noRecorte(c, v.recorte, quem));
  const visiveis = [...doRecorte.filter((c) => ehMinha(c, v.userId)), ...doRecorte.filter((c) => !ehMinha(c, v.userId))].slice(0, 40);
  return (
    <nav aria-label="Conversas recolhidas" className="flex-1 min-h-0 flex flex-col items-center gap-2 py-3 rounded-lg border border-border bg-surface">
      <div className="flex-1 min-h-0 overflow-y-auto scroll-y flex flex-col items-center gap-2 px-1">
        {visiveis.map((c) => (
          <Link
            key={c.cicloId}
            href={v.hrefDoCiclo(c.cicloId)}
            scroll={false}
            title={c.titulo}
            aria-label={`${c.titulo}${c.esperandoResposta ? ", esperando resposta" : ""}`}
            aria-current={c.cicloId === v.abertaId ? "page" : undefined}
            className={`relative rounded-md p-0.5 ${c.cicloId === v.abertaId ? "ring-2 ring-brand" : ehMinha(c, v.userId) ? "ring-2 ring-[var(--c41-grupo-atendimento)]" : "hover:bg-surface-hover"}`}
          >
            {geral && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm" style={{ background: c.setor?.cor ?? v.triagem.cor }} aria-hidden />}
            <Iniciais nome={c.tipoContato === "DESCONHECIDO" ? null : c.titulo} tamanho={32} />
            {c.esperandoResposta && c.situacao !== "ENCERRADO" && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-danger border-2 border-surface" aria-hidden />
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** O painel sem conversa escolhida. */
export function PainelSemConversa() {
  const v = useCaixaDoAtendimento();
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem, veTudo: v.veTudo };
  const esperando = v.recortes
    .filter((r) => r === "triagem" || r === "pedidos" || r === "sem_responsavel")
    .reduce((n, r) => n + v.cartoes.filter((c) => noRecorte(c, r, quem)).length, 0);
  return (
    <PainelVazio
      icone={<MessageCircle />}
      titulo="Escolha uma conversa"
      texto={
        esperando > 0
          ? `${esperando === 1 ? "1 conversa espera" : `${esperando} conversas esperam`} alguém assumir. Abra à esquerda para ver as mensagens.`
          : "Ninguém esperando agora. Abra uma conversa à esquerda para ver as mensagens e responder."
      }
    />
  );
}
