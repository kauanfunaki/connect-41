import { Card } from "@/components/ui/Card";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import type { CodigoDoModelo } from "@/lib/dre/estrutura";
import { TabelaDaDre } from "@/components/dre/TabelaDaDre";

type Props = {
  resultado: ResultadoDoDre;
  /** Só na equipe: o "Mover" de cada categoria (ver `TabelaDaDre`). */
  mover?: { companyId: string; modelo: CodigoDoModelo };
};

/**
 * A DRE de um período — a da equipe (`/dre`, `/dre/economica`) e a do portal
 * do cliente. A tabela é de cliente, pelas linhas que abrem nas categorias
 * (13/10/2026); daqui vão só as linhas e o detalhe delas.
 */
export function RelatorioDoDre({ resultado, mover }: Props) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <TabelaDaDre linhas={resultado.linhas} detalhe={resultado.porCategoria} mover={mover} />
      </div>
    </Card>
  );
}
