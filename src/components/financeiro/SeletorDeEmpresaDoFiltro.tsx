import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { FiltroDaEmpresa } from "@/components/empresas/FiltroDaEmpresa";

type Props = {
  acao: string;
  empresas: (EmpresaParaEscolher & { nome: string })[];
  empresaId: string | null;
  permitirTodas?: boolean;
  extras?: Record<string, string | undefined>;
};

/**
 * A empresa como única escolha do topo, sem "Aplicar" (08/10/2026), nas telas
 * leves do BPO que usam o `FiltroDePeriodo` com `navegaSozinho` (Comunicação,
 * alçadas das Aprovações).
 *
 * Desde 13/10/2026 é o seletor das telas da equipe (`SeletorDeEmpresaDaTela`),
 * que grava a escolha como a última empresa aberta. Aqui "Todas as empresas"
 * é o padrão da tela — sem parâmetro na URL —, porque estas telas são leves e
 * continuam abrindo em todas.
 */
export function SeletorDeEmpresaDoFiltro({ acao, empresas, empresaId, permitirTodas, extras }: Props) {
  return (
    <FiltroDaEmpresa
      acao={acao}
      empresas={empresas}
      valor={empresaId}
      manter={extras}
      todas={permitirTodas ? "padrao" : undefined}
    />
  );
}
