import { notFound } from "next/navigation";
import { ArrowLeftRight, BadgeCheck, FilePen, Target } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { NovaVersao } from "@/components/dre/orcamento/NovaVersao";
import { GradeDoOrcamento } from "@/components/dre/orcamento/GradeDoOrcamento";
import { AcoesDaVersao } from "@/components/dre/orcamento/AcoesDaVersao";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/dre/data";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { GRUPOS } from "@/lib/dre/estrutura";
import { gradeDeLinhas, textoDaCelula } from "@/lib/dre/orcamento/grade";
import { lerAno, versaoAprovada, versaoPadrao } from "@/lib/dre/orcamento/versoes";
import { MODULO_DE_ORCAMENTO } from "@/lib/dre/orcamento/dados";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_ORCAMENTO;
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/**
 * Orçamento anual por grupo da DRE, por empresa.
 *
 * Uma empresa e um ano por vez, com as versões lado a lado. A versão aprovada é
 * a que a DRE econômica e as análises comparam com o realizado — e há só uma
 * por ano. Editar e criar é de quem atua no setor; aprovar e reabrir, da
 * coordenação.
 */
export default async function OrcamentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canViewSector(ctx, setor)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const hoje = saoPauloParts(new Date()).dateKey;
  const ano = lerAno(params.ano) ?? Number(hoje.slice(0, 4));
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;
  const podeEditar = canActOnSector(ctx, setor);
  const coordena = canManageSector(ctx, setor);

  const cabecalho = (
    <PageHeader title="Orçamento" subtitle="Orçado por grupo da DRE, mês a mês — a versão aprovada é comparada com o realizado na DRE econômica." />
  );
  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<Target />} />
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const todas = await prisma.budget.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    select: {
      id: true,
      name: true,
      year: true,
      status: true,
      approvedAt: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: [{ year: "desc" }, { name: "asc" }],
  });
  const doAno = todas.filter((v) => v.year === ano);
  const selecionada = doAno.find((v) => v.id === params.versao) ?? versaoPadrao(doAno);
  const aprovada = versaoAprovada(doAno);
  const linhas = selecionada
    ? await prisma.budgetLine.findMany({ where: { budgetId: selecionada.id }, select: { groupCode: true, month: true, amount: true } })
    : [];
  const grade = gradeDeLinhas(linhas.map((l) => ({ groupCode: l.groupCode, month: l.month, centavos: centavosDeDecimal(l.amount) })));
  const textos = Object.fromEntries(GRUPOS.map((g) => [g.code, (grade[g.code] ?? []).map(textoDaCelula)]));

  const href = (id: string) => `/dre/orcamento?empresa=${companyId}&ano=${ano}&versao=${id}`;
  // O comparativo abre no mês mais recente do ano que já passou (ou dezembro).
  const mesDoComparativo = ano < Number(hoje.slice(0, 4)) ? 12 : Math.max(1, Number(hoje.slice(5, 7)));

  return (
    <PageContainer>
      {cabecalho}
      <FiltroDePeriodo acao="/dre/orcamento" empresas={empresas} empresaId={companyId}>
        <Input compact type="number" name="ano" defaultValue={ano} min={2000} max={2100} className="w-24" aria-label="Ano" />
      </FiltroDePeriodo>

      {/* As versões do ano são abas, e não pílulas (conferência de 30/09):
          escolher uma troca a grade inteira, o cabeçalho e as ações — é outra
          tela, não um recorte da mesma. A aprovada leva o selo no ícone e no
          nome, que a aba não tem lugar para o `Badge`. */}
      {doAno.length > 0 && (
        <AbasDeLink
          abas={doAno.map((v) => ({
            chave: v.id,
            rotulo: v.status === "APROVADO" ? `${v.name} · aprovada` : v.name,
            href: href(v.id),
            icone: v.status === "APROVADO" ? <BadgeCheck className="text-success-fg" /> : <FilePen />,
          }))}
          ativa={selecionada?.id ?? ""}
        />
      )}
      {podeEditar && (
        <div className="mb-4">
          <NovaVersao
            companyId={companyId}
            ano={ano}
            jaTemVersao={doAno.length > 0}
            versoes={todas.map((v) => ({ id: v.id, nome: v.name, ano: v.year, aprovada: v.status === "APROVADO" }))}
          />
        </div>
      )}

      {!selecionada ? (
        // Em cartão, como o vazio das listas (08/10/2026): solto, flutuava no fundo.
        <Card>
          <EmptyState
            title={`Nenhuma versão de orçamento em ${ano}`}
            description="Crie uma versão vazia, copie outra versão com reajuste, ou parta do realizado de um ano anterior."
            icon={<Target />}
          />
        </Card>
      ) : (
        <>
          <Card className="p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-ui">
              <p className="font-semibold text-fg flex items-center gap-2">
                {selecionada.name} · {ano}
                {selecionada.status === "APROVADO" ? <Badge variant="success">Aprovada</Badge> : <Badge variant="info">Rascunho</Badge>}
              </p>
              <p className="text-fs-2 text-fg-muted mt-0.5">
                Criada por {selecionada.createdBy.name}
                {selecionada.status === "APROVADO" && selecionada.approvedAt && (
                  <>
                    {" "}· aprovada por {selecionada.approvedBy?.name ?? "—"} em {formatInstantDate(selecionada.approvedAt)}
                  </>
                )}
                {" "}· atualizada em {formatInstantDate(selecionada.updatedAt)}
              </p>
              {selecionada.status === "RASCUNHO" && (
                <p className="text-fs-2 text-fg-muted mt-0.5">
                  {aprovada ? `A aprovada de ${ano} é "${aprovada.name}".` : `${ano} ainda não tem versão aprovada — a DRE não mostra orçado.`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Era link de texto; é ação, então é botão (30/09). */}
              {aprovada && (
                <Button href={`/dre/economica?empresa=${companyId}&mes=${competenciaDe(ano, mesDoComparativo)}`} variant="secondary" size="sm">
                  <ArrowLeftRight size={14} /> Ver orçado × realizado
                </Button>
              )}
              {coordena && (
                <AcoesDaVersao
                  budgetId={selecionada.id}
                  nome={selecionada.name}
                  ano={ano}
                  status={selecionada.status}
                  outraAprovada={aprovada && aprovada.id !== selecionada.id ? aprovada.name : null}
                />
              )}
            </div>
          </Card>

          <GradeDoOrcamento
            key={selecionada.id}
            budgetId={selecionada.id}
            lidoEm={selecionada.updatedAt.toISOString()}
            grade={textos}
            somenteLeitura={selecionada.status === "APROVADO" || !podeEditar}
          />
          <NotaDeFonte>
            Valores positivos: o sinal vem do grupo — receita soma, despesa subtrai, como na DRE. Os subtotais usam a mesma
            estrutura da DRE econômica (a margem parte da receita bruta). Versão aprovada é somente leitura; para mudar,
            a coordenação reabre. Orçamento é da empresa inteira — não há orçado por centro de custo nem por categoria.
          </NotaDeFonte>
        </>
      )}
    </PageContainer>
  );
}
