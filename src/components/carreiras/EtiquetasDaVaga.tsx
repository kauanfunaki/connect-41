import { Banknote, Briefcase, MapPin } from "lucide-react";
import type { VagaContrato, VagaModalidade } from "@/generated/prisma/enums";
import { CONTRATO_LABEL, MODALIDADE_LABEL, faixaSalarialLegivel } from "@/lib/carreiras/portal";
import { Badge } from "@/components/ui/Badge";

type Props = {
  workMode: VagaModalidade | null;
  contractType: VagaContrato | null;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
};

/**
 * Modalidade, contrato e salário da vaga — o que o candidato quer saber antes de abrir.
 * Cada etiqueta é o `Badge`: são categorias da vaga, não a situação dela (regra por
 * papel, escolha 2A do Kauan, 08/10/2026). Antes, pílula à mão; em 07/10, o `Selo`.
 */
export function EtiquetasDaVaga(v: Props) {
  const salario = faixaSalarialLegivel(v);
  const itens: { icone: React.ReactNode; texto: string; destaque?: boolean }[] = [];
  if (v.workMode) itens.push({ icone: <MapPin size={12} />, texto: MODALIDADE_LABEL[v.workMode] });
  if (v.contractType) itens.push({ icone: <Briefcase size={12} />, texto: CONTRATO_LABEL[v.contractType] });
  itens.push({ icone: <Banknote size={12} />, texto: salario, destaque: v.showSalary && salario !== "A combinar" });

  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((i) => (
        <Badge key={i.texto} variant={i.destaque ? "success" : "neutral"} className="gap-1 tabular-nums">
          {i.icone}
          {i.texto}
        </Badge>
      ))}
    </div>
  );
}
