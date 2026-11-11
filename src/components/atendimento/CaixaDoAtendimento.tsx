"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CaixaDeConversas, CartaoDeConversa, ColunaDaLista, Iniciais, PainelVazio, RecortesDaCaixa } from "@/components/conversas/caixa/Caixa";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TomDoSelo } from "@/components/ui/Selo";
import { quandoCurto } from "@/lib/conversas/caixa";
import { ATUALIZAR_A_CADA_MS, horaDeAtualizar } from "@/lib/whatsapp/caixa";
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

/** Os recortes que ficam como abas; os outros viram links ao lado da busca. */
const SECUNDARIOS: readonly Recorte[] = ["do_setor", "encerradas"];

/**
 * A caixa do Atendimento, no layout de /atendimento. Como no WhatsApp do
 * Recrutamento, a lista não remonta ao abrir outra conversa: só o painel da
 * direita (a página) muda, e trocar de aba é só a URL.
 *
 * A lista pode ser recolhida numa faixa estreita (pedido do Victor, 10/11/2026),
 * e a escolha fica guardada neste navegador.
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
        lista={recolhida ? <FaixaDaLista aoAbrir={() => alternarLista(false)} /> : <ListaDoAtendimentoNaCaixa aoRecolher={() => alternarLista(true)} />}
        painel={children}
      />
    </Contexto.Provider>
  );
}

function useAtualizacaoPeriodica() {
  const router = useRouter();
  useEffect(() => {
    let ultimaEm = Date.now();
    function talvez() {
      const agora = Date.now();
      if (!horaDeAtualizar(ultimaEm, agora, document.visibilityState === "visible")) return;
      ultimaEm = agora;
      router.refresh();
    }
    const intervalo = window.setInterval(talvez, ATUALIZAR_A_CADA_MS / 3);
    document.addEventListener("visibilitychange", talvez);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", talvez);
    };
  }, [router]);
}

function seloDo(c: CartaoDaLista): { tom: TomDoSelo; texto: string } | null {
  if (c.pedidoPendente) return { tom: "atencao", texto: "Pedido" };
  if (c.tipoContato === "DESCONHECIDO") return { tom: "atencao", texto: "Contato novo" };
  if (c.tipoContato === "NOVO") return { tom: "marca", texto: "Ainda não é cliente" };
  return null;
}

function contextoDo(c: CartaoDaLista): string {
  const partes: string[] = [];
  if (c.situacao === "TRIAGEM") partes.push("Na triagem");
  else if (c.setor) partes.push(c.setor.label);
  if (c.responsavel) partes.push(c.responsavel);
  else if (c.situacao === "NO_SETOR") partes.push("sem responsável");
  if (c.situacao === "AGUARDANDO_CLIENTE" || c.situacao === "ENCERRADO") partes.push(ROTULO_DA_SITUACAO[c.situacao].toLowerCase());
  if (c.subtitulo) partes.unshift(c.subtitulo);
  return partes.join(" · ");
}

function ListaDoAtendimentoNaCaixa({ aoRecolher }: { aoRecolher: () => void }) {
  const v = useCaixaDoAtendimento();
  const [busca, setBusca] = useState("");
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem };
  const doRecorte = v.cartoes.filter((c) => noRecorte(c, v.recorte, quem));
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? doRecorte.filter((c) => `${c.titulo} ${c.subtitulo ?? ""} ${c.previa}`.toLowerCase().includes(termo)) : doRecorte;
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

  // No máximo três abas: com quatro e o número de cada uma, os rótulos já se
  // cortavam na coluna da lista ("Tria…", "Ped…"). O resto vai para o "Mais".
  const principais = v.recortes.filter((r) => !SECUNDARIOS.includes(r)).slice(0, 3);
  const secundarios = v.recortes.filter((r) => !principais.includes(r));
  const irPara = (r: Recorte) => window.history.pushState(null, "", hrefDoRecorte(r));

  const topo = (
    <>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <RecortesDaCaixa
            itens={principais.map((r) => ({
              rotulo: ROTULO_DO_RECORTE[r],
              n: v.cartoes.filter((c) => noRecorte(c, r, quem)).length,
              href: hrefDoRecorte(r),
              ativo: r === v.recorte,
              tom: r === "triagem" || r === "pedidos" || r === "sem_responsavel" ? "atencao" : undefined,
            }))}
            aoEscolher={(href) => window.history.pushState(null, "", href)}
          />
        </div>
        <button
          type="button"
          onClick={aoRecolher}
          className="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg shrink-0"
          aria-label="Recolher a lista de conversas"
          title="Recolher a lista"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <CampoDeBusca compact value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, empresa ou mensagem" aria-label="Buscar conversa" className="flex-1 min-w-0" />
        {secundarios.length > 0 && (
          <Select
            compact
            aria-label="Outros recortes"
            className="w-36 shrink-0"
            value={secundarios.includes(v.recorte) ? v.recorte : ""}
            onChange={(e) => e.target.value && irPara(e.target.value as Recorte)}
          >
            <option value="">Mais…</option>
            {secundarios.map((r) => (
              <option key={r} value={r}>
                {ROTULO_DO_RECORTE[r]} ({v.cartoes.filter((c) => noRecorte(c, r, quem)).length})
              </option>
            ))}
          </Select>
        )}
      </div>
    </>
  );

  return (
    <div ref={raiz} className="flex-1 min-h-0 flex flex-col">
      <ColunaDaLista topo={topo}>
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
          visiveis.map((c) => (
            <CartaoDeConversa
              key={c.cicloId}
              ancora={c.cicloId}
              href={v.hrefDoCiclo(c.cicloId)}
              nome={c.titulo}
              nomeDasIniciais={c.tipoContato === "DESCONHECIDO" ? null : c.titulo}
              selo={seloDo(c)}
              quando={quandoCurto(c.quando ? new Date(c.quando) : null, agora)}
              contexto={contextoDo(c)}
              previa={c.previa}
              naoLidas={c.esperandoResposta && c.situacao !== "ENCERRADO" ? 1 : 0}
              rotuloDasNaoLidas="esperando resposta"
              selecionada={c.cicloId === v.abertaId}
            />
          ))
        )}
      </ColunaDaLista>
    </div>
  );
}

/** A lista recolhida: só as iniciais, com a marca de quem espera resposta. */
function FaixaDaLista({ aoAbrir }: { aoAbrir: () => void }) {
  const v = useCaixaDoAtendimento();
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem };
  const visiveis = v.cartoes.filter((c) => noRecorte(c, v.recorte, quem)).slice(0, 40);
  return (
    <nav aria-label="Conversas recolhidas" className="flex-1 min-h-0 flex flex-col items-center gap-2 py-2 rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={aoAbrir}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg"
        aria-label="Mostrar a lista de conversas"
        title="Mostrar a lista"
      >
        <PanelLeftOpen size={16} />
      </button>
      <span className="w-7 h-px bg-border" aria-hidden />
      <div className="flex-1 min-h-0 overflow-y-auto scroll-y flex flex-col items-center gap-2 px-1">
        {visiveis.map((c) => (
          <Link
            key={c.cicloId}
            href={v.hrefDoCiclo(c.cicloId)}
            scroll={false}
            title={c.titulo}
            aria-label={`${c.titulo}${c.esperandoResposta ? ", esperando resposta" : ""}`}
            aria-current={c.cicloId === v.abertaId ? "page" : undefined}
            className={`relative rounded-md p-0.5 ${c.cicloId === v.abertaId ? "ring-2 ring-brand" : "hover:bg-surface-hover"}`}
          >
            <Iniciais nome={c.tipoContato === "DESCONHECIDO" ? null : c.titulo} tamanho={32} />
            {c.esperandoResposta && c.situacao !== "ENCERRADO" && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-solid border-2 border-surface" aria-hidden />
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
  const quem = { userId: v.userId, meus: v.meus, geridos: v.geridos, triagem: v.ehTriagem };
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
