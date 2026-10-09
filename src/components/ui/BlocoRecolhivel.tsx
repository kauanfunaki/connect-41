"use client";

import { Accordion } from "@/components/ui/Accordion";

type Props = {
  /** O nome do grupo — "BPO", "Para mim". */
  titulo: React.ReactNode;
  /** O resumo na linha, à direita do título: "6 de 9 ligados". */
  resumo?: React.ReactNode;
  /** A bolinha antes do título, na cor do setor. */
  cor?: string;
  /**
   * Um controle no cabeçalho que vale para o grupo todo — o interruptor do
   * grupo, "Marcar todos". Fica por cima do cabeçalho, à direita, e não dentro
   * dele: o cabeçalho já é um botão, e um controle não pode morar dentro de
   * outro.
   */
  acao?: React.ReactNode;
  /**
   * O espaço que a ação toma à direita do cabeçalho, como classe de padding —
   * `pr-16` (o padrão) cabe um interruptor; texto pede mais.
   */
  espacoDaAcao?: string;
  /** Não controlado: começa fechado (a regra do Kauan, 08/10/2026). */
  abertoInicial?: boolean;
  /** Controlado: a busca abre o grupo de quem casa. */
  aberto?: boolean;
  onAbertoChange?: (aberto: boolean) => void;
  /** Do bloco inteiro — borda e raio já vêm; fundo e sombra, de quem usa. */
  className?: string;
  /** Da caixa do conteúdo. Padrão: o recuo do cabeçalho, sem borda. */
  classeDoConteudo?: string;
  children: React.ReactNode;
};

/**
 * Grupo de uma lista longa num bloco que recolhe (08/10/2026): Administração
 * › Módulos, os módulos do plano e as preferências de notificação.
 *
 * É o `Accordion` com o cabeçalho de grupo já desenhado — bolinha, nome em
 * negrito e o resumo encostado à direita, como os setores do Valora — e o lugar
 * de um controle de grupo, que o `Accordion` não tem (o título dele é o
 * próprio botão). Começa fechado, e o resumo diz o que há dentro sem abrir.
 */
export function BlocoRecolhivel({
  titulo,
  resumo,
  cor,
  acao,
  espacoDaAcao = "pr-16",
  abertoInicial = false,
  aberto,
  onAbertoChange,
  className = "",
  classeDoConteudo = "px-4 pb-3",
  children,
}: Props) {
  return (
    <div className={`relative rounded-lg border border-border ${className}`.trim()}>
      {/* Na altura da linha do cabeçalho (py-3 + leading-5): o controle de 20px
          fica centrado no título. Vem antes do bloco no HTML para o Tab chegar
          nele logo, e não depois de todos os itens do grupo aberto. */}
      {acao && <div className="absolute right-4 top-3 flex h-5 items-center">{acao}</div>}
      <Accordion
        abertoInicial={abertoInicial}
        aberto={aberto}
        onAbertoChange={onAbertoChange}
        classeDoCabecalho={`w-full px-4 py-3 text-label leading-5 ${acao ? espacoDaAcao : ""}`.trim()}
        classeDoConteudo={classeDoConteudo}
        titulo={
          <span className="flex w-full min-w-0 items-center gap-2">
            {cor && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: cor }} />}
            <span className="min-w-0 font-semibold text-fg">{titulo}</span>
            {resumo != null && <span className="ml-auto shrink-0 text-ui text-fg-muted tabular-nums">{resumo}</span>}
          </span>
        }
      >
        {children}
      </Accordion>
    </div>
  );
}
