import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { DetalheDoChamado } from "@/components/chamados/DetalheDoChamado";
import { contexto } from "@/lib/chamados/contexto";
import { detalhe, categorias, usuarios, strings } from "@/lib/chamados/consultas";
import { podeGerenciar, podeOperar, podeResponder, podeVerInterno } from "@/lib/chamados/acesso";
import { isFullWrite } from "@/lib/auth/papeis";
import { getActiveSectors } from "@/lib/sectors";
import { categoriaSchema } from "@/lib/chamados/regras";

export const dynamic = "force-dynamic";
export default async function DetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const c = await contexto().catch(() => null); if (!c) notFound();
  const { id } = await params, t = await detalhe(c, id).catch(() => null); if (!t) notFound();
  const [cats, users, setores] = await Promise.all([categorias(c, true), usuarios(c), getActiveSectors(c.ctx.tenantId)]);
  const alvo = { ...t, approverIds: strings(t.approverIds) };
  return <PageContainer><PageHeader title={t.title} subtitle="Acompanhe o atendimento e consulte as informações da solicitação." action={<Button href="/chamados" variant="secondary">Voltar aos chamados</Button>} /><DetalheDoChamado key={t.version} chamado={t} usuarios={users.map(u => ({ id: u.id, name: u.name, atendente: u.role !== "READONLY" && u.sectors.some(s => s.sectorCode === c.config.sectorCode) }))} categorias={cats.map(cat => ({ ...categoriaSchema.parse(cat), id: cat.id }))} setores={setores.map(s => ({ code: s.code, label: s.label }))} permissoes={{ operar: podeOperar(c.ctx, c.config), gerenciar: podeGerenciar(c.ctx, c.config), interno: podeVerInterno(c.ctx, c.config), responder: podeResponder(c.ctx, c.config, alvo, t.status, false), aprovar: t.createdById !== c.ctx.userId && !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY" && (isFullWrite(c.ctx.role) || alvo.approverIds.includes(c.ctx.userId)), escrever: !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY" }} /></PageContainer>;
}
