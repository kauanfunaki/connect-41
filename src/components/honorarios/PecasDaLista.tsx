"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";

// As peças comuns às cinco abas de Contratos e honorários (26/11/2026,
// melhoria-813, alternativa A escolhida pelo Kauan): a tabela no padrão do
// app, um selo curto na Situação, uma ação de largura fixa e o ⋯ em cada
// linha, e o detalhe num painel lateral em seções. Antes cada aba tinha a sua
// tabela, com até três botões por linha e o detalhe numa linha aberta embaixo.

/** A tabela das abas, no casco do app (`.c41-tabela`: centralizada, cabeçalho azul). */
export const CLASSE_DA_TABELA = "c41-tabela overflow-x-auto bg-surface border border-border rounded-lg";

/** A largura da ação da linha: a mesma em todas as linhas, para a coluna não dançar. */
const LARGURA_DA_ACAO = "w-32 justify-center";

/** O nome da empresa (ou da pasta) na linha: abre o painel, pelo clique ou pelo Enter. */
export function NomeQueAbre({ nome, sub, aoAbrir, aberto }: { nome: string; sub?: ReactNode; aoAbrir: () => void; aberto: boolean }) {
  return (
    <>
      <button
        type="button"
        onClick={aoAbrir}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title={nome}
        className="inline-block max-w-[18rem] truncate align-bottom font-semibold text-fg hover:text-brand focus-visible:text-brand transition-colors"
      >
        {nome}
      </button>
      {sub && <span className="block text-micro text-fg-muted tabular-nums">{sub}</span>}
    </>
  );
}

/**
 * A Situação da linha: um selo com ícone e texto curto. O resto (motivo,
 * alertas, distrato) vai na dica e no painel; `mais` conta os pontos de
 * atenção que não couberam no selo.
 */
export function SeloDaSituacao({ tom, icone, children, mais = 0, dica }: { tom: TomDoSelo; icone: ReactNode; children: ReactNode; mais?: number; dica?: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={dica}>
      <Selo tom={tom} className="gap-1 [&>svg]:size-3 [&>svg]:shrink-0">
        {icone}
        {children}
      </Selo>
      {mais > 0 && (
        <span className="text-micro font-semibold text-fg-muted tabular-nums">
          <span aria-hidden>+{mais}</span>
          <span className="sr-only">e mais {mais} {mais === 1 ? "ponto" : "pontos"} de atenção</span>
        </span>
      )}
    </span>
  );
}

/** Um item do ⋯ da linha ou do pé do painel. */
export type ItemDasAcoes = {
  rotulo: string;
  icone?: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Linha de apoio — o motivo de o item estar desligado. */
  descricao?: string;
  danger?: boolean;
};

/** O ⋯ com os itens dados (os falsos ficam de fora). Fecha ao escolher. */
export function MaisAcoes({ itens, rotulo, size = "sm" }: { itens: (ItemDasAcoes | false | null | undefined)[]; rotulo: string; size?: "sm" | "md" }) {
  const visiveis = itens.filter((i): i is ItemDasAcoes => !!i);
  if (!visiveis.length) return <span className={size === "md" ? "size-8" : "size-7"} aria-hidden />;
  return (
    <MenuDeMaisAcoes sempreMenu rotulo={rotulo} width={240} size={size}>
      {({ close }) =>
        visiveis.map((i) => (
          <ItemDoMenu
            key={i.rotulo}
            href={i.disabled ? undefined : i.href}
            icone={i.icone}
            disabled={i.disabled}
            descricao={i.descricao}
            danger={i.danger}
            onClick={() => {
              close();
              i.onClick?.();
            }}
          >
            {i.rotulo}
          </ItemDoMenu>
        ))
      }
    </MenuDeMaisAcoes>
  );
}

/** A ação principal da linha: botão de largura fixa (ou link com cara de botão). */
export type AcaoPrincipal = { rotulo: string; icone?: ReactNode; onClick?: () => void; href?: string; disabled?: boolean; titulo?: string };

/** A célula de ações: uma ação principal, de largura fixa, e o ⋯ com as outras. */
export function AcoesDaLinha({ principal, menu, nome }: { principal: AcaoPrincipal | null; menu: (ItemDasAcoes | false | null | undefined)[]; nome: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {principal ? <BotaoDaAcao acao={principal} className={LARGURA_DA_ACAO} /> : <span className="w-32" aria-hidden />}
      <MaisAcoes itens={menu} rotulo={`Mais ações: ${nome}`} />
    </div>
  );
}

function BotaoDaAcao({ acao, className = "", size = "xs", variant = "secondary" }: { acao: AcaoPrincipal; className?: string; size?: "xs" | "sm"; variant?: "primary" | "secondary" }) {
  const classe = `whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0 ${className}`.trim();
  if (acao.href && !acao.disabled) {
    return (
      <Button href={acao.href} variant={variant} size={size} title={acao.titulo} className={classe}>
        {acao.icone}
        {acao.rotulo}
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={acao.onClick} disabled={acao.disabled} title={acao.titulo} className={classe}>
      {acao.icone}
      {acao.rotulo}
    </Button>
  );
}

// ── Painel lateral ──────────────────────────────────────────────────

/** A linha embaixo do título do painel: CNPJ, responsável e o atalho para a ficha. */
export function SubtituloDoPainel({ partes, empresaId }: { partes: (string | null | undefined)[]; empresaId?: string }) {
  const texto = partes.filter(Boolean).join(" · ");
  return (
    <p className="-mt-1 mb-4 text-label text-fg-muted tabular-nums">
      {texto}
      {empresaId && (
        <>
          {texto && " · "}
          <Link href={`/empresas/${empresaId}`} className="font-medium text-brand hover:underline">
            Abrir empresa
          </Link>
        </>
      )}
    </p>
  );
}

/** Uma seção do painel, com o rótulo em caixa alta (o do painel de Filtros). */
export function SecaoDoPainel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-soft py-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="c41-rotulo mb-2">{rotulo}</h3>
      <div className="text-label text-fg-secondary">{children}</div>
    </section>
  );
}

/** O pé do painel, preso embaixo: o ⋯ à esquerda e as ações à direita, a principal por último. */
export function PeDoPainel({ menu, secundaria, principal, nome }: { menu?: (ItemDasAcoes | false | null | undefined)[]; secundaria?: AcaoPrincipal | null; principal?: AcaoPrincipal | null; nome: string }) {
  if (!secundaria && !principal && !(menu ?? []).some(Boolean)) return null;
  return (
    <div className="sticky bottom-0 -mx-5 -mb-4 mt-2 flex items-center gap-2 border-t border-border bg-surface-elevated px-5 py-3">
      {menu && <MaisAcoes itens={menu} rotulo={`Mais ações: ${nome}`} size="md" />}
      <span className="flex-1" />
      {secundaria && <BotaoDaAcao acao={secundaria} size="sm" />}
      {principal && <BotaoDaAcao acao={principal} size="sm" variant="primary" />}
    </div>
  );
}
