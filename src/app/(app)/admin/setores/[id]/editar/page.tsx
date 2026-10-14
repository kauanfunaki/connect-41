import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { SetorForm } from "@/components/admin/SetorForm";
import { TelasDoMenuGeral, type TelaDaConfiguracao } from "@/components/admin/TelasDoMenuGeral";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { atualizarSetor } from "../../actions";
import { alternarTelaDoGeral, restaurarMenuGeral } from "../../menu-geral-actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { TELAS_DO_GERAL, podeConfigurarMenuGeral } from "@/lib/menuGeral";
import { lerOcultasDoGeral } from "@/lib/menuGeralDb";
import { getEnabledModuleCodes } from "@/lib/modules";

export default async function EditarSetorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const sector = await prisma.sector.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!sector) notFound();

  // O menu Geral do setor (14/10/2026): o que está escondido e, nas telas que
  // dependem de módulo, se o módulo está ligado no escritório.
  const [ocultasDoGeral, ligados] = await Promise.all([lerOcultasDoGeral(ctx.tenantId), getEnabledModuleCodes(ctx.tenantId)]);
  const ocultas = new Set(ocultasDoGeral.porSetor[sector.code] ?? []);
  const telasDoGeral: TelaDaConfiguracao[] = TELAS_DO_GERAL.map((t) => ({
    chave: t.chave,
    rotulo: t.rotulo,
    descricao: t.descricao,
    visivel: !ocultas.has(t.chave),
    observacao:
      t.modulo && !ligados.has(t.modulo)
        ? "O módulo está desligado neste escritório (Configurações › Módulos): a tela não aparece para ninguém."
        : t.soDentroDoSetor
          ? "Aparece quando o setor está escolhido no alto da tela."
          : null,
  }));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Setores", href: "/admin/setores" }, { label: "Editar" }]} />
      <PageHeader title="Editar setor" />

      <div className="max-w-[720px] space-y-4">
        <Card className="p-6">
          <SetorForm
            action={atualizarSetor}
            cancelHref="/admin/setores"
            defaultValues={{
              id: sector.id,
              code: sector.code,
              label: sector.label,
              color: sector.color,
              active: sector.active,
              order: sector.order,
            }}
          />
        </Card>

        <Card className="p-6">
          <TelasDoMenuGeral
            setor={sector.label}
            telas={telasDoGeral}
            personalizado={ocultas.size > 0}
            disponivel={ocultasDoGeral.disponivel}
            podeEditar={podeConfigurarMenuGeral(ctx)}
            alternar={alternarTelaDoGeral.bind(null, sector.id)}
            restaurar={restaurarMenuGeral.bind(null, sector.id)}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
