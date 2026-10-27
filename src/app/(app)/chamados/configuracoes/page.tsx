import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfiguracaoDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { getPrisma } from "@/lib/prisma";
import { estadoDoFallback } from "@/lib/chamados/ia-fallback";

export const dynamic = "force-dynamic";
export default async function ConfiguracaoPage() {
  const c = await contexto().catch(() => null); if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const [politicas, fallback] = await Promise.all([getPrisma().helpdeskSlaPolicy.findMany({ where: { tenantId: c.ctx.tenantId } }), estadoDoFallback(c)]);
  return <PageContainer><PageHeader title="Configurar chamados" subtitle="Prazos de atendimento e IA alternativa deste escritório. A IA interpreta cada pedido e pergunta o que faltar." action={<Button variant="secondary" href="/chamados">Voltar aos chamados</Button>} /><ConfiguracaoDosChamados politicas={politicas} fallback={fallback} /></PageContainer>;
}
