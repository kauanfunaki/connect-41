import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RelatorioDoDre, moeda } from "@/components/dre/RelatorioDoDre";
import { FilaDeClassificacao, type ItemParaClassificar } from "@/components/dre/FilaDeClassificacao";
import { dreDoMes, dreDoAnoDaEmpresa, mesesComMovimento } from "@/lib/dre/data";
import { dreDoAno } from "@/lib/dre/anual";
import { RelatorioAnual } from "@/components/dre/RelatorioAnual";
import { ImportarDoOmie } from "@/components/dre/ImportarDoOmie";
import { impostoForaDoResultado } from "@/lib/dre/calculo";
import { OPCOES_PADRAO, TRANSFERENCIA } from "@/lib/dre/estrutura";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type EmpresaNaAba = { id: string; name: string; tradeName: string | null };

// O DRE é entrega do BPO — não é setor próprio, e por isso vive atrás do
// mesmo gate das contas a pagar e receber.
export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; mes?: string; visao?: string; ano?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, "bpo")) notFound();

  const { empresa, mes, visao, ano } = await searchParams;
  const prisma = getPrisma();

  const empresas = await prisma.company.findMany({
    // Só cliente ativo: DRE de prospect ou de empresa encerrada não é
    // relatório, é ruído no seletor.
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tradeName: true },
  });

  const companyId = empresa && empresas.some((e) => e.id === empresa) ? empresa : empresas[0]?.id;
  if (!companyId) {
    return (
      <PageContainer variant="narrow">
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
    const { meses: porMes } = await dreDoAnoDaEmpresa(ctx.tenantId, companyId, anoEscolhido);
    const anual = dreDoAno(porMes);

    return (
      <PageContainer>
        <PageHeader
          title="DRE"
          subtitle="Demonstrativo de resultado de caixa — os doze meses lado a lado."
        />
        <SeletorDeEmpresa empresas={empresas} companyId={companyId} />
        <div className="flex flex-wrap items-center gap-1.5 my-4">
          <Link href={`/dre?empresa=${companyId}`} className={ABA}>
            Por mês
          </Link>
          <Link href={`/dre?empresa=${companyId}&visao=ano&ano=${anoEscolhido}`} className={ABA_ATIVA}>
            Ano inteiro
          </Link>
          <span className="w-px h-6 bg-border mx-1" />
          {anos.map((a) => (
            <Link
              key={a}
              href={`/dre?empresa=${companyId}&visao=ano&ano=${a}`}
              aria-current={a === anoEscolhido ? "page" : undefined}
              className={a === anoEscolhido ? ABA_ATIVA : ABA}
            >
              {a}
            </Link>
          ))}
        </div>
        <RelatorioAnual anual={anual} />
        <p className="text-[11px] text-fg-muted mt-3">
          {/* A média divide pelos meses com movimento, como o AVERAGE do Excel:
              dividir por doze em setembro diz que a empresa faturou 25% menos. */}
          A coluna <strong>Média</strong> divide por {anual.mesesComMovimento}{" "}
          {anual.mesesComMovimento === 1 ? "mês com movimento" : "meses com movimento"}, não por doze.
          Os percentuais do ano saem dos valores somados, não da média dos percentuais mensais.
        </p>
      </PageContainer>
    );
  }

  const escolhido = (mes && meses.find((m) => `${m.ano}-${m.mes}` === mes)) ?? meses[0] ?? null;

  if (!escolhido) {
    return (
      <PageContainer variant="narrow">
        <PageHeader title="DRE" subtitle="Demonstrativo de resultado, por empresa e mês." />
        <SeletorDeEmpresa empresas={empresas} companyId={companyId} />
        <div className="mt-4">
          <EmptyState
            title="Nenhum pagamento ou recebimento nesta empresa"
            description="O DRE é de caixa: ele monta a partir do que foi efetivamente pago e recebido, não do que foi lançado."
            icon={<FileText />}
          />
        </div>
        {/* É aqui que quem ainda monta o DRE fora do Connect começa. */}
        <div className="mt-4">
          <ImportarDoOmie companyId={companyId} />
        </div>
      </PageContainer>
    );
  }

  const { resultado, categorias, lancamentos, fonte } = await dreDoMes(ctx.tenantId, companyId, escolhido);

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
    <PageContainer variant="narrow">
      <PageHeader
        title="DRE"
        subtitle="Demonstrativo de resultado de caixa — monta do que foi pago e recebido no mês."
      />

      <SeletorDeEmpresa empresas={empresas} companyId={companyId} />

      <div className="flex flex-wrap items-center gap-1.5 my-4">
        <Link href={`/dre?empresa=${companyId}`} className={ABA_ATIVA}>
          Por mês
        </Link>
        <Link href={`/dre?empresa=${companyId}&visao=ano&ano=${escolhido.ano}`} className={ABA}>
          Ano inteiro
        </Link>
        <span className="w-px h-6 bg-border mx-1" />
        {meses.slice(0, 18).map((m) => {
          const chave = `${m.ano}-${m.mes}`;
          const ativo = m.ano === escolhido.ano && m.mes === escolhido.mes;
          return (
            <Link
              key={chave}
              href={`/dre?empresa=${companyId}&mes=${chave}`}
              aria-current={ativo ? "page" : undefined}
              className={ativo ? ABA_ATIVA : ABA}
            >
              {MESES[m.mes - 1]}/{String(m.ano).slice(2)}
            </Link>
          );
        })}
      </div>

      {/* Existe porque a regra é um chute até o BPO confirmar — e um chute que
          muda o resultado precisa aparecer na tela, não só no código. */}
      {impostoDeFora !== 0 && (
        <Card className="p-4 mb-4 border-warning/40 bg-warning-bg">
          <p className="flex items-start gap-2 text-[13px] text-fg">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" />
            <span>
              <strong>{moeda(Math.abs(impostoDeFora))}</strong> de impostos sobre a receita saíram do
              caixa e <strong>não entram</strong> no resultado abaixo — a margem de contribuição parte
              da Receita Bruta, como na planilha que o BPO usa hoje.
              <span className="block text-[12px] text-fg-secondary mt-1">
                Reproduzido de propósito, para o número bater com o que o cliente já recebe.
                Confirmar com o BPO se é assim mesmo.
              </span>
            </span>
          </p>
        </Card>
      )}

      {/* De onde saiu o número. Relatório que muda de fonte sem avisar é
          relatório em que ninguém confia duas vezes. */}
      <p className="text-[11px] text-fg-muted mb-3">
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

      <p className="text-[11px] text-fg-muted mt-3">
        {lancamentos} {lancamentos === 1 ? "lançamento" : "lançamentos"} pagos ou recebidos em{" "}
        {MESES[escolhido.mes - 1]}/{escolhido.ano}
        {transferencias !== 0 &&
          ` · ${moeda(transferencias)} em transferências entre contas, fora do DRE`}
        {/* Diferente de zero significa que algo entrou e não foi somado em lugar
            nenhum. É a conferência que a planilha faz à mão, nas abas Check. */}
        {resultado.diferencaDeFechamento !== 0 && (
          <span className="text-danger">
            {" "}· atenção: {moeda(resultado.diferencaDeFechamento)} não fecharam
          </span>
        )}
      </p>
    </PageContainer>
  );
}

const ABA =
  "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors";
const ABA_ATIVA =
  "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium";

function SeletorDeEmpresa({
  empresas,
  companyId,
}: {
  empresas: EmpresaNaAba[];
  companyId: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {empresas.slice(0, 12).map((e) => (
        <Link
          key={e.id}
          href={`/dre?empresa=${e.id}`}
          aria-current={e.id === companyId ? "page" : undefined}
          className={e.id === companyId ? ABA_ATIVA : ABA}
        >
          {e.tradeName || e.name}
        </Link>
      ))}
    </div>
  );
}
