// A caixa de conversas: lista em cartões à esquerda, painel do contato à
// direita. Pedido do Kauan (09/10/2026), a partir de um print de referência:
// os chats do Connect (atendimento do Recrutamento, Conversas da Controladoria,
// conversa com o cliente do BPO) com um desenho só, mais fácil de percorrer.
//
// - No computador, lista e painel lado a lado, com a altura da tela: cada um
//   rola por dentro, a página não.
// - No celular, uma coisa de cada vez: a lista, ou o painel aberto (com o X
//   para voltar à lista).
//
// As peças daqui servem a servidor e cliente; o que precisa de estado (teclado,
// copiar, abas) está em ./Interativos.

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, MessageCircle, X } from "lucide-react";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { iniciais } from "@/lib/conversas/caixa";
import { BotaoCopiar, NavegacaoPorTeclado } from "./Interativos";

export function CaixaDeConversas({
  lista,
  painel,
  aberta,
  altura = "lg:h-[calc(100dvh-14.5rem)]",
}: {
  lista: ReactNode;
  painel: ReactNode;
  aberta: boolean;
  /** A altura no computador: a tela menos o que a página põe acima da caixa. */
  altura?: string;
}) {
  return (
    <div className={`grid gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] ${altura} lg:min-h-[32rem]`}>
      <div className={`${aberta ? "hidden lg:flex" : "flex"} flex-col min-h-0 min-w-0`}>{lista}</div>
      <div className={`${aberta ? "flex" : "hidden lg:flex"} flex-col min-h-0 min-w-0`}>{painel}</div>
    </div>
  );
}

/**
 * Os recortes da lista, com a contagem — "Todas 16 · Sem responsável 3".
 * Mesma lista recortada, então é barra de pílulas, não aba de tela.
 */
export function RecortesDaCaixa({
  itens,
  direita,
}: {
  itens: { rotulo: string; n?: number; href: string; ativo: boolean; tom?: "atencao" }[];
  direita?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
      <nav aria-label="Recortes da lista" className="flex flex-wrap items-center gap-1 rounded-lg bg-surface-2 border border-border p-1">
        {itens.map((r) => (
          <Link
            key={r.href}
            href={r.href}
            aria-current={r.ativo ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-ui font-medium transition-colors ${
              r.ativo ? "bg-surface text-fg shadow-[var(--c41-shadow-xs)]" : "text-fg-secondary hover:text-fg"
            }`}
          >
            {r.rotulo}
            {r.n !== undefined && (
              <span
                className={`min-w-5 h-5 px-1.5 rounded-full text-micro font-semibold tabular-nums flex items-center justify-center ${
                  r.tom === "atencao" && r.n > 0 ? "bg-warning/15 text-warning-fg" : "bg-surface-hover text-fg-muted"
                }`}
              >
                {r.n}
              </span>
            )}
          </Link>
        ))}
      </nav>
      {direita && <div className="flex flex-wrap items-center gap-2">{direita}</div>}
    </div>
  );
}

/** A coluna da lista: rola por dentro; o rodapé (paginação, lote) fica embaixo. */
export function ColunaDaLista({ topo, children, rodape }: { topo?: ReactNode; children: ReactNode; rodape?: ReactNode }) {
  return (
    <>
      {topo}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-y flex flex-col gap-2 pr-1 -mr-1 pb-1">{children}</div>
      {rodape && <div className="pt-3">{rodape}</div>}
    </>
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
};

export function CartaoDeConversa(p: CartaoDeConversaProps) {
  return (
    <div
      className={`flex items-stretch rounded-lg border bg-surface transition-colors ${
        p.selecionada ? "border-brand ring-1 ring-brand/30" : "border-border hover:border-brand/40"
      }`}
    >
      {p.antes}
      <Link
        href={p.href}
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
    <div className="flex items-center gap-2 px-3 h-12 border-b border-border shrink-0">
      <Link href={fecharHref} aria-label="Fechar e voltar à lista" title="Fechar (Esc)" className="inline-flex items-center justify-center w-8 h-8 rounded-md text-fg-secondary hover:bg-surface-hover hover:text-fg">
        <X size={16} />
      </Link>
      <span className="h-5 w-px bg-border mx-1" aria-hidden />
      {anteriorHref ? (
        <Link href={anteriorHref} aria-label="Conversa anterior" title="Anterior (↑)" className={`${seta} hover:bg-surface-hover hover:text-fg`}>
          <ChevronUp size={16} />
        </Link>
      ) : (
        <span className={`${seta} opacity-40`} aria-hidden>
          <ChevronUp size={16} />
        </span>
      )}
      {proximaHref ? (
        <Link href={proximaHref} aria-label="Próxima conversa" title="Próxima (↓)" className={`${seta} hover:bg-surface-hover hover:text-fg`}>
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
 * O painel do contato: etiquetas, o nome grande, as ações rápidas, os dados e,
 * embaixo, o conteúdo (abas, conversa). Rola por dentro; a barra fica parada.
 */
export function PainelDeConversa({
  barra,
  etiquetas,
  titulo,
  subtitulo,
  acoes,
  aviso,
  infos,
  children,
}: {
  barra: ReactNode;
  etiquetas?: ReactNode[];
  titulo: string;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  aviso?: ReactNode;
  infos?: ReactNode;
  children?: ReactNode;
}) {
  const visiveis = (etiquetas ?? []).filter(Boolean);
  return (
    <section className="flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden" aria-label={titulo}>
      {barra}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-y">
        <div className="px-5 sm:px-6 pt-5 pb-4 bg-gradient-to-b from-brand/[0.05] to-transparent">
          {visiveis.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui text-fg-secondary mb-2">
              {visiveis.map((e, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-fg-muted" aria-hidden>·</span>}
                  {e}
                </span>
              ))}
            </div>
          )}
          <h2 className="text-title font-semibold text-fg break-words">{titulo}</h2>
          {subtitulo && <div className="text-ui text-fg-muted mt-0.5">{subtitulo}</div>}
          {acoes && <div className="flex flex-wrap items-center gap-1 mt-3 -ml-2">{acoes}</div>}
        </div>
        {aviso && <div className="px-5 sm:px-6 pb-3">{aviso}</div>}
        {infos && <div className="px-5 sm:px-6 py-3 border-t border-border-soft">{infos}</div>}
        {children}
      </div>
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
