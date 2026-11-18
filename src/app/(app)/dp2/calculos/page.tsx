import { Building2, Calculator, ChartLine, FileSignature, Gift, Landmark, Palmtree, Sheet, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { MesDoPainel } from "@/components/dp2/MesDoPainel";
import { Secao } from "@/components/dp2/Secao";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { tabelasDoEscritorio } from "@/lib/dp2/servidor";
import { CENARIOS, calcularExemplos, exemploDaFormula, formulasDoTema, rubricasDaFormula, TEMAS, type TemaDaFormula } from "@/lib/dp2/formulas";
import { NOME_DA_TABELA, tabelasDaCompetencia, type TabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { brl, mesAtual, nomeDaCompetencia } from "@/lib/dp2/tela";
import { num } from "@/lib/dp2/formato";

const ICONE: Record<TemaDaFormula | "TABELAS", React.ReactNode> = {
  MENSAL: <Calculator />,
  IMPOSTOS: <Landmark />,
  ENCARGOS: <Building2 />,
  MEDIAS: <ChartLine />,
  FERIAS: <Palmtree />,
  DECIMO: <Gift />,
  RESCISAO: <FileSignature />,
  SEM_VINCULO: <UsersRound />,
  TABELAS: <Sheet />,
};

const pct = (v: number) => `${num(v)}%`;
const mesDe = (v: string) => `${v.slice(5, 7)}/${v.slice(0, 4)}`;

function TabelasVigentes({ tabelas }: { tabelas: TabelasDaCompetencia }) {
  const { inss, irrf, salarioMinimo, salarioFamilia } = tabelas;
  const origem = (o: "LEI" | "ESCRITORIO") => <Selo tom={o === "ESCRITORIO" ? "marca" : "neutro"}>{o === "ESCRITORIO" ? "do escritório" : "da lei"}</Selo>;
  const cabeca = (titulo: string, vigencia: string, o: "LEI" | "ESCRITORIO") => (
    <div className="flex flex-wrap items-center gap-2 mb-1">
      <span className="font-medium">{titulo}</span>
      <span className="text-fs-2 text-fg-muted">desde {mesDe(vigencia)}</span>
      {origem(o)}
    </div>
  );
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        {cabeca(NOME_DA_TABELA.INSS, inss.vigencia, inss.origem)}
        <ul className="text-fs-2 tabular-nums space-y-0.5">
          {inss.dados.faixas.map((f, i) => (
            <li key={f.ate}>
              {brl(i === 0 ? 0 : inss.dados.faixas[i - 1].ate + 0.01)} a {brl(f.ate)}: {pct(f.aliquota)}
            </li>
          ))}
        </ul>
        <p className="text-fs-1 text-fg-muted mt-1">{inss.fundamento}</p>
      </div>
      <div>
        {cabeca(NOME_DA_TABELA.IRRF, irrf.vigencia, irrf.origem)}
        <ul className="text-fs-2 tabular-nums space-y-0.5">
          {irrf.dados.faixas.map((f, i) => (
            <li key={i}>
              {f.ate === null ? "acima" : `até ${brl(f.ate)}`}: {f.aliquota === 0 ? "isento" : `${pct(f.aliquota)} − ${brl(f.deducao)}`}
            </li>
          ))}
        </ul>
        <p className="text-fs-2 text-fg-muted tabular-nums mt-1">
          Dependente {brl(irrf.dados.deducaoDependente)} · simplificado {brl(irrf.dados.descontoSimplificado)} · retém a partir de {brl(irrf.dados.minimoRetencao)}
        </p>
        {irrf.dados.reducao && (
          <p className="text-fs-2 text-fg-muted tabular-nums">
            Redução: zera até {brl(irrf.dados.reducao.isentoAte)}; parcial até {brl(irrf.dados.reducao.ate)} ({brl(irrf.dados.reducao.constante)} − {num(irrf.dados.reducao.fator)} × rendimentos)
            {irrf.dados.reducao.noDecimo ? "; vale no 13º" : "; não vale no 13º"}
          </p>
        )}
        <p className="text-fs-1 text-fg-muted mt-1">{irrf.fundamento}</p>
      </div>
      <div>
        {cabeca(NOME_DA_TABELA.SALARIO_MINIMO, salarioMinimo.vigencia, salarioMinimo.origem)}
        <p className="text-fs-2 tabular-nums">{brl(salarioMinimo.dados.valor)}</p>
        <p className="text-fs-1 text-fg-muted mt-1">{salarioMinimo.fundamento}</p>
      </div>
      <div>
        {cabeca(NOME_DA_TABELA.SALARIO_FAMILIA, salarioFamilia.vigencia, salarioFamilia.origem)}
        <p className="text-fs-2 tabular-nums">
          {brl(salarioFamilia.dados.cota)} por filho, para remuneração até {brl(salarioFamilia.dados.limite)}
        </p>
        <p className="text-fs-1 text-fg-muted mt-1">{salarioFamilia.fundamento}</p>
      </div>
    </div>
  );
}

/**
 * Apoio › Cálculos (18/11/2026, funcionalidade-778): todas as fórmulas que o
 * motor do DP 2 usa, com um exemplo que sai da memória do próprio motor e as
 * tabelas da competência. Só o DP 2 vê: o módulo é do setor e fica no grupo
 * Apoio do menu dele (não no Apoio do Geral). O conteúdo mora em
 * `src/lib/dp2/formulas.ts`.
 */
export default async function CalculosDoDp2({ searchParams }: { searchParams: Promise<{ mes?: string; tema?: string }> }) {
  const params = await searchParams;
  const { ctx } = await abrirTelaDoModulo("dp2_calculos");
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? "") ? params.mes! : mesAtual();
  const [ano, m] = mes.split("-").map(Number);
  const temas = TEMAS.map((t) => t.tema as string);
  const tema = params.tema === "TABELAS" || temas.includes(params.tema ?? "") ? params.tema! : "MENSAL";

  const tab = tabelasDaCompetencia(mes, await tabelasDoEscritorio(ctx.tenantId));
  const href = (t: string) => `/dp2/calculos?mes=${mes}&tema=${t}`;
  const abas = [
    ...TEMAS.map((t) => ({ chave: t.tema, rotulo: t.aba, href: href(t.tema), icone: ICONE[t.tema] })),
    { chave: "TABELAS", rotulo: "Tabelas", href: href("TABELAS"), icone: ICONE.TABELAS },
  ];

  let conteudo: React.ReactNode;
  if (!tab.ok) {
    conteudo = <Aviso tom="perigo">Faltam tabelas para {nomeDaCompetencia(ano, m)}: {tab.faltam.join(", ")}. Escolha outra competência ou grave a tabela em DP 2 › Tabelas oficiais.</Aviso>;
  } else if (tema === "TABELAS") {
    conteudo = (
      <div className="flex flex-col gap-5">
        <Secao titulo={`Tabelas de ${nomeDaCompetencia(ano, m)}`} apoio="As mesmas que o cálculo da competência usa: a da lei ou, na mesma vigência, a gravada pelo escritório.">
          <TabelasVigentes tabelas={tab.tabelas} />
        </Secao>
        <Secao titulo="Os cenários dos exemplos" apoio="Cada exemplo das abas sai do motor rodando estes cenários com as tabelas acima. Monte o mesmo na Domínio para comparar.">
          <dl className="flex flex-col gap-3">
            {CENARIOS.map((c) => (
              <div key={c.nome}>
                <dt className="font-medium">{c.nome}</dt>
                <dd className="text-fs-2 text-fg-muted max-w-[90ch]">{c.descricao}</dd>
              </div>
            ))}
          </dl>
        </Secao>
      </div>
    );
  } else {
    const t = TEMAS.find((x) => x.tema === tema)!;
    const exemplos = calcularExemplos(mes, tab.tabelas);
    conteudo = (
      <Secao titulo={t.titulo} apoio={t.apoio}>
        <ul className="flex flex-col">
          {formulasDoTema(t.tema).map((f) => {
            const rubricas = rubricasDaFormula(f);
            const linhas = exemploDaFormula(f, exemplos);
            return (
              <li key={f.id} id={f.id} className="border-t border-border py-4 first:border-0 first:pt-0 last:pb-0">
                <h3 className="text-fs-4 font-semibold text-fg">{f.nome}</h3>
                <p className="mt-1 max-w-[90ch]">{f.conta}</p>
                {f.detalhe && <p className="text-fs-2 text-fg-muted mt-1 max-w-[90ch]">{f.detalhe}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-fs-1 text-fg-muted">
                  {rubricas.map((r) => (
                    <Selo key={r} tom="neutro">
                      {r}
                    </Selo>
                  ))}
                  <span>{f.baseLegal}</span>
                </div>
                {linhas.length > 0 && (
                  <div className="mt-3 rounded-md bg-surface-hover px-3 py-2">
                    <p className="text-fs-1 font-medium text-fg-muted mb-1">Exemplo calculado pelo motor · {nomeDaCompetencia(ano, m)}</p>
                    <ul className="text-fs-2 tabular-nums space-y-0.5 break-words">
                      {linhas.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Secao>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Cálculos" subtitle={`Fórmulas do DP 2 · ${nomeDaCompetencia(ano, m)}`} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <MesDoPainel mes={mes} />
      </div>
      <AbasDeLink abas={abas} ativa={tema} aria-label="Temas dos cálculos" />
      {conteudo}
    </PageContainer>
  );
}
