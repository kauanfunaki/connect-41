import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfiguracaoDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { categorias, usuarios } from "@/lib/chamados/consultas";
import { categoriaSchema } from "@/lib/chamados/regras";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function ConfiguracaoPage() {
  const c = await contexto().catch(() => null); if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const [cats, users, politicas] = await Promise.all([categorias(c, true), usuarios(c), getPrisma().helpdeskSlaPolicy.findMany({ where: { tenantId: c.ctx.tenantId } })]);
  return <PageContainer><PageHeader title="Configurar chamados" subtitle="Categorias, formulários, evidências, aprovações e prazos de atendimento deste escritório." action={<Button variant="secondary" href="/chamados">Voltar aos chamados</Button>} /><ConfiguracaoDosChamados categorias={cats.map(c => ({ ...categoriaSchema.parse(c), id: c.id }))} usuarios={users.filter(u => u.role !== "READONLY").map(u => ({ id: u.id, name: u.name }))} politicas={politicas} /></PageContainer>;
}
