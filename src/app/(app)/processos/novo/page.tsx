import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { AberturaGuiada, type TipoNaAbertura } from "@/components/societario/AberturaGuiada";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { nomeExibicao } from "@/lib/companyName";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { prazoDoTipo, SITUACOES_QUE_ABREM } from "@/lib/societario/abertura";
import { abrirProcesso } from "../actions";

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

/**
 * Abrir processo em três passos (04/11/2026, escolha A da página de opções):
 * empresa e tipo → o checklist do roteiro, marcando o que já está com o
 * escritório → o pedido do resto ao cliente pelo portal. Era uma janela com
 * empresa e tipo, e os documentos se pediam depois, pela conversa.
 */
export default async function NovoProcessoPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const ctx = await getAuthContext();
  const setores = ctx.tenantId ? ((await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canActOnSector(ctx, setores)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const { empresa } = await searchParams;
  const prisma = getPrisma();

  const [empresas, tipos, responsaveis] = await Promise.all([
    // As mesmas situações que a Ceci confere ao propor (`SITUACOES_QUE_ABREM`).
    prisma.company.findMany({ where: { tenantId: ctx.tenantId, status: { in: [...SITUACOES_QUE_ABREM] } }, orderBy: { name: "asc" }, select: CAMPOS_DA_EMPRESA_NO_SELETOR }),
    prisma.processType.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        expectedDaysMin: true,
        expectedDaysMax: true,
        variableFlow: true,
        // O roteiro publicado mais novo: as etapas e o checklist de cada uma.
        templates: {
          where: { published: true },
          orderBy: { version: "desc" },
          take: 1,
          select: { steps: { orderBy: { position: "asc" }, select: { label: true, items: { orderBy: { position: "asc" }, select: { id: true, label: true, required: true } } } } },
        },
      },
    }),
    getSectorUsers(ctx.tenantId, setores),
  ]);

  const tiposNaTela: TipoNaAbertura[] = tipos.map((t) => {
    const steps = t.templates[0]?.steps ?? [];
    return {
      id: t.id,
      nome: t.name,
      prazo: prazoDoTipo(t),
      etapas: steps.length,
      itens: steps.flatMap((s) => s.items.map((i) => ({ id: i.id, rotulo: i.label, etapa: s.label, obrigatorio: i.required }))),
      temRoteiro: steps.length > 0,
    };
  });

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Novo processo" }]} />
      <PageHeader title="Novo processo" subtitle="Empresa e tipo, o que o processo pede e o pedido do que falta ao cliente — o processo já nasce com tudo isso." />
      <AberturaGuiada
        empresas={opcoesDeEmpresa(empresas.map((e) => ({ ...e, nome: nomeExibicao(e) })))}
        empresaInicial={empresa && empresas.some((e) => e.id === empresa) ? empresa : ""}
        tipos={tiposNaTela}
        responsaveis={responsaveis}
        responsavelPadrao={responsaveis.some((r) => r.id === ctx.userId) ? (ctx.userId ?? "") : ""}
        abrirAction={abrirProcesso}
      />
    </PageContainer>
  );
}
