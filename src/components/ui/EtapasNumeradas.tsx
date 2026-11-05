import Link from "next/link";
import { Check } from "lucide-react";

export type EtapaNumerada = {
  chave: string;
  rotulo: string;
  href: string;
  /** Vira o `title` do link: o que se faz nesta etapa. */
  resumo?: string;
};

/**
 * As etapas de um trabalho em ordem, como links numerados (03/11/2026, para
 * o de-para e lançamentos do Contábil; o desenho é o das etapas do SPED
 * ICMS/IPI no SPED Fiscal). As anteriores à atual aparecem como
 * percorridas: o ✓ só diz a ordem do trabalho, não que a etapa foi aceita.
 */
export function EtapasNumeradas({ etapas, atual, "aria-label": rotulo }: { etapas: EtapaNumerada[]; atual: string; "aria-label": string }) {
  const indiceAtual = etapas.findIndex((e) => e.chave === atual);
  return (
    <nav aria-label={rotulo} className="mb-6">
      <ol className="flex flex-wrap items-center gap-y-2">
        {etapas.map((e, i) => {
          const esta = e.chave === atual;
          const antes = i < indiceAtual;
          return (
            <li key={e.chave} className="flex items-center">
              {i > 0 && <span aria-hidden className={`mx-2 h-px w-6 sm:w-10 ${antes || esta ? "bg-brand" : "bg-border-strong"}`} />}
              <Link
                href={e.href}
                aria-current={esta ? "step" : undefined}
                title={e.resumo}
                className={`group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors focus-visible:outline-2 focus-visible:outline-brand ${esta ? "bg-brand-subtle" : "hover:bg-surface-hover"}`}
              >
                <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] text-helper font-semibold ${
                  esta ? "border-brand-solid bg-brand-solid text-on-brand" : antes ? "border-brand text-brand" : "border-border-strong text-fg-secondary"
                }`}>
                  {antes ? <Check size={14} aria-hidden /> : i + 1}
                </span>
                <span className={`text-ui font-semibold whitespace-nowrap ${esta ? "text-fg" : "text-fg-secondary group-hover:text-fg"}`}>{e.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
