import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";
import { SeletorDeEmpresaDoFiltro } from "./SeletorDeEmpresaDoFiltro";

// `AbasDeLink` e `FaixaDeTotais` moravam aqui até 07/10/2026 e foram para
// `components/ui` (servem telas de todos os setores). Ficam reexportadas para
// as ~50 telas que importam deste endereço; código novo importa de `ui/`.
export { AbasDeLink } from "@/components/ui/AbasDeLink";
export { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";

type Props = {
  /** Rota do próprio formulário. */
  acao: string;
  empresas?: (EmpresaParaEscolher & { nome: string })[];
  empresaId?: string | null;
  /** Oferece "Todas as empresas" — telas de consolidado. */
  permitirTodas?: boolean;
  /** "AAAA-MM". Sem valor, o seletor de mês não aparece. */
  mes?: string;
  /** Parâmetros que o filtro precisa carregar (aba, modo…). */
  extras?: Record<string, string | undefined>;
  /** Campos a mais no mesmo formulário (ex.: centro de custo), antes do botão. */
  children?: React.ReactNode;
  /**
   * Sem mês e sem campos a mais, a empresa é a única escolha: troca e navega,
   * sem "Aplicar" (08/10/2026, a regra do `SeletorDeEmpresaQueNavega`). Opção
   * de cada tela, e não o padrão, porque o portal também usa este filtro.
   */
  navegaSozinho?: boolean;
};

/**
 * Empresa e mês por GET.
 *
 * Formulário comum com botão, e não select que navega sozinho: com quase
 * quatrocentas empresas, quem troca empresa e mês de uma vez não quer duas
 * navegações — e o GET deixa a URL copiável, que é como relatório é mandado
 * para outra pessoa.
 */
export function FiltroDePeriodo({ acao, empresas, empresaId, permitirTodas, mes, extras, children, navegaSozinho }: Props) {
  if (navegaSozinho && empresas && mes === undefined && !children) {
    return (
      <SeletorDeEmpresaDoFiltro
        acao={acao}
        empresas={empresas}
        empresaId={empresaId ?? null}
        permitirTodas={permitirTodas}
        extras={extras}
      />
    );
  }
  return (
    <form method="get" action={acao} className="flex flex-wrap items-center gap-2 mb-4">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {empresas && (
        // Com busca, e não `<select>`: a lista de empresas é longa (quase
        // quatrocentas no escritório), a mesma regra do cadastro de empresas.
        <SearchableSelect
          key={empresaId ?? ""}
          name="empresa"
          compact
          // No celular, a empresa e o "Aplicar" na mesma linha (02/10/2026):
          // com largura fixa, o botão caía sozinho na linha de baixo.
          className="min-w-0 flex-1 sm:flex-none sm:w-72 max-w-full"
          aria-label="Empresa"
          options={opcoesDeEmpresa(empresas)}
          avatar
          lembrarRecentes="empresas"
          defaultValue={empresaId ?? ""}
          vazioLabel={permitirTodas ? "Todas as empresas" : undefined}
          placeholder="Buscar empresa…"
        />
      )}
      {mes !== undefined && (
        <CampoMes compact name="mes" defaultValue={mes} className="w-40" aria-label="Mês" />
      )}
      {children}
      <Button type="submit" variant="secondary" size="sm">
        Aplicar
      </Button>
    </form>
  );
}
