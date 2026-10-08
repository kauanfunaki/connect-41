import { notFound } from "next/navigation";
import { AlertTriangle, FileText, CalendarDays, CalendarRange } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre } from "@/components/dre/RelatorioDoDre";
import { NumerosDaDre } from "@/components/dre/NumerosDaDre";
import { formatarCompetencia, formatarReaisDeCentavos as moeda } from "@/lib/format";
import { FilaDeClassificacao, type ItemParaClassificar } from "@/components/dre/FilaDeClassificacao";
import { dreDoMes, dreDoAnoDaEmpresa, mesesComMovimento } from "@/lib/dre/data";
import { dreDoAno } from "@/lib/dre/anual";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { ImportarDoOmie } from "@/components/dre/ImportarDoOmie";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { OPCOES_PADRAO, TRANSFERENCIA } from "@/lib/dre/estrutura";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";

/**
 * O mês do DRE no formato de competência do app, "Out/26" (08/10/2026). Era
 * "Outubro/2026" só aqui, enquanto a DRE econômica, as análises e o fluxo
 * diziam "Out/26".
 */
function rotuloDoMes(m: { ano: number; mes: number }): string {
  return formatarCompetencia(competenciaDe(m.ano, m.mes));
}

type EmpresaNaAba = {
  id: string;
  name: string;
  tradeName: string | null;
  logoUrl: string | null;
  cnpj: string | null;
  parentCompanyId: string | null;
};

// O DRE nasce como entrega do BPO, mas o gate é o setor que opera o módulo
// neste tenant — num cliente ele pode ser do Financeiro (ver `setorDoModulo`).
export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; mes?: string; visao?: string; ano?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, "bpo_dre")) ?? "bpo")) notFound();
  // Módulo desligado no escritório, tela fora — como a DRE econômica e as análises (05/10/2026).
  if (!(await isModuleEnabled(ctx.tenantId, "bpo_dre"))) notFound();

  const { empresa, mes, visao, ano } = await searchParams;
  const prisma = getPrisma();

  const empresas = await prisma.company.findMany({
    // Só cliente ativo: DRE de prospect ou de empresa encerrada não é
    // relatório, é ruído no seletor.
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tradeName: true, logoUrl: true, cnpj: true, parentCompanyId: true },
  });

  const companyId = empresa && empresas.some((e) => e.id === empresa) ? empresa : empresas[0]?.id;
  if (!companyId) {
    return (
      <PageContainer>
        <PageHeader title="DRE" subtitle="Demonstrativo de resultado, por empresa e mês." />
        <EmptyState title="Nenhuma empresa cadastrada" icon={<FileText />} />
      </PageContainer>
    );
  }

  const meses = await mesesComMovimento(ctx.tenantId, companyId);

  // ─── Visão de doze meses ─────────────────────────────────────────────────
  if (visao === "ano") {
    const anoEscolhido = Number(ano) || meses[0]?.ano || new Date().getFullYear();
    const anos = [...new Set(meses.map((m) => m.ano))].sort((a, b) => b - a);
    const {
      meses: porMes,
      categorias: categoriasDoAno,
      naoClassificado: soltosDoAno,
      impostoForaDoResultado: impostoDoAno,
    } = await dreDoAnoDaEmpresa(ctx.tenantId, companyId, anoEscolhido);
    const anual = dreDoAno(porMes);

    const porNomeAno = new Map(categoriasDoAno.map((c) => [c.nome, c]));
    const itensDoAno: ItemParaClassificar[] = soltosDoAno.map((n) => ({
      categoria: n.categoria,
      centavos: n.centavos,
      origem: n.origem,
      categoryId: porNomeAno.get(n.categoria)?.id ?? null,
    }));
    const excecoesDoAno = categoriasDoAno
      .filter((c) => c.origem === "excecao")
      .map((c) => ({ categoryId: c.id, nome: c.nome, grupo: c.grupo! }));

    return (
      <PageContainer>
        <PageHeader
          title="DRE"
          subtitle="Demonstrativo de resultado de caixa — os doze meses lado a lado."
        />
        <SeletorDeEmpresa empresas={empresas} companyId={companyId} />
        <div className="mt-4">
          <AbasDaVisao companyId={companyId} ativa="ano" ano={anoEscolhido} />
        </div>
        <FiltrosDaTela
          className="mb-4"
          campos={[{ chave: "ano", rotulo: "Ano", vazioLabel: `Mais recente (${anos[0] ?? anoEscolhido})`, sempreVisivel: true, opcoes: anos.map((a) => ({ value: String(a), label: String(a) })) }]}
        />
        {/* Os dois avisos que só a visão mensal tinha. Uma categoria que
            some R$ 200 por mês some R$ 2.400 no ano — e doze avisos pequenos
            passam onde um grande não passaria. */}
        {impostoDoAno !== 0 && (
          // O `Aviso` do app (08/10/2026), com o texto em `fg`: o parágrafo é
          // longo, e o âmbar como cor de texto fica abaixo do contraste AA.
          <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
            <span className="text-fg">
              <strong>{moeda(Math.abs(impostoDoAno))}</strong> de impostos sobre a receita saíram
              do caixa em {anoEscolhido} e <strong>não entram</strong> no resultado abaixo — a
              margem de contribuição parte da Receita Bruta, como na planilha do BPO.
              <span className="block text-fs-2 text-fg-secondary mt-1">
                Reproduzido de propósito. Confirmar com o BPO se é assim mesmo.
              </span>
            </span>
          </Aviso>
        )}

        <div className="mb-4">
          <FilaDeClassificacao
            companyId={companyId}
            itens={itensDoAno}
            excecoes={excecoesDoAno}
          />
        </div>

        <RelatorioAnual anual={anual} />
        <NotaDeFonte>
          {/* A média divide pelos meses com movimento, como o AVERAGE do Excel:
              dividir por doze em setembro diz que a empresa faturou 25% menos. */}
          A coluna <strong>Média</strong> divide por {anual.mesesComMovimento}{" "}
          {anual.mesesComMovimento === 1 ? "mês com movimento" : "meses com movimento"}, não por doze.
          Os percentuais do ano saem dos valores somados, não da média dos percentuais mensais.
        </NotaDeFonte>
      </PageContainer>
    );
  }

  const escolhido = (mes && meses.find((m) => `${m.ano}-${m.mes}` === mes)) ?? meses[0] ?? null;

  if (!escolhido) {
    return (
      <PageContainer>
        <PageHeader title="DRE" subtitle="Demonstrativo de resultado, por empresa e mês." />
        <SeletorDeEmpresa empresas={empresas} companyId={companyId} />
        {/* Em cartão, como o vazio das listas (08/10/2026): solto, flutuava no fundo. */}
        <Card className="mt-4">
          <EmptyState
            title="Nenhum pagamento ou recebimento nesta empresa"
            description="O DRE é de caixa: ele monta a partir do que foi efetivamente pago e recebido, não do que foi lançado."
            icon={<FileText />}
          />
        </Card>
        {/* É aqui que quem ainda monta o DRE fora do Connect começa. */}
        <div className="mt-4">
          <ImportarDoOmie companyId={companyId} />
        </div>
      </PageContainer>
    );
  }

  // O mês anterior só entra na comparação quando teve movimento (pago,
  // recebido ou importado): sem ele, "subiu 100%" sobre zero diria nada.
  const anteriorAoEscolhido = escolhido.mes === 1 ? { ano: escolhido.ano - 1, mes: 12 } : { ano: escolhido.ano, mes: escolhido.mes - 1 };
  const temAnterior = meses.some((m) => m.ano === anteriorAoEscolhido.ano && m.mes === anteriorAoEscolhido.mes);
  const [{ resultado, categorias, lancamentos, fonte }, anterior] = await Promise.all([
    dreDoMes(ctx.tenantId, companyId, escolhido),
    temAnterior ? dreDoMes(ctx.tenantId, companyId, anteriorAoEscolhido) : Promise.resolve(null),
  ]);

  const porNome = new Map(categorias.map((c) => [c.nome, c]));
  const itens: ItemParaClassificar[] = resultado.naoClassificado.map((n) => ({
    categoria: n.categoria,
    centavos: n.centavos,
    origem: n.origem,
    categoryId: porNome.get(n.categoria)?.id ?? null,
  }));

  const excecoes = categorias
    .filter((c) => c.origem === "excecao")
    .map((c) => ({ categoryId: c.id, nome: c.nome, grupo: c.grupo! }));

  const impostoDeFora = impostoForaDoResultado(resultado, OPCOES_PADRAO);
  const transferencias = resultado.porGrupo[TRANSFERENCIA] ?? 0;

  return (
    <PageContainer>
      {/* O mês escrito na tela (07/10, auditoria dos gráficos): ficava só
          dentro do botão Filtros ("Mais recente (…)"), e a tabela inteira
          aparecia sem dizer de quando. */}
      <PageHeader
        title="DRE"
        subtitle={`Demonstrativo de resultado de caixa de ${rotuloDoMes(escolhido)} — monta do que foi pago e recebido no mês.`}
      />

      <SeletorDeEmpresa empresas={empresas} companyId={companyId} />

      <div className="mt-4">
        <AbasDaVisao companyId={companyId} ativa="mes" ano={escolhido.ano} />
      </div>
      {/* O mês numa lista com busca, e não 18 pílulas numa fileira — a regra
          da conferência de 30/09 para competência. */}
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "mes",
            rotulo: "Mês",
            vazioLabel: meses[0] ? `Mais recente (${rotuloDoMes(meses[0])})` : "Mais recente",
            sempreVisivel: true,
            opcoes: meses.map((m) => ({ value: `${m.ano}-${m.mes}`, label: rotuloDoMes(m) })),
          },
        ]}
      />

      {/* Os números do topo, como na DRE econômica (08/10/2026, escolha 9A do
          Kauan: na DRE, o padrão entra nos números do topo e a tabela fica
          como está). A tela de caixa abria direto nas 30 linhas da tabela. */}
      <NumerosDaDre
        resultado={resultado}
        regime="caixa"
        anterior={anterior ? { resultado: anterior.resultado, rotulo: rotuloDoMes(anteriorAoEscolhido) } : null}
        className="mb-4"
      />

      {/* Existe porque a regra é um chute até o BPO confirmar — e um chute que
          muda o resultado precisa aparecer na tela, não só no código. */}
      {impostoDeFora !== 0 && (
        // O `Aviso` do app (08/10/2026), com o texto em `fg`: o parágrafo é
        // longo, e o âmbar como cor de texto fica abaixo do contraste AA.
        <Aviso tom="atencao" icone={<AlertTriangle />} className="mb-4">
          <span className="text-fg">
            <strong>{moeda(Math.abs(impostoDeFora))}</strong> de impostos sobre a receita saíram do
            caixa e <strong>não entram</strong> no resultado abaixo — a margem de contribuição parte
            da Receita Bruta, como na planilha que o BPO usa hoje.
            <span className="block text-fs-2 text-fg-secondary mt-1">
              Reproduzido de propósito, para o número bater com o que o cliente já recebe.
              Confirmar com o BPO se é assim mesmo.
            </span>
          </span>
        </Aviso>
      )}

      {/* De onde saiu o número. Relatório que muda de fonte sem avisar é
          relatório em que ninguém confia duas vezes. */}
      <p className="text-micro text-fg-muted mb-3">
        {fonte.tipo === "import"
          ? `Montado do arquivo importado do Omie${fonte.arquivos.length > 0 ? ` (${[...new Set(fonte.arquivos)].join(", ")})` : ""}.`
          : "Montado dos lançamentos pagos e recebidos no Connect."}
      </p>

      <FilaDeClassificacao companyId={companyId} itens={itens} excecoes={excecoes} />

      <div className="mt-4">
        <RelatorioDoDre resultado={resultado} />
      </div>

      <div className="mt-4">
        <ImportarDoOmie companyId={companyId} />
      </div>

      <NotaDeFonte>
        {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} pagos ou recebidos em{" "}
        {rotuloDoMes(escolhido)}
        {transferencias !== 0 &&
          ` · ${moeda(transferencias)} em transferências entre contas, fora do DRE`}
        {/* Diferente de zero significa que algo entrou e não foi somado em lugar
            nenhum. É a conferência que a planilha faz à mão, nas abas Check. */}
        {resultado.diferencaDeFechamento !== 0 && (
          <span className="text-danger">
            {" "}· atenção: {moeda(resultado.diferencaDeFechamento)} não fecharam
          </span>
        )}
      </NotaDeFonte>
    </PageContainer>
  );
}

/** "Por mês" e "Ano inteiro" trocam a tela — são abas, não filtro. */
function AbasDaVisao({ companyId, ativa, ano }: { companyId: string; ativa: "mes" | "ano"; ano: number }) {
  return (
    <AbasDeLink
      ativa={ativa}
      abas={[
        { chave: "mes", rotulo: "Por mês", href: `/dre?empresa=${companyId}`, icone: <CalendarDays /> },
        { chave: "ano", rotulo: "Ano inteiro", href: `/dre?empresa=${companyId}&visao=ano&ano=${ano}`, icone: <CalendarRange /> },
      ]}
    />
  );
}

function SeletorDeEmpresa({
  empresas,
  companyId,
}: {
  empresas: EmpresaNaAba[];
  companyId: string;
}) {
  return (
    <SeletorDeEmpresaQueNavega
      empresas={empresas.map((e) => ({ ...e, nome: e.tradeName || e.name }))}
      empresaId={companyId}
      acao="/dre"
    />
  );
}
