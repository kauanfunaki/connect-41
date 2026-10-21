import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { mesesComMovimento } from "@/lib/dre/data";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { comRotulosEconomicos } from "@/lib/dre/economica";
import { dreDoClienteNoAno, dreDoClienteNoMes, opcoesDoCliente } from "@/lib/dre/doCliente";
import { anoValido, competenciaValida, competenciaDe, rotuloDaCompetencia, somarMeses } from "@/lib/financeiro/periodo";
import { formatarCompetencia } from "@/lib/format";

type Props = {
  tenantId: string;
  companyId: string;
  /** `mes`, `ano` e `regime` da URL — os mesmos do portal. */
  params: { mes?: string; ano?: string; regime?: string };
  /** O tenant ligou a DRE econômica: a aba Competência aparece. */
  competenciaLiberada: boolean;
  /** Rota do filtro e das abas: `/portal/dre`, ou `/dre` no "Ver como o cliente". */
  acao: string;
  /** As empresas do seletor, quando há mais de uma para escolher (portal). */
  empresas?: (EmpresaParaEscolher & { nome: string })[];
  /** O que o filtro e as abas carregam além de empresa, período e regime (o `como=cliente`). */
  manter?: Record<string, string | undefined>;
};

/**
 * A DRE do cliente: filtro, abas Caixa e Competência, números do topo, tabela
 * e a nota do regime. É o corpo de `/portal/dre`, e o mesmo corpo aparece no
 * "Ver como o cliente" de `/dre` (21/10/2026) — um componente só, para a
 * equipe ver exatamente o que o cliente vê.
 *
 * O ano inteiro (14/10/2026) — os doze meses lado a lado, com média e total,
 * como a aba "Ano inteiro" da DRE da equipe — se escolhe no próprio campo do
 * mês ("Ano inteiro de 2026"), e vai na URL como `ano=2026` no lugar de `mes`.
 * Vale nas duas abas: na de Competência, os doze meses pela competência.
 */
export async function DreDoCliente({ tenantId, companyId, params, competenciaLiberada, acao, empresas, manter }: Props) {
  const regime = params.regime === "competencia" && competenciaLiberada ? "competencia" : "caixa";

  const [meses, modelo] = await Promise.all([mesesComMovimento(tenantId, companyId), modeloDaEmpresa(tenantId, companyId)]);
  const opcoes = opcoesDoCliente(modelo);
  const recente = meses[0] ? competenciaDe(meses[0].ano, meses[0].mes) : undefined;
  const ano = anoValido(params.ano);
  const mes = ano ? undefined : (competenciaValida(params.mes) ?? recente);

  const naUrl = new URLSearchParams();
  for (const [k, v] of Object.entries(manter ?? {})) if (v) naUrl.set(k, v);
  naUrl.set("empresa", companyId);
  if (ano) naUrl.set("ano", String(ano));
  else if (mes) naUrl.set("mes", mes);
  const base = `${acao}?${naUrl.toString()}`;

  // Os vazios vão num Card, como o "Nenhuma empresa vinculada" do portal e os
  // das outras telas dele — soltos, flutuavam no fundo da página.
  let conteudo: React.ReactNode;
  // Quantos meses entram na média do ano — a nota do pé diz.
  let mesesNaMedia: number | null = null;
  if (ano) {
    const anual = await dreDoClienteNoAno(tenantId, companyId, ano, regime, opcoes);
    if (anual.mesesComMovimento === 0) {
      conteudo = (
        <Card>
          <EmptyState
            icon={<FileText />}
            title={regime === "caixa" ? `Nenhum pagamento ou recebimento em ${ano}` : `Nenhum lançamento com competência em ${ano}`}
          />
        </Card>
      );
    } else {
      mesesNaMedia = anual.mesesComMovimento;
      conteudo = <RelatorioAnual anual={anual} regime={regime} />;
    }
  } else if (!mes) {
    conteudo = (
      <Card>
        <EmptyState
          icon={<FileText />}
          title="Ainda não há DRE para esta empresa"
          description="A DRE aparece aqui quando a equipe lançar os pagamentos e recebimentos do mês."
        />
      </Card>
    );
  } else {
    // Os números do topo com a comparação ao mês anterior, como em /dre (9A da
    // página de decisões, 08/10/2026). No caixa, o mês anterior só entra
    // quando teve movimento.
    const mesAnterior = somarMeses(mes, -1);
    const temAnterior = meses.some((x) => competenciaDe(x.ano, x.mes) === mesAnterior);
    const dre = await dreDoClienteNoMes(tenantId, companyId, mes, regime, opcoes, temAnterior);
    conteudo = !dre.temMovimento ? (
      <Card>
        <EmptyState
          icon={<FileText />}
          title={
            regime === "caixa"
              ? `Nenhum pagamento ou recebimento em ${formatarCompetencia(mes)}`
              : `Nenhum lançamento com competência em ${formatarCompetencia(mes)}`
          }
        />
      </Card>
    ) : (
      <>
        <NumerosDaDre
          resultado={dre.resultado}
          regime={regime}
          anterior={dre.anterior ? { resultado: dre.anterior, rotulo: rotuloDaCompetencia(mesAnterior) } : null}
          className="mb-4"
        />
        <RelatorioDoDre resultado={regime === "caixa" ? dre.resultado : comRotulosEconomicos(dre.resultado)} />
      </>
    );
  }

  return (
    <>
      <FiltroDePeriodo
        acao={acao}
        empresas={empresas && empresas.length > 1 ? empresas : undefined}
        empresaId={companyId}
        // Sem mês com movimento, não há o que escolher: o campo vazio ("-- de ----")
        // só confundia.
        mes={mes ?? undefined}
        // O mês em número, "10/2026", como nos filtros da DRE da equipe (14/10/2026).
        mesEmNumero
        // "Ano inteiro de 2026" na grade do mês (14/10/2026).
        anoInteiro
        ano={ano ? String(ano) : undefined}
        extras={{
          ...manter,
          empresa: empresas && empresas.length > 1 ? undefined : companyId,
          regime: regime === "caixa" ? undefined : regime,
        }}
      />
      {competenciaLiberada && (
        <AbasDeLink
          abas={[
            { chave: "caixa", rotulo: "Caixa", href: base },
            { chave: "competencia", rotulo: "Competência", href: `${base}&regime=competencia` },
          ]}
          ativa={regime}
        />
      )}
      {conteudo}
      {/* Nota em `text-helper` (13px) desde 07/10/2026: era 11px, o tamanho do
          cabeçalho de tabela, numa explicação que o cliente lê no celular. */}
      <p className="text-helper text-fg-muted mt-3">
        {regime === "caixa"
          ? `Regime de caixa: o que foi efetivamente pago e recebido ${ano ? "em cada mês" : "no mês"}.`
          : `Regime de competência: o que pertence ${ano ? "a cada mês" : "ao mês"}, pago ou não.`}
        {/* A média divide pelos meses com movimento, como o AVERAGE do Excel e
            a DRE da equipe: dividir por doze em setembro diria que a empresa
            faturou 25% menos. */}
        {mesesNaMedia !== null &&
          ` A coluna Média divide por ${mesesNaMedia} ${mesesNaMedia === 1 ? "mês com movimento" : "meses com movimento"}, não por doze.`}
      </p>
    </>
  );
}
