import Link from "next/link";
import { BadgeCheck, FileCheck2, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { situacaoDaRenovacao, type Renovacao, type TipoDaRenovacao } from "@/lib/societario/renovacoes";

const ICONE: Record<TipoDaRenovacao, React.ReactNode> = {
  licenca: <BadgeCheck size={14} aria-hidden />,
  certidao: <FileCheck2 size={14} aria-hidden />,
  certificado: <KeyRound size={14} aria-hidden />,
};

/**
 * As renovações da empresa no topo da visão societária (04/11/2026, escolha A):
 * licenças, certidões e o certificado digital numa faixa só, do que vence
 * primeiro ao último, cada um com a ação. Responde "o que desta empresa vence?"
 * ao abrir — antes, certidão e certificado ficavam em outras telas.
 */
export function FaixaDeRenovacoes({ itens }: { itens: Renovacao[] }) {
  return (
    <Card as="section" aria-labelledby="renovacoes" className="mb-6 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="renovacoes" className="text-section font-semibold text-fg">
          Renovações
        </h2>
        <span className="text-fs-2 text-fg-muted">o que vence primeiro, à esquerda</span>
      </div>
      {itens.length === 0 ? (
        <p className="text-fs-2 text-fg-muted">Nenhuma licença, certidão ou certificado cadastrado para esta empresa.</p>
      ) : (
        <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))]">
          {itens.map((r) => {
            const s = situacaoDaRenovacao(r);
            return (
              <li key={r.chave} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-1.5 text-fs-2 text-fg-secondary">
                  <span className="shrink-0 text-fg-muted">{ICONE[r.tipo]}</span>
                  <span className="truncate" title={r.rotulo}>
                    {r.rotulo}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <Selo tom={s.tom}>{s.texto}</Selo>
                  {s.tom !== "sucesso" && (
                    <Link href={r.href} className="text-fs-2 font-medium text-brand hover:underline">
                      {r.acao}
                    </Link>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
