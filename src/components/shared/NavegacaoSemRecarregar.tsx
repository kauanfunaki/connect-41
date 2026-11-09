"use client";

import {
  createContext,
  useContext,
  useMemo,
  useTransition,
  type AnchorHTMLAttributes,
  type FormHTMLAttributes,
  type ReactNode,
  type TransitionStartFunction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filtrar sem recarregar a página (09/11/2026, pedido do Kauan: "ao filtrar
 * na tela de controle interno, a tela dá um refresh").
 *
 * Desde 09/10 os filtros (`FiltrosDaTela`, os cartões da `FaixaDeTotais`, a
 * busca do acervo fiscal, o seletor de empresa e os formulários GET) faziam
 * navegação completa — `window.location.assign`, `<a>` simples, `<form>`
 * nativo — para não reaproveitar a árvore de outro recorte. O preço era a
 * tela inteira piscar: menu, topo e lista recarregavam a cada escolha.
 *
 * Agora a escolha navega pelo roteador, dentro de uma transição: a lista que
 * está à vista fica na tela (esmaecida, ver `.c41-atualizando` no
 * globals.css) até a nova chegar do servidor, e a barra fina no topo diz que
 * está carregando. No Next 16.2 trocar só a query não remonta a página (o
 * segmento da página é chaveado sem a query), por isso não aparece o
 * esqueleto do `loading.tsx`. A consulta continua indo inteira ao servidor:
 * as telas são dinâmicas e o cache do roteador não guarda página dinâmica.
 *
 * O que fica com o recorte antigo, se fosse ficar, é estado de componente
 * cliente montado com a lista da tela (`useState(itens)`); esses ganham
 * `key` pelo recorte na própria tela.
 */

type Atualizacao = { pendente: boolean; iniciar: TransitionStartFunction };

const ContextoDaAtualizacao = createContext<Atualizacao | null>(null);

/**
 * Fica no `<main>` do AppShell e do PortalShell: uma transição só para a tela
 * inteira, para a barra do topo e o esmaecer da lista valerem para qualquer
 * filtro dela.
 */
export function ProvedorDaAtualizacao({ children }: { children: ReactNode }) {
  const [pendente, iniciar] = useTransition();
  const valor = useMemo(() => ({ pendente, iniciar }), [pendente]);
  return (
    <ContextoDaAtualizacao value={valor}>
      {/* Antes do conteúdo e irmã dele: o CSS esmaece a lista com `~`. Altura
          zero e `sticky`, para a barra ficar no topo mesmo com a tela rolada
          sem empurrar nada. */}
      <div aria-hidden className="c41-atualizando" data-ativo={pendente || undefined} />
      <span role="status" className="sr-only">{pendente ? "Atualizando a lista" : ""}</span>
      {children}
    </ContextoDaAtualizacao>
  );
}

/**
 * `ir(url)` troca a URL pelo roteador, sem recarregar e sem rolar a tela.
 * `antes` roda dentro da mesma transição — é onde o `FiltrosDaTela` mostra a
 * escolha na hora (`useOptimistic`), antes de a lista nova chegar.
 * `substituir` troca a entrada do histórico em vez de criar outra: a busca
 * que filtra enquanto se digita (Arquivos, 09/11/2026) não deixa uma entrada
 * por pausa da digitação no voltar do navegador.
 */
export function useNavegarSemRecarregar() {
  const router = useRouter();
  const contexto = useContext(ContextoDaAtualizacao);
  // Fora do AppShell/PortalShell (páginas públicas) a transição é local: a
  // navegação é a mesma, só não há a barra do topo.
  const [pendenteLocal, iniciarLocal] = useTransition();
  const iniciar = contexto?.iniciar ?? iniciarLocal;
  return {
    pendente: contexto?.pendente ?? pendenteLocal,
    ir(url: string, antes?: () => void, { substituir = false }: { substituir?: boolean } = {}) {
      iniciar(() => {
        antes?.();
        if (substituir) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
  };
}

/** Clique comum fica na página; Ctrl/⌘/Shift/botão do meio abrem como link. */
function cliqueComum(e: React.MouseEvent<HTMLAnchorElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;
}

/**
 * Link de filtro (os cartões da `FaixaDeTotais`): o `href` continua de
 * verdade — abrir em outra aba e copiar o endereço funcionam —, e o clique
 * comum navega sem recarregar.
 */
export function LinkSemRecarregar({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { ir } = useNavegarSemRecarregar();
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (!cliqueComum(e) || (props.target && props.target !== "_self")) return;
        e.preventDefault();
        ir(href);
      }}
    />
  );
}

/**
 * Formulário GET de busca ou filtro: monta a mesma URL que o navegador
 * montaria (todos os campos, o botão que enviou, `action` ou a própria tela)
 * e navega sem recarregar. Sem JavaScript, continua um `<form method="get">`.
 */
export function FormularioDeFiltro({
  onSubmit,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, "method">) {
  const { ir } = useNavegarSemRecarregar();
  // `key` na query da tela: os campos daqui são soltos (`defaultValue`) e não
  // releem a URL. Sem remontar, o voltar do navegador ou um link que troca o
  // filtro deixavam no campo o valor de antes, e o próximo "Aplicar" o enviava
  // de novo. Com a página recarregando a cada envio, o navegador cuidava disso.
  const query = useSearchParams().toString();
  return (
    <form
      key={query}
      {...props}
      method="get"
      onSubmit={(e) => {
        onSubmit?.(e);
        if (e.defaultPrevented) return;
        const form = e.currentTarget;
        if (form.target && form.target !== "_self") return;
        e.preventDefault();
        // `form.action` já vem resolvido: sem `action`, é a própria tela.
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        ir(urlDoEnvioGet(form.action, new FormData(form, submitter ?? undefined)));
      }}
    />
  );
}

/**
 * A URL que o navegador montaria num envio GET: o caminho do `action` e todos
 * os campos na query, inclusive os vazios (`q=`), trocando a query que a
 * tela tinha. Arquivo (`File`) sai, como sairia o conteúdo dele.
 */
export function urlDoEnvioGet(acao: string, campos: Iterable<[string, FormDataEntryValue]>): string {
  const destino = new URL(acao, "http://connect.invalid");
  const q = new URLSearchParams();
  for (const [chave, valor] of campos) if (typeof valor === "string") q.append(chave, valor);
  const s = q.toString();
  return `${destino.pathname}${s ? `?${s}` : ""}`;
}
