import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { ConfiguracaoDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeEscolherSetores, podeGerenciar } from "@/lib/chamados/acesso";
import { getActiveSectors } from "@/lib/sectors";
import { getPrisma } from "@/lib/prisma";
import { Button } from "@/components/ui/Button";
import { History } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * A configuração dos chamados (lote 6, 28/10/2026). Desde 05/11/2026 ficam só
 * os prazos: a IA alternativa saiu (a triagem é sempre a da Ceci) e os setores
 * que abrem chamado também (todos abrem).
 */
export default async function ConfiguracaoPage() {
  const c = await contexto().catch(() => null); if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const [politicas, ativos] = await Promise.all([getPrisma().helpdeskSlaPolicy.findMany({ where: { tenantId: c.ctx.tenantId } }), getActiveSectors(c.ctx.tenantId)]);
  const setores = { todos: ativos.map(s => ({ code: s.code, label: s.label })), administram: c.config.sectorCodes, padrao: c.config.sectorCode, editavel: podeEscolherSetores(c.ctx, c.config) };
  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Chamados", href: "/chamados" }, { label: "Configurações" }]} />
      <PageHeader
        title="Configurar chamados"
        // O histórico de chamados do Hub, para a triagem aprender (17/11/2026).
        action={<Button href="/chamados/configuracoes/historico" variant="secondary"><History size={14} aria-hidden /> Histórico do Hub</Button>}
      />
      <ConfiguracaoDosChamados politicas={politicas} setores={setores} />
    </PageContainer>
  );
}
