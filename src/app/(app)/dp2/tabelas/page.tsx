import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo } from "@/components/ui/Selo";
import { FormularioDeTabela } from "@/components/dp2/FormularioDeTabela";
import { Secao } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { canManageSector } from "@/lib/auth/context";
import { tabelasDoEscritorio } from "@/lib/dp2/servidor";
import { NOME_DA_TABELA, TABELAS_DA_LEI, TIPOS_DE_TABELA, tabelaVigente, type DadosDaTabela, type TipoDeTabela, type VersaoDaTabela } from "@/lib/dp2/tabelas";
import { brl, mesAtual } from "@/lib/dp2/tela";
import { num } from "@/lib/dp2/formato";
import { salvarTabelaAction } from "../actions";

const pct = (v: number) => `${num(v)}%`;
const mesDe = (v: string) => `${v.slice(5, 7)}/${v.slice(0, 4)}`;

function Conteudo({ versao }: { versao: VersaoDaTabela }) {
  if (versao.tipo === "INSS") {
    const d = versao.dados as DadosDaTabela["INSS"];
    return (
      <ul className="text-fs-2 tabular-nums space-y-0.5">
        {d.faixas.map((f, i) => (
          <li key={f.ate}>
            {brl(i === 0 ? 0 : d.faixas[i - 1].ate + 0.01)} a {brl(f.ate)}: {pct(f.aliquota)}
          </li>
        ))}
      </ul>
    );
  }
  if (versao.tipo === "IRRF") {
    const d = versao.dados as DadosDaTabela["IRRF"];
    return (
      <div className="text-fs-2 tabular-nums space-y-0.5">
        <ul>
          {d.faixas.map((f, i) => (
            <li key={i}>
              {f.ate === null ? "acima" : `até ${brl(f.ate)}`}: {f.aliquota === 0 ? "isento" : `${pct(f.aliquota)} − ${brl(f.deducao)}`}
            </li>
          ))}
        </ul>
        <p className="text-fg-muted">
          Dependente {brl(d.deducaoDependente)} · simplificado {brl(d.descontoSimplificado)} · retém a partir de {brl(d.minimoRetencao)}
        </p>
        {d.reducao && (
          <p className="text-fg-muted">
            Redução: zera até {brl(d.reducao.isentoAte)}; parcial até {brl(d.reducao.ate)}
            {d.reducao.noDecimo ? "; vale no 13º" : "; não aplicada ao 13º"}
          </p>
        )}
      </div>
    );
  }
  if (versao.tipo === "SALARIO_MINIMO") return <p className="text-fs-2 tabular-nums">{brl((versao.dados as DadosDaTabela["SALARIO_MINIMO"]).valor)}</p>;
  const d = versao.dados as DadosDaTabela["SALARIO_FAMILIA"];
  return (
    <p className="text-fs-2 tabular-nums">
      {brl(d.cota)} por filho, para remuneração até {brl(d.limite)}
    </p>
  );
}

/**
 * Tabelas oficiais do DP 2 (11/11/2026): as da lei, que vêm no código, e as
 * que o escritório gravar quando a lei muda antes do código. Na mesma
 * vigência, a do escritório vale.
 */
export default async function TabelasOficiaisDoDp2() {
  const { ctx, setor } = await abrirTelaDoModulo("dp2_tabelas");
  const doEscritorio = await tabelasDoEscritorio(ctx.tenantId);
  const hoje = mesAtual();
  const podeGerir = canManageSector(ctx, setor);

  return (
    <PageContainer>
      <PageHeader
        title="Tabelas oficiais"
        subtitle="INSS, IRRF, salário mínimo e salário-família, cada uma com a competência em que passa a valer. O cálculo usa a mais nova até o mês da competência."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {TIPOS_DE_TABELA.map((tipo: TipoDeTabela) => {
          const vigente = tabelaVigente(tipo, hoje, doEscritorio);
          const versoes = [...TABELAS_DA_LEI, ...doEscritorio].filter((v) => v.tipo === tipo).sort((a, b) => (a.vigencia < b.vigencia ? 1 : -1));
          return (
            <Secao key={tipo} titulo={NOME_DA_TABELA[tipo]} apoio={vigente ? `Vale hoje a de ${mesDe(vigente.vigencia)}.` : "Nenhuma tabela vale hoje."}>
              <ul className="flex flex-col gap-4">
                {versoes.map((v) => (
                  <li key={`${v.origem}-${v.vigencia}`} className="border-t border-border pt-3 first:border-0 first:pt-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium">A partir de {mesDe(v.vigencia)}</span>
                      <Selo tom={v.origem === "ESCRITORIO" ? "marca" : "neutro"}>{v.origem === "ESCRITORIO" ? "do escritório" : "da lei"}</Selo>
                      {vigente === v && <Selo tom="sucesso">vale hoje</Selo>}
                    </div>
                    <Conteudo versao={v} />
                    <p className="text-fs-1 text-fg-muted mt-1">{v.fundamento}</p>
                  </li>
                ))}
              </ul>
            </Secao>
          );
        })}
      </div>
      {podeGerir && (
        <Secao
          className="mt-5"
          titulo="Gravar uma tabela do escritório"
          apoio="Use quando sair uma portaria nova antes de o Connect ser atualizado. Gravar na mesma vigência substitui a versão anterior do escritório."
        >
          <FormularioDeTabela acao={salvarTabelaAction} />
        </Secao>
      )}
    </PageContainer>
  );
}
