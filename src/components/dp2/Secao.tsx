import { Card } from "@/components/ui/Card";

/** Um bloco da tela do DP 2: título, uma linha de apoio e o conteúdo. */
export function Secao({ titulo, apoio, acao, children, className = "" }: { titulo: string; apoio?: React.ReactNode; acao?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card as="section" className={`p-5 ${className}`.trim()}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-fs-5 font-semibold text-fg">{titulo}</h2>
          {apoio && <p className="text-fs-2 text-fg-muted mt-1 max-w-[70ch]">{apoio}</p>}
        </div>
        {acao}
      </div>
      {children}
    </Card>
  );
}

/** Classes das tabelas do DP 2, iguais às das outras listas do Connect. */
export const TH = "py-2 pr-3 font-medium text-left text-fs-2 text-fg-muted whitespace-nowrap";
export const TH_NUM = `${TH} text-right`;
export const TD = "py-2.5 pr-3 align-top";
export const TD_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
export const TR = "border-t border-border";
