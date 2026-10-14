// A caixa de conversas: lista em cartões à esquerda, painel do contato à
// direita. Pedido do Kauan (09/10/2026), a partir de um print de referência:
// os chats do Connect (atendimento do Recrutamento, Conversas da Controladoria,
// conversa com o cliente do BPO) com um desenho só, mais fácil de percorrer.
//
// - Lista e painel ocupam a altura que sobra na janela, abaixo do título da
//   página (14/10/2026): a página não rola; rolam só os cartões da lista e o
//   conteúdo do painel. Quem usa põe a caixa num `PageContainer` com
//   `h-full flex flex-col` — a altura vem do casco do app, sem conta de
//   `100dvh` menos o que estiver em cima.
// - No computador, lista e painel lado a lado. No celular, uma coisa de cada
//   vez: a lista, ou o painel aberto (com o X para voltar à lista).
//
// As peças daqui servem a servidor e cliente; o que precisa de estado (teclado,
// copiar, abas, o cabeçalho do painel) está em ./Interativos.

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MessageCircle, X } from "lucide-react";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { iniciais } from "@/lib/conversas/caixa";
import { BotaoCopiar, CabecalhoDoPainel, NavegacaoPorTeclado } from "./Interativos";

/**
 * A caixa: preenche o resto da coluna do `PageContainer` (`flex-1`). Abaixo de
 * 24rem de altura a página volta a rolar, em vez de espremer a conversa.
 */
export function CaixaDeConversas({ lista, painel, aberta }: { lista: ReactNode; painel: ReactNode; aberta: boolean }) {
  return (
    <div className="flex-1 min-h-[24rem] grid grid-rows-[minmax(0,1fr)] gap-4 lg:gap-x-3 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
      <div className={`${aberta ? "hidden lg:flex" : "flex"} flex-col min-h-0 min-w-0`}>{lista}</div>
      <div className={`${aberta ? "flex" : "hidden lg:flex"} flex-col min-h-0 min-w-0`}>{painel}</div>
    </div>
  );
}

/**
 * Os recortes da lista, com a contagem — "Todas 16 · Sem responsável 3".
 * Mesma lista recortada, então é barra de pílulas, não aba de tela. Ocupa a
 * largura da coluna, como os cartões embaixo (14/10/2026).
 *
 * Com `aoEscolher` (só de componente cliente), o clique não navega: quem usa
 * troca o recorte no navegador — a caixa do WhatsApp recorta a lista sem ir ao
 * servidor e só atualiza a URL. Ctrl+clique e "abrir em nova aba" seguem o link.
 */
export function RecortesDaCaixa({
  itens,
  aoEscolher,
}: {
  itens: { rotulo: string; n?: number; href: string; ativo: boolean; tom?: "atencao" }[];
  aoEscolher?: (href: string) => void;
}) {
  return (
    <nav aria-label="Recortes da lista" className="flex items-center gap-1 rounded-lg bg-surface-2 border border-border p-1">
      {itens.map((r) => (
        <Link
          key={r.href}
          href={r.href}
          scroll={false}
          prefetch={aoEscolher ? false : undefined}
          onNavigate={
            aoEscolher
              ? (e) => {
                  e.preventDefault();
                  aoEscolher(r.href);
                }
              : undefined
          }
          aria-current={r.ativo ? "page" : undefined}
          className={`flex-auto min-w-0 inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded-md text-ui font-medium transition-colors ${
            r.ativo ? "bg-surface text-fg shadow-[var(--c41-shadow-xs)]" : "text-fg-secondary hover:text-fg"
          }`}
        >
          <span className="truncate">{r.rotulo}</span>
          {r.n !== undefined && (
            <span
              className={`shrink-0 min-w-5 h-5 px-1.5 rounded-full text-micro font-semibold tabular-nums flex items-center justify-center ${
                r.tom === "atencao" && r.n > 0 ? "bg-warning/15 text-warning-fg" : "bg-surface-hover text-fg-muted"
              }`}
            >
              {r.n}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// A faixa da barra de rolagem, reservada nos três blocos da coluna (14/10/2026,
// pedido do Kauan: abas, busca e cartões com o mesmo comprimento). Só os
// cartões rolam, e a barra deles roubava largura só deles; com
// `scrollbar-gutter: stable` em todos — e a mesma barra fina do `.scroll-y`,
// para a faixa ter a mesma largura —, as bordas da direita se alinham, com ou
// sem barra à vista. O `px-1` dá espaço ao anel de foco (3px), que o
// `overflow` cortaria; o `-ml-1` da coluna devolve o alinhamento com o título.
const FAIXA = "scroll-y scroll-gutter-stable px-1";

/** A coluna da lista: o topo (abas, busca) parado, os cartões rolando, o rodapé (paginação, lote) embaixo. */
export function ColunaDaLista({ topo, children, rodape }: { topo?: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col -ml-1">
      {topo && <div className={`relative shrink-0 overflow-hidden ${FAIXA} pt-1 pb-2 flex flex-col gap-2`}>{topo}</div>}
      <div className={`relative flex-1 min-h-0 overflow-y-auto ${FAIXA} py-1 flex flex-col gap-2`}>{children}</div>
      {rodape && <div className={`relative shrink-0 overflow-hidden ${FAIXA} pt-2 pb-1`}>{rodape}</div>}
    </div>
  );
}

/** O quadradinho com as iniciais (ou "#", quando só há telefone). */
export function Iniciais({ nome, tamanho = 32 }: { nome: string | null; tamanho?: number }) {
  return (
    <span
      aria-hidden
      className="rounded-md bg-brand-subtle text-brand font-semibold flex items-center justify-center shrink-0"
      style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}
    >
      {iniciais(nome)}
    </span>
  );
}

/** O balão da direita: com mensagens esperando, cheio e com o número. */
export function BalaoDeMensagens({ n, rotulo }: { n: number; rotulo?: string }) {
  if (n > 0) {
    return (
      <span
        className="min-w-6 h-6 px-1.5 rounded-full bg-brand text-white text-micro font-semibold tabular-nums flex items-center justify-center shrink-0"
        title={rotulo}
      >
        {n}
        {rotulo && <span className="sr-only"> {rotulo}</span>}
      </span>
    );
  }
  return <MessageCircle size={16} className="text-fg-muted shrink-0" aria-hidden />;
}

export type CartaoDeConversaProps = {
  href: string;
  nome: string;
  /** O nome que vira iniciais; nulo quando só há telefone. */
  nomeDasIniciais: string | null;
  selo?: { tom: TomDoSelo; texto: string } | null;
  quando: string;
  /** Segunda linha: com quem está, a vaga, o canal. */
  contexto?: ReactNode;
  /** Terceira linha: o começo da última mensagem. */
  previa?: string | null;
  naoLidas?: number;
  rotuloDasNaoLidas?: string;
  selecionada?: boolean;
  /** Antes do cartão, fora do link: a caixa de seleção do lote. */
  antes?: ReactNode;
  /** Marca o cartão (`data-cartao`), para a lista achá-lo e trazê-lo à vista. */
  ancora?: string;
};

export function CartaoDeConversa(p: CartaoDeConversaProps) {
  return (
    <div
      data-cartao={p.ancora}
      className={`flex items-stretch rounded-lg border bg-surface transition-colors ${
        p.selecionada ? "border-brand ring-1 ring-brand/30" : "border-border hover:border-brand/40"
      }`}
    >
      {p.antes}
      <Link
        href={p.href}
        scroll={false}
        aria-current={p.selecionada ? "page" : undefined}
        className={`block flex-1 min-w-0 px-3 py-2.5 rounded-lg ${p.antes ? "pl-1.5" : ""}`}
      >
        <div className="flex items-center gap-2.5">
          <Iniciais nome={p.nomeDasIniciais} />
          <span className="min-w-0 flex-1 flex items-center gap-2">
            <span className="font-medium text-fg truncate">{p.nome}</span>
            {p.selo && (
              <Selo tom={p.selo.tom} className="shrink-0">
                {p.selo.texto}
              </Selo>
            )}
          </span>
          <span className="text-micro text-fg-muted tabular-nums shrink-0">{p.quando}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5 pl-[42px]">
          <span className="min-w-0 flex-1 text-micro text-fg-muted truncate">{p.contexto}</span>
          <BalaoDeMensagens n={p.naoLidas ?? 0} rotulo={p.rotuloDasNaoLidas} />
        </div>
        {p.previa && <p className="pl-[42px] mt-1 text-ui text-fg-secondary truncate">{p.previa}</p>}
      </Link>
    </div>
  );
}

/** O painel sem conversa escolhida (só no computador; no celular a lista ocupa a tela). */
export function PainelVazio({ icone, titulo, texto, children }: { icone: ReactNode; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <section className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-center rounded-lg border border-dashed border-border bg-surface/60 p-8">
      <span className="w-12 h-12 rounded-full bg-brand-subtle text-brand flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">{icone}</span>
      <h2 className="text-card-title font-semibold text-fg">{titulo}</h2>
      <p className="text-ui text-fg-muted max-w-[42ch]">{texto}</p>
      {children}
    </section>
  );
}

/**
 * A barra do painel: fechar, a anterior e a próxima (↑↓ no teclado), a data e
 * as ações do canto. Como no print: "veja outros (↑↓ para navegar)".
 */
export function BarraDoPainel({
  fecharHref,
  anteriorHref,
  proximaHref,
  data,
  direita,
}: {
  fecharHref: string;
  anteriorHref: string | null;
  proximaHref: string | null;
  data?: string | null;
  direita?: ReactNode;
}) {
  const seta = "inline-flex items-center justify-center w-8 h-8 rounded-md border border-border text-fg-secondary";
  return (
    <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0">
      <Link href={fecharHref} scroll={false} aria-label="Fechar e voltar à lista" title="Fechar (Esc)" className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg">
        <X size={16} />
      </Link>
      <span className="h-5 w-px bg-border mx-1" aria-hidden />
      {anteriorHref ? (
        <Link href={anteriorHref} scroll={false} aria-label="Conversa anterior" title="Anterior (↑)" className={`${seta} hover:bg-surface-hover hover:text-fg`}>
          <ChevronUp size={16} />
        </Link>
      ) : (
        <span className={`${seta} opacity-40`} aria-hidden>
          <ChevronUp size={16} />
        </span>
      )}
      {proximaHref ? (
        <Link href={proximaHref} scroll={false} aria-label="Próxima conversa" title="Próxima (↓)" className={`${seta} hover:bg-surface-hover hover:text-fg`}>
          <ChevronDown size={16} />
        </Link>
      ) : (
        <span className={`${seta} opacity-40`} aria-hidden>
          <ChevronDown size={16} />
        </span>
      )}
      <span className="hidden md:inline text-micro text-fg-muted ml-1">↑↓ para passar pelas conversas</span>
      <span className="ml-auto text-micro text-fg-muted tabular-nums truncate">{data}</span>
      {direita}
      <NavegacaoPorTeclado anterior={anteriorHref} proxima={proximaHref} fechar={fecharHref} />
    </div>
  );
}

/**
 * O painel do contato. Parados no topo (14/10/2026, pedido do Kauan: "a header
 * do atendimento tem que ficar fixa"): a barra, o nome com as etiquetas numa
 * linha, as ações rápidas, o aviso e os dados (recolhidos — ver
 * `CabecalhoDoPainel`). Embaixo, o conteúdo, que é o que rola:
 *
 * - `corpo="rola"` (padrão): o conteúdo inteiro rola por baixo do cabeçalho.
 * - `corpo="fixo"`: o conteúdo ocupa o resto do painel e cuida da própria
 *   rolagem — a conversa do WhatsApp, com as mensagens rolando e a caixa de
 *   escrever parada embaixo.
 */
export function PainelDeConversa({
  barra,
  etiquetas,
  titulo,
  subtitulo,
  acoes,
  aviso,
  infos,
  rotuloDasInfos,
  corpo = "rola",
  children,
}: {
  barra: ReactNode;
  etiquetas?: ReactNode[];
  titulo: string;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  aviso?: ReactNode;
  /** Os dados do contato (`LinhasDeInfo`): começam recolhidos, e abrem por um botão na linha das etiquetas. */
  infos?: ReactNode;
  /** O texto desse botão. Padrão: "Dados". */
  rotuloDasInfos?: string;
  corpo?: "rola" | "fixo";
  children?: ReactNode;
}) {
  return (
    <section className="relative flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden" aria-label={titulo}>
      {barra}
      <CabecalhoDoPainel
        titulo={titulo}
        subtitulo={subtitulo}
        etiquetas={etiquetas}
        acoes={acoes}
        aviso={aviso}
        infos={infos}
        rotuloDasInfos={rotuloDasInfos}
      />
      <div className={corpo === "fixo" ? "relative flex-1 min-h-0 flex flex-col" : "relative flex-1 min-h-0 overflow-y-auto scroll-y"}>{children}</div>
    </section>
  );
}

/** Uma ação rápida do topo do painel: ícone e texto, sem caixa (como no print). */
export function AcaoRapida({
  icone,
  children,
  href,
  onClick,
  disabled,
  tom,
}: {
  icone: ReactNode;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tom?: "marca" | "perigo";
}) {
  const cor = tom === "marca" ? "text-brand" : tom === "perigo" ? "text-danger" : "text-fg-secondary hover:text-fg";
  const classe = `inline-flex items-center gap-1.5 h-8 px-2 rounded-md text-ui font-medium ${cor} hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:pointer-events-none [&>svg]:w-4 [&>svg]:h-4`;
  if (href) {
    return (
      <Link href={href} className={classe}>
        {icone}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classe} onClick={onClick} disabled={disabled}>
      {icone}
      {children}
    </button>
  );
}

export type LinhaDeInfo = { icone: ReactNode; rotulo: string; valor: ReactNode; copiar?: string | null };

/** Os dados do contato, rótulo com ícone à esquerda e o valor ao lado; o que se copia tem o botão. */
export function LinhasDeInfo({ itens }: { itens: LinhaDeInfo[] }) {
  return (
    <dl className="grid grid-cols-[minmax(7.5rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1">
      {itens.map((l) => (
        <div key={l.rotulo} className="contents">
          <dt className="flex items-center gap-2 h-9 text-ui text-fg-muted [&>svg]:w-4 [&>svg]:h-4 [&>svg]:shrink-0">
            {l.icone}
            {l.rotulo}
          </dt>
          <dd className="flex items-center gap-1.5 min-h-9 text-ui text-fg min-w-0">
            <span className="min-w-0 break-words">{l.valor}</span>
            {l.copiar && <BotaoCopiar texto={l.copiar} rotulo={`Copiar ${l.rotulo.toLowerCase()}`} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
