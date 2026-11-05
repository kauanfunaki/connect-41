import { CalendarCheck, FileText, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { comRotulosEconomicos } from "@/lib/dre/economica";
import { lerDreDoCliente } from "@/lib/dre/doClientePublicado";
import { garantirFotoInicial, publicacoesDaEmpresa } from "@/lib/dre/publicacaoServidor";
import { anoValido, competenciaValida, rotuloDaCompetencia, somarMeses } from "@/lib/financeiro/periodo";
import { formatarCompetencia, formatInstantDate } from "@/lib/format";

type Props = {
  tenantId: string;
  companyId: string;
  /** `mes`, `ano` e `regime` da URL — os mesmos do portal. */
  params: { mes?: string; ano?: string; regime?: string };
  /** O tenant ligou a DRE econômica: a aba Competência aparece. */
  competenciaLiberada: boolean;
  /** Rota do filtro e das abas: `/portal/dre`, ou `/dre` na aba "Como o cliente vê". */
  acao: string;
  /** As empresas do seletor, quando há mais de uma para escolher (portal). */
  empresas?: (EmpresaParaEscolher & { nome: string })[];
  /** O que o filtro e as abas carregam além de empresa, período e regime (o `como=cliente`). */
  manter?: Record<string, string | undefined>;
};

/**
 * A DRE do cliente: filtro, abas Caixa e Competência, números do topo, tabela
 * e a nota do regime. É o corpo de `/portal/dre`, e o mesmo corpo aparece na
 * aba "Como o cliente vê" de `/dre` (21/10/2026) — um componente só, para a
 * equipe ver exatamente o que o cliente vê.
 *
 * Desde 05/11/2026 (decisão D4 do Kauan) lê a **última foto publicada** de cada
 * mês, e não os lançamentos ao vivo: importar ou classificar na DRE da equipe
 * não chega ao cliente até alguém publicar o mês. A primeira leitura de cada
 * empresa tira a foto inicial (ver `publicacaoServidor.ts`), para nada do que
 * o cliente já via sumir.
 *
 * O ano inteiro (14/10/2026) — os doze meses lado a lado, com média e total,
 * como a aba "Ano inteiro" da DRE da equipe — se escolhe no próprio campo do
 * mês ("Ano inteiro de 2026"), e vai na URL como `ano=2026` no lugar de `mes`.
 * Vale nas duas abas: na de Competência, os doze meses pela competência.
 */
export async function DreDoCliente({ tenantId, companyId, params, competenciaLiberada, acao, empresas, manter }: Props) {
  const regime = params.regime === "competencia" && competenciaLiberada ? "competencia" : "caixa";

  await garantirFotoInicial(tenantId, companyId);
  const publicacoes = await publicacoesDaEmpresa(tenantId, companyId);
  const ano = anoValido(params.ano);
  const leitura = lerDreDoCliente(publicacoes, { mes: ano ? null : competenciaValida(params.mes), ano }, regime);
  const mes = leitura.tipo === "mes" ? leitura.mes : undefined;

  const naUrl = new URLSearchParams();
  for (const [k, v] of Object.entries(manter ?? {})) if (v) naUrl.set(k, v);
  naUrl.set("empresa", companyId);
  if (ano) naUrl.set("ano", String(ano));
  else if (mes) naUrl.set("mes", mes);
  const base = `${acao}?${naUrl.toString()}`;

  // Os vazios vão num Card, como o "Nenhuma empresa vinculada" do portal e os
  // das outras telas dele — soltos, flutuavam no fundo da página.
  const vazio = (title: string, description?: string) => (
    <Card>
      <EmptyState icon={<FileText />} title={title} description={description} />
    </Card>
  );
  let conteudo: React.ReactNode;
  // Quantos meses entram na média do ano — a nota do pé diz.
  let mesesNaMedia: number | null = null;
  let atualizadaEm: Date | null = null;
  if (leitura.tipo === "ano") {
    if (!leitura.anual || leitura.anual.mesesComMovimento === 0) {
      conteudo = vazio(regime === "caixa" ? `Nenhum pagamento ou recebimento em ${leitura.ano}` : `Nenhum lançamento com competência em ${leitura.ano}`);
    } else {
      mesesNaMedia = leitura.anual.mesesComMovimento;
      atualizadaEm = leitura.atualizadaEm;
      conteudo = <RelatorioAnual anual={leitura.anual} regime={regime} />;
    }
  } else if (leitura.tipo === "nenhum") {
    conteudo = vazio("Ainda não há DRE para esta empresa", "A DRE aparece aqui quando a equipe publicar o primeiro mês.");
  } else if (!leitura.publicada) {
    // O mês existe, mas ninguém o publicou: a equipe ainda está conferindo.
    conteudo = vazio(`A DRE de ${formatarCompetencia(leitura.mes)} ainda não foi publicada`, "A equipe publica cada mês depois de conferir os números.");
  } else if (!leitura.publicada.temMovimento) {
    conteudo = vazio(
      regime === "caixa"
        ? `Nenhum pagamento ou recebimento em ${formatarCompetencia(leitura.mes)}`
        : `Nenhum lançamento com competência em ${formatarCompetencia(leitura.mes)}`
    );
  } else {
    const { resultado, anterior } = leitura.publicada;
    atualizadaEm = leitura.publicada.atualizadaEm;
    conteudo = (
      <>
        {/* Os números do topo com a comparação ao mês anterior, como em /dre
            (9A da página de decisões, 08/10/2026); o anterior é o publicado. */}
        <NumerosDaDre
          resultado={resultado}
          regime={regime}
          anterior={anterior ? { resultado: anterior, rotulo: rotuloDaCompetencia(somarMeses(leitura.mes, -1)) } : null}
          className="mb-4"
        />
        <RelatorioDoDre resultado={regime === "caixa" ? resultado : comRotulosEconomicos(resultado)} />
      </>
    );
  }

  return (
    <>
      <FiltroDePeriodo
        acao={acao}
        empresas={empresas && empresas.length > 1 ? empresas : undefined}
        empresaId={companyId}
        // Sem mês publicado, não há o que escolher: o campo vazio ("-- de ----")
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
            { chave: "caixa", rotulo: "Caixa", href: base, icone: <Wallet /> },
            { chave: "competencia", rotulo: "Competência", href: `${base}&regime=competencia`, icone: <CalendarCheck /> },
          ]}
          ativa={regime}
        />
      )}
      {/* "Atualizada em" (decisão D4): o cliente sabe de quando é o número que
          está vendo — a equipe publica quando confere, não a cada lançamento. */}
      {atualizadaEm && <p className="text-helper text-fg-muted mb-3">Atualizada em {formatInstantDate(atualizadaEm)}.</p>}
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
