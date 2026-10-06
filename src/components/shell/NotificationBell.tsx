"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, EyeOff, RefreshCw } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { CartaoDeNotificacao } from "@/components/notificacoes/CartaoDeNotificacao";
import { AbasDasNotificacoes } from "@/components/notificacoes/AbasDasNotificacoes";
import {
  arquivarNotificacoes,
  contarNaoLidas,
  listarNotificacoes,
  marcarLidas,
  marcarTodasLidas,
  removerNotificacoes,
} from "@/app/(app)/notificacoes/actions";
import type { AbaOuTodas } from "@/lib/notificacoes/catalogo";
import type { NotificacaoNaTela } from "@/lib/notificacoes/consultas";

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

function ajustar(c: Contagens, n: NotificacaoNaTela, delta: number): Contagens {
  return { ...c, todas: Math.max(0, c.todas + delta), [n.aba]: Math.max(0, c[n.aba] + delta) };
}

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
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

  // Entre uma navegação e outra, voltar à aba do navegador confere o número.
  const aoVoltar = useEffectEvent(() => {
    if (document.visibilityState === "visible") void contarNaoLidas().then((v) => setContagemDoTopo(v)).catch(() => {});
  });
  useEffect(() => {
    const ouvir = () => aoVoltar();
    document.addEventListener("visibilitychange", ouvir);
    return () => document.removeEventListener("visibilitychange", ouvir);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto]);

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

  async function remover(n: NotificacaoNaTela) {
    tirar(n);
    await removerNotificacoes([n.id]);
    router.refresh();
  }

  async function arquivar(n: NotificacaoNaTela) {
    tirar(n);
    await arquivarNotificacoes([n.id]);
    router.refresh();
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
          title="Notificações"
          aria-label={contagemDoTopo > 0 ? `Notificações, ${contagemDoTopo} não lidas` : "Notificações"}
          aria-expanded={aberto}
        >
          <Bell size={17} />
          {contagemDoTopo > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-semibold leading-none inline-flex items-center justify-center border-2 border-surface-hover">
              {contagemDoTopo > 99 ? "99+" : contagemDoTopo}
            </span>
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
        className="p-0! flex flex-col max-h-[min(620px,calc(100vh-80px))] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <p className="text-[15px] font-semibold text-fg">Notificações</p>
          <IconButton size="sm" onClick={() => void carregar(aba)} title="Atualizar" aria-label="Atualizar notificações" disabled={carregando}>
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""} />
          </IconButton>
        </div>
        <div className="px-3 pb-2">
          <AbasDasNotificacoes ativa={aba} contagens={dados?.contagens ?? null} onEscolher={trocarAba} />
          {/* Nada some sem a pessoa saber: o que ela ocultou fica dito, com o atalho de volta. */}
          {!!dados?.ocultos && (
            <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px] text-fg-muted">
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
            <span className="block h-3 w-2/5 rounded bg-surface-2 animate-pulse" />
            <span className="block h-3 w-4/5 rounded bg-surface-2 animate-pulse" />
          </span>
        </div>
      ))}
    </div>
  );
}
