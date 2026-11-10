"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, EyeOff, RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Contador } from "@/components/ui/Contador";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { useToast } from "@/components/ui/Toast";
import { CartaoDeNotificacao } from "@/components/notificacoes/CartaoDeNotificacao";
import { AbasDasNotificacoes } from "@/components/notificacoes/AbasDasNotificacoes";
import {
  arquivarNotificacoes,
  listarNotificacoes,
  marcarLidas,
  marcarTodasLidas,
  removerNotificacoes,
} from "@/app/(app)/notificacoes/actions";
import type { AbaOuTodas } from "@/lib/notificacoes/catalogo";
import type { NotificacaoNaTela } from "@/lib/notificacoes/consultas";
import {
  GRUPO_DAS_NOTIFICACOES,
  anuncioDaConferencia,
  avisoDoCanto,
  destinoDoClique,
  lembrarMostrados,
  textoDoResumo,
  type AvisoDoCanto,
  type NotificacaoNova,
  type RespostaDasNovas,
} from "@/lib/notificacoes/avisoNaTela";
import { audioPronto, destravarAudio, lerPreferenciasDoNavegador, tocaSom, tocarSom } from "@/lib/notificacoes/som";
import { ICONE_DO_AVISO, registroDoConnect, temAvisoNoComputador } from "@/lib/notificacoes/pushDoNavegador";
import { INTERVALO_DA_CONFERENCIA_MS } from "./useNumeroConferido";

type Contagens = Record<AbaOuTodas, number>;
type Dados = { itens: NotificacaoNaTela[]; contagens: Contagens; ocultos: number };

// O sino (redesenho de 02/10/2026, referências do Searcheye): abas por natureza
// com a contagem de não lidas, cartão com ícone do tipo e chip da entidade,
// marcar lida/não lida e remover no hover, "Marcar todas" e "Ir para a
// central" no rodapé fixo.
//
// A lista é buscada AO ABRIR. Até aqui ela vinha do layout, que não
// re-renderiza ao navegar, e envelhecia até recarregar a página. O layout fica
// só com o contador, que também se atualiza quando a pessoa volta à aba.
//
// Segunda leva (05/10/2026): arquivar no hover (sai do sino sem ser apagada) e
// o aviso de quantos tipos a pessoa ocultou, com o atalho para as preferências.

const POR_ABERTURA = 20;

/** Os avisos já mostrados no canto, entre as abas do navegador: o mesmo aviso não aparece de novo na outra. */
const CHAVE_DOS_MOSTRADOS = "connect:avisos-mostrados";
/**
 * As notificações que já tocaram o som e o aviso no computador, entre as abas
 * (10/11/2026). À parte dos mostrados: a aba em segundo plano anuncia na hora,
 * mas o canto da tela fica para quando a pessoa olhar o Connect.
 */
const CHAVE_DOS_ANUNCIADOS = "connect:avisos-anunciados";

/**
 * A cópia na memória da aba: sem armazenamento (navegador que bloqueia), a aba
 * em segundo plano — que confere de novo a mesma lista — não toca de novo.
 */
const naMemoria = new Map<string, string[]>();

function lerIds(chave: string): string[] {
  try {
    const lido: unknown = JSON.parse(localStorage.getItem(chave) ?? "null");
    if (Array.isArray(lido)) return lido.filter((x): x is string => typeof x === "string");
  } catch {
    // Sem armazenamento: vale a cópia da memória.
  }
  return naMemoria.get(chave) ?? [];
}

function guardarIds(chave: string, ids: string[]): void {
  naMemoria.set(chave, ids);
  try {
    localStorage.setItem(chave, JSON.stringify(ids));
  } catch {
    // Sem armazenamento: fica a cópia da memória, só desta aba.
  }
}

/**
 * Quando alguma aba do Connect conferiu o sino pela última vez, entre as abas.
 * A aba em segundo plano só confere se nenhuma outra conferiu há pouco: com
 * cinco abas abertas, uma só pergunta ao servidor.
 */
const CHAVE_DA_ULTIMA_CONFERENCIA = "connect:ultima-conferencia";

function outraAbaConferiuHaPouco(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(CHAVE_DA_ULTIMA_CONFERENCIA) ?? 0) < INTERVALO_DA_CONFERENCIA_MS - 10_000;
  } catch {
    return false;
  }
}

function marcarConferencia(): void {
  try {
    localStorage.setItem(CHAVE_DA_ULTIMA_CONFERENCIA, String(Date.now()));
  } catch {
    // Sem armazenamento: cada aba confere por conta própria.
  }
}

/** A pessoa deixou o Connect mostrar aviso no computador, e o navegador também. */
function avisaNoComputador(): boolean {
  return temAvisoNoComputador() && Notification.permission === "granted" && lerPreferenciasDoNavegador().noComputador;
}

/**
 * O som e o aviso do computador das notificações que acabaram de chegar
 * (09/11/2026). O som é um só, mesmo chegando três de uma vez. O aviso do
 * computador sai quando a pessoa não está olhando o Connect (outra aba, outro
 * programa) — olhando, o canto da tela basta — e só quando este navegador não
 * tem push: com push, o aviso do computador já veio por ele.
 */
async function anunciar(novas: NotificacaoNova[]): Promise<void> {
  const p = lerPreferenciasDoNavegador();
  const tocou = tocaSom(p) ? await tocarSom(p.som, p.volume) : false;
  if (!avisaNoComputador()) return;
  if (document.visibilityState === "visible" && document.hasFocus()) return;
  try {
    const registro = await registroDoConnect();
    if (await registro.pushManager?.getSubscription()) return;
    for (const n of novas) {
      await registro.showNotification(n.titulo, {
        body: n.mensagem,
        icon: ICONE_DO_AVISO,
        badge: ICONE_DO_AVISO,
        tag: n.id,
        data: { url: destinoDoClique(n) ?? "/notificacoes" },
        // Mudo quando o Connect já tocou, ou quando a pessoa desligou o som.
        silent: tocou || !tocaSom(p),
      });
    }
  } catch {
    // O navegador não deixou: o aviso segue no sino e no canto da tela.
  }
}

/** Os pedidos do service worker (`public/sw.js`): ir à tela do push clicado, ou conferir o que chegou. */
type PedidoDoServiceWorker = { tipo?: unknown; url?: unknown };

function ajustar(c: Contagens, n: NotificacaoNaTela, delta: number): Contagens {
  return { ...c, todas: Math.max(0, c.todas + delta), [n.aba]: Math.max(0, c[n.aba] + delta) };
}

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<AbaOuTodas>("todas");
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(false);
  // O número do sino: o do layout, até alguma ação ou conferência daqui mudá-lo.
  // Quando o layout manda outro (refresh), o dele volta a valer.
  const [topo, setTopo] = useState({ doLayout: unreadCount, valor: unreadCount });
  const contagemDoTopo = topo.doLayout === unreadCount ? topo.valor : unreadCount;
  const setContagemDoTopo = (v: number | ((atual: number) => number)) =>
    setTopo((t) => {
      const atual = t.doLayout === unreadCount ? t.valor : unreadCount;
      return { doLayout: unreadCount, valor: typeof v === "function" ? v(atual) : v };
    });
  const ancoraRef = useRef<HTMLSpanElement>(null);
  // Só a resposta do último pedido vale: trocar de aba rápido não pode deixar
  // a lista de uma aba com o título de outra.
  const pedido = useRef(0);

  // Como no `abrir` do sino: marca como lida ANTES de navegar.
  async function abrirDoAviso(id: string, destino: string) {
    try {
      await marcarLidas([id]);
      setContagemDoTopo((c) => Math.max(0, c - 1));
    } catch {
      // Não marcou: a tela abre do mesmo jeito, e a notificação segue não lida no sino.
    }
    router.push(destino);
    router.refresh();
  }

  /**
   * O aviso da conferência no canto (um só, ver `avisoDoCanto`). A notificação
   * que chegou sozinha: com caminho, o clique marca como lida e leva à tela. O
   * resumo de várias (10/11/2026): mesmo desenho, e o clique abre o sino.
   */
  function avisar(aviso: AvisoDoCanto) {
    if (aviso.tipo === "resumo") {
      const { titulo, mensagem } = textoDoResumo(aviso);
      toast.show(mensagem, "info", { titulo, grupo: GRUPO_DAS_NOTIFICACOES, aoClicar: abrirOSino, rotuloDoClique: "Ver no sino" });
      return;
    }
    const n = aviso.notificacao;
    const destino = destinoDoClique(n);
    toast.show(n.mensagem, "info", {
      titulo: n.titulo,
      grupo: GRUPO_DAS_NOTIFICACOES,
      ...(destino ? { aoClicar: () => void abrirDoAviso(n.id, destino), rotuloDoClique: "Abrir" } : {}),
    });
  }

  /**
   * O clique no resumo: o sino aberto na aba de todas, onde as que chegaram
   * estão no topo, sem marcar nada como lido — a pessoa ainda não as viu. O
   * foco vai para o botão do sino, como quando ela mesma o abre.
   */
  function abrirOSino() {
    setAba("todas");
    setAberto(true);
    void carregar("todas");
    ancoraRef.current?.querySelector<HTMLElement>("button")?.focus();
  }

  // Entre uma navegação e outra, voltar à aba do navegador confere o número —
  // e, desde 21/10/2026, também a cada minuto com a aba aberta: a solicitação
  // que chega avisa sem ninguém recarregar a página.
  //
  // Desde 09/11/2026 a mesma conferência traz as notificações que chegaram e
  // as mostra no canto da tela (ver `avisoNaTela.ts`). A primeira, ao montar,
  // só marca onde a página começou: o que já existia não vira aviso. Pela rota
  // `/api/notificacoes/novas`, e não por Server Action, como o alerta de reunião.
  const desdeRef = useRef<string | null>(null);
  //
  // Com som ou aviso no computador ligados (09/11/2026), a aba em segundo
  // plano também confere: é com a pessoa em outro lugar que o som e o aviso
  // do computador fazem falta. `forcar`: chegou um push, confere já.
  //
  // A pilha de avisos de quem voltava ao Connect (10/11/2026):
  // - a aba em segundo plano só anuncia (o som e o aviso no computador) e não
  //   anda o cursor. O canto fica para quando a pessoa voltar: a conferência
  //   de então traz tudo o que chegou desde a última vez que ela olhou — já
  //   sem o que ela leu em outra aba — e põe um aviso só, o da notificação ou
  //   o resumo "N avisos novos";
  // - uma conferência por vez: a pedida no meio de outra (vários push juntos)
  //   roda logo depois, uma vez só, em vez de cada uma pôr o seu aviso.
  async function conferirUmaVez(forcar: boolean) {
    if (document.visibilityState !== "visible" && !forcar) {
      if (!tocaSom(lerPreferenciasDoNavegador()) && !avisaNoComputador()) return;
      if (outraAbaConferiuHaPouco()) return;
    }
    marcarConferencia();
    try {
      const consulta = desdeRef.current ? `?desde=${encodeURIComponent(desdeRef.current)}` : "";
      const r = await fetch(`/api/notificacoes/novas${consulta}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as RespostaDasNovas;
      setContagemDoTopo(d.naoLidas);
      if (desdeRef.current === null) {
        desdeRef.current = d.cursor;
        return;
      }
      const anunciados = lerIds(CHAVE_DOS_ANUNCIADOS);
      const anuncio = anuncioDaConferencia(d.novas, new Set(anunciados));
      if (anuncio.anunciadas.length > 0) {
        guardarIds(CHAVE_DOS_ANUNCIADOS, lembrarMostrados(anunciados, anuncio.anunciadas));
        void anunciar(anuncio.anunciar);
      }
      if (document.visibilityState !== "visible") return;
      desdeRef.current = d.cursor;
      const mostrados = lerIds(CHAVE_DOS_MOSTRADOS);
      const { aviso, mostradas } = avisoDoCanto(d, new Set(mostrados));
      if (!aviso) return;
      guardarIds(CHAVE_DOS_MOSTRADOS, lembrarMostrados(mostrados, mostradas));
      avisar(aviso);
    } catch {
      // Rede oscilando: o número e os avisos voltam na próxima conferência.
    }
  }

  const conferindo = useRef(false);
  const pedidoDeConferir = useRef<{ forcar: boolean } | null>(null);
  function tirarPedido() {
    const p = pedidoDeConferir.current;
    pedidoDeConferir.current = null;
    return p;
  }
  const conferir = useEffectEvent(async (forcar = false) => {
    pedidoDeConferir.current = { forcar: forcar || !!pedidoDeConferir.current?.forcar };
    if (conferindo.current) return;
    conferindo.current = true;
    try {
      for (let p = tirarPedido(); p; p = tirarPedido()) await conferirUmaVez(p.forcar);
    } finally {
      conferindo.current = false;
    }
  });
  useEffect(() => {
    const ouvir = () => void conferir();
    ouvir();
    document.addEventListener("visibilitychange", ouvir);
    const relogio = setInterval(ouvir, INTERVALO_DA_CONFERENCIA_MS);
    return () => {
      document.removeEventListener("visibilitychange", ouvir);
      clearInterval(relogio);
    };
  }, []);

  // O clique no push do navegador (09/11/2026): o service worker foca esta
  // janela e pede a tela do aviso; a navegação é a do próprio app, sem
  // recarregar a página. A resposta diz ao service worker que deu certo — sem
  // ela, ele navega a janela do jeito dele.
  useEffect(() => {
    const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (!sw) return;
    function aoReceber(e: MessageEvent) {
      const pedido = e.data as PedidoDoServiceWorker | null;
      // Chegou um push: o sino confere na hora (o aviso do canto e o som), e
      // diz ao service worker se o aviso do computador sai mudo — quando o som
      // é daqui, ou quando a pessoa desligou o som.
      if (pedido?.tipo === "connect:push") {
        e.ports[0]?.postMessage({ silenciar: !tocaSom(lerPreferenciasDoNavegador()) || audioPronto() });
        void conferir(true);
        return;
      }
      if (pedido?.tipo !== "connect:navegar" || typeof pedido.url !== "string") return;
      const destino = destinoDoClique({ href: pedido.url });
      if (!destino) return;
      e.ports[0]?.postMessage({ ok: true });
      router.push(destino);
    }
    sw.addEventListener("message", aoReceber);
    sw.startMessages();
    return () => sw.removeEventListener("message", aoReceber);
  }, [router]);

  // O navegador só deixa a página fazer som depois de um gesto da pessoa: o
  // primeiro clique ou tecla destrava o áudio para os avisos que vierem.
  useEffect(() => {
    function destravar() {
      if (tocaSom(lerPreferenciasDoNavegador())) destravarAudio();
    }
    document.addEventListener("pointerdown", destravar);
    document.addEventListener("keydown", destravar);
    return () => {
      document.removeEventListener("pointerdown", destravar);
      document.removeEventListener("keydown", destravar);
    };
  }, []);

  // O Esc vem do `PainelFlutuante`, pela pilha de camadas (ver `ui/camadas.ts`).

  async function carregar(alvo: AbaOuTodas) {
    const n = ++pedido.current;
    setCarregando(true);
    try {
      const r = await listarNotificacoes({ aba: alvo, limite: POR_ABERTURA });
      if (n !== pedido.current) return;
      setDados({ itens: r.itens, contagens: r.contagens, ocultos: r.ocultos });
      setContagemDoTopo(r.contagens.todas);
    } finally {
      if (n === pedido.current) setCarregando(false);
    }
  }

  function alternar() {
    if (aberto) return setAberto(false);
    setAberto(true);
    void carregar(aba);
  }

  function trocarAba(alvo: AbaOuTodas) {
    setAba(alvo);
    void carregar(alvo);
  }

  // Marca como lida ANTES de navegar: disparar e navegar junto cancelava a
  // Server Action no meio, e a notificação nunca ficava lida (bug antigo).
  async function abrir(n: NotificacaoNaTela) {
    if (!n.lida) await marcarLidas([n.id]);
    setAberto(false);
    if (n.href) router.push(n.href);
    router.refresh();
  }

  async function alternarLida(n: NotificacaoNaTela) {
    setDados((d) =>
      d && {
        ...d,
        itens: d.itens.map((x) => (x.id === n.id ? { ...x, lida: !n.lida } : x)),
        contagens: ajustar(d.contagens, n, n.lida ? 1 : -1),
      }
    );
    setContagemDoTopo((c) => Math.max(0, c + (n.lida ? 1 : -1)));
    await marcarLidas([n.id], !n.lida);
    router.refresh();
  }

  /** Remover e arquivar tiram do sino do mesmo jeito; a não lida sai da contagem. */
  function tirar(n: NotificacaoNaTela) {
    setDados((d) => d && { ...d, itens: d.itens.filter((x) => x.id !== n.id), contagens: n.lida ? d.contagens : ajustar(d.contagens, n, -1) });
    if (!n.lida) setContagemDoTopo((c) => Math.max(0, c - 1));
  }

  // Tira da lista na hora; se o servidor falhar, a lista volta como está no
  // banco e a pessoa fica sabendo — antes o item sumia sem ter saído.
  async function tirarDoSino(n: NotificacaoNaTela, acao: () => Promise<void>, falha: string) {
    tirar(n);
    try {
      await acao();
    } catch {
      toast.error(falha);
      await carregar(aba);
    }
    router.refresh();
  }

  function remover(n: NotificacaoNaTela) {
    return tirarDoSino(n, () => removerNotificacoes([n.id]), "Não foi possível remover a notificação. Tente de novo.");
  }

  function arquivar(n: NotificacaoNaTela) {
    return tirarDoSino(n, () => arquivarNotificacoes([n.id]), "Não foi possível arquivar a notificação. Tente de novo.");
  }

  async function marcarTodas() {
    await marcarTodasLidas(aba);
    await carregar(aba);
    router.refresh();
  }

  const naoLidasDaAba = dados?.contagens[aba] ?? 0;

  return (
    <>
      {/* `relative`: é ele que segura o número vermelho no canto do sino. */}
      <span ref={ancoraRef} className="relative inline-flex">
        <IconButton
          variant="framed"
          size="lg"
          active={aberto}
          onClick={alternar}
          data-dica="Notificações"
          aria-label={contagemDoTopo > 0 ? `Notificações, ${contagemDoTopo} não lidas` : "Notificações"}
          aria-expanded={aberto}
        >
          <Bell size={17} />
          {contagemDoTopo > 0 && (
            // O `Contador` do sistema (07/10/2026): 11px, e não 10px, com o
            // vermelho fixo (branco sobre o vermelho do escuro dava 3,17:1).
            <Contador valor={contagemDoTopo} tom="alerta" pequeno className="absolute -top-1 -right-1 border-2 border-surface-hover" />
          )}
        </IconButton>
      </span>

      <PainelFlutuante
        ancora={ancoraRef}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        largura={400}
        align="right"
        folhaNoCelular
        aria-label="Notificações"
        className="p-0! flex flex-col max-h-[min(620px,calc(100dvh-80px))] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <p className="text-body font-semibold text-fg">Notificações</p>
          <IconButton size="sm" onClick={() => void carregar(aba)} title="Atualizar" aria-label="Atualizar notificações" disabled={carregando}>
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </IconButton>
        </div>
        <div className="px-3 pb-2">
          <AbasDasNotificacoes ativa={aba} contagens={dados?.contagens ?? null} onEscolher={trocarAba} />
          {/* Nada some sem a pessoa saber: o que ela ocultou fica dito, com o atalho de volta. */}
          {!!dados?.ocultos && (
            <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-micro text-fg-muted">
              <span className="inline-flex items-center gap-1">
                <EyeOff size={12} /> {dados.ocultos} tipo{dados.ocultos === 1 ? "" : "s"} oculto{dados.ocultos === 1 ? "" : "s"}
              </span>
              <Button href="/notificacoes?preferencias=abrir" size="xs" variant="ghost" onClick={() => setAberto(false)}>
                Ajustar
              </Button>
            </div>
          )}
        </div>

        <div className="scroll-y flex-1 min-h-0 overflow-y-auto border-t border-border px-1.5 py-1.5">
          {!dados && carregando ? (
            <ListaCarregando />
          ) : dados && dados.itens.length === 0 ? (
            <div className="py-6">
              <EmptyState icon={<Bell />} title="Nada por aqui" description="Você está em dia nesta aba." />
            </div>
          ) : (
            <ul className={`flex flex-col gap-0.5 transition-opacity ${carregando ? "opacity-60" : ""}`}>
              {dados?.itens.map((n) => (
                <li key={n.id}>
                  <CartaoDeNotificacao
                    n={n}
                    onAbrir={(x) => void abrir(x)}
                    onAlternarLida={(x) => void alternarLida(x)}
                    onArquivar={(x) => void arquivar(x)}
                    onRemover={(x) => void remover(x)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          {/* Revisão de 05/10: botão não é link — era texto azul sublinhado. */}
          <Button size="sm" variant="ghost" onClick={() => void marcarTodas()} disabled={naoLidasDaAba === 0}>
            Marcar todas como lidas
          </Button>
          <Button href={aba === "todas" ? "/notificacoes" : `/notificacoes?aba=${aba}`} size="sm" variant="secondary" onClick={() => setAberto(false)}>
            Ir para a central
          </Button>
        </div>
      </PainelFlutuante>
    </>
  );
}

function ListaCarregando() {
  return (
    <div className="flex flex-col gap-1 p-2" aria-label="Carregando">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 py-2">
          <span className="size-[34px] rounded-full bg-surface-2 animate-pulse" />
          <span className="flex-1 space-y-2 pt-1">
            <span className="block h-3 w-2/5 rounded-sm bg-surface-2 animate-pulse" />
            <span className="block h-3 w-4/5 rounded-sm bg-surface-2 animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}
