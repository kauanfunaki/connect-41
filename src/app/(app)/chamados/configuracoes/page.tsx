import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfiguracaoDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * A configuração dos chamados (lote 6, 28/10/2026). Desde 05/11/2026 ficam só
 * os prazos: a IA alternativa saiu (a triagem é sempre a da Ceci) e os setores
 * que abrem chamado também (todos abrem).
 */
export default async function ConfiguracaoPage() {
  const c = await contexto().catch(() => null); if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const politicas = await getPrisma().helpdeskSlaPolicy.findMany({ where: { tenantId: c.ctx.tenantId } });
  return (
    <PageContainer>
      <PageHeader
        title="Configurar chamados"
        subtitle="Prazos de atendimento. A IA interpreta cada pedido e pergunta o que faltar."
        action={<Button variant="secondary" href="/chamados">Voltar aos chamados</Button>}
      />
      <ConfiguracaoDosChamados politicas={politicas} />
    </PageContainer>
  );
}
