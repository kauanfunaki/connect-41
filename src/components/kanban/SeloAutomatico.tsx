import { Zap } from "lucide-react";
import { Selo } from "@/components/ui/Selo";

/**
 * O selo do que o sistema criou sozinho nos Quadros (27/11/2026,
 * funcionalidade-844): o espaço e a lista automáticos ("Automático") e o cartão
 * de um processo ("Automático · Processo nº 12"). Ícone e texto, não só cor.
 */
export function SeloAutomatico({ processo, className = "" }: { processo?: number | null; className?: string }) {
  const texto = processo ? `Automático · Processo nº ${processo}` : "Automático";
  return (
    <Selo tom="marca" className={`gap-1 ${className}`.trim()}>
      <Zap size={10} aria-hidden />
      {texto}
    </Selo>
  );
}
