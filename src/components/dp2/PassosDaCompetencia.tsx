"use client";

import { useRouter } from "next/navigation";
import { Stepper, type StepDef } from "@/components/ui/Stepper";

export type PassoDaCompetencia = StepDef & { href: string };

/**
 * O passo a passo de uma competência do DP 2 (13/11/2026), com o mesmo
 * `Stepper` do cadastro de empresa. Cada passo é um `?etapa=` da URL, então
 * clicar num passo já feito (ou já liberado) volta a ele; os que ainda não
 * foram liberados ficam travados.
 */
export function PassosDaCompetencia({ passos }: { passos: PassoDaCompetencia[] }) {
  const router = useRouter();
  return (
    <nav aria-label="Etapas da competência" className="mb-5 rounded-lg border border-border bg-surface overflow-hidden [&>ol]:border-b-0">
      <Stepper
        steps={passos}
        onStepClick={(i) => {
          const p = passos[i];
          if (p && !(p.disabled ?? p.status === "upcoming")) router.push(p.href, { scroll: false });
        }}
      />
    </nav>
  );
}
