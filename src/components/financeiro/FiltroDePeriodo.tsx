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
  /**
   * O mês escolhido aparece em número, "10/2026", e não "out 2026" — a família
   * da DRE (pedido do Kauan, 14/10/2026). As outras telas seguem por extenso.
   */
  mesEmNumero?: boolean;
  /**
   * O seletor de mês oferece também o ano inteiro (14/10/2026, DRE do portal,
   * como a aba "Ano inteiro" da DRE da equipe): escolhido, vai na URL como
   * `ano=AAAA` no lugar de `mes`.
   */
  anoInteiro?: boolean;
  /** "AAAA" — a tela está no ano inteiro. Só com `anoInteiro`; vale no lugar de `mes`. */
  ano?: string;
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
  /**
   * Dentro da fileira da empresa (`FiltroDaEmpresa`, 13/10/2026): o formulário
   * não monta caixa própria, e mês e "Aplicar" entram na mesma linha do
   * seletor, que navega sozinho.
   */
  naFileira?: boolean;
};

/**
 * Empresa e mês por GET.
 *
 * Formulário comum com botão, e não select que navega sozinho: com quase
 * quatrocentas empresas, quem troca empresa e mês de uma vez não quer duas
 * navegações — e o GET deixa a URL copiável, que é como relatório é mandado
 * para outra pessoa.
 */
export function FiltroDePeriodo({
  acao,
  empresas,
  empresaId,
  permitirTodas,
  mes,
  mesEmNumero,
  anoInteiro,
  ano,
  extras,
  children,
  navegaSozinho,
  naFileira,
}: Props) {
  const periodo = anoInteiro && ano !== undefined ? ano : mes;
  if (navegaSozinho && empresas && periodo === undefined && !children) {
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
    <form method="get" action={acao} className={naFileira ? "contents" : "flex flex-wrap items-center gap-2 mb-4"}>
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
      {periodo !== undefined && (
        <CampoMes
          compact
          name="mes"
          nomeDoAno={anoInteiro ? "ano" : undefined}
          defaultValue={periodo}
          // "Ano de 2026" é mais comprido que "10/2026".
          className={anoInteiro ? "w-44" : "w-40"}
          aria-label={anoInteiro ? "Mês ou ano" : "Mês"}
          mesEmNumero={mesEmNumero}
        />
      )}
      {children}
      <Button type="submit" variant="secondary" size="sm">
        Aplicar
      </Button>
    </form>
  );
}
