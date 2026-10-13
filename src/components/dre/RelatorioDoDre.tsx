import { Card } from "@/components/ui/Card";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { TabelaDaDre } from "@/components/dre/TabelaDaDre";

type Props = { resultado: ResultadoDoDre };

/**
 * A DRE de um período — a da equipe (`/dre`, `/dre/economica`) e a do portal
 * do cliente. A tabela é de cliente, pelas linhas que abrem nas categorias
 * (13/10/2026); daqui vão só as linhas e o detalhe delas.
 */
export function RelatorioDoDre({ resultado }: Props) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <TabelaDaDre linhas={resultado.linhas} detalhe={resultado.porCategoria} />
      </div>
    </Card>
  );
}
