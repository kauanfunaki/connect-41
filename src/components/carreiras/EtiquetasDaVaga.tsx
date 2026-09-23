import { Banknote, Briefcase, MapPin } from "lucide-react";
import type { VagaContrato, VagaModalidade } from "@/generated/prisma/enums";
import { CONTRATO_LABEL, MODALIDADE_LABEL, faixaSalarialLegivel } from "@/lib/carreiras/portal";

type Props = {
  workMode: VagaModalidade | null;
  contractType: VagaContrato | null;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
};

/** Modalidade, contrato e salário da vaga — o que o candidato quer saber antes de abrir. */
export function EtiquetasDaVaga(v: Props) {
  const salario = faixaSalarialLegivel(v);
  const itens: { icone: React.ReactNode; texto: string; destaque?: boolean }[] = [];
  if (v.workMode) itens.push({ icone: <MapPin size={12} />, texto: MODALIDADE_LABEL[v.workMode] });
  if (v.contractType) itens.push({ icone: <Briefcase size={12} />, texto: CONTRATO_LABEL[v.contractType] });
  itens.push({ icone: <Banknote size={12} />, texto: salario, destaque: v.showSalary && salario !== "A combinar" });

  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <span
          key={i.texto}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border tabular-nums ${
            i.destaque ? "bg-success/10 text-success border-success/25 font-medium" : "bg-surface-2 text-fg-secondary border-border"
          }`}
        >
          {i.icone}
          {i.texto}
        </span>
      ))}
    </div>
  );
}
