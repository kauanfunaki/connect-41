import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { NovoChamado, type RascunhoDaTela } from "@/components/chamados/NovoChamado";
import { contexto } from "@/lib/chamados/contexto";
import { podeAbrir } from "@/lib/chamados/acesso";
import { categorias, rascunho, parecerAtual } from "@/lib/chamados/consultas";
import { categoriaSchema, dadosSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import { getActiveSectors } from "@/lib/sectors";
import { isFullWrite } from "@/lib/auth/papeis";

export const dynamic = "force-dynamic";
export default async function NovoPage({ searchParams }: { searchParams: Promise<{ rascunho?: string }> }) {
  const c = await contexto().catch(() => null); if (!c || !podeAbrir(c.ctx, c.config)) notFound();
  const params = await searchParams;
  const [cats, setores, d] = await Promise.all([categorias(c), getActiveSectors(c.ctx.tenantId), params.rascunho ? rascunho(c, params.rascunho).catch(() => null) : null]);
  if (params.rascunho && !d) notFound(); if (d?.ticket) redirect(`/chamados/${d.ticket.id}`);
  const vazios: DadosDoChamado = { title: "", description: "", categoryId: "", requesterSectorCode: "", priority: "MEDIA", requestData: {}, tags: [] };
  const lidos = dadosSchema.safeParse(d?.payload);
  const inicial: RascunhoDaTela | null = d ? { id: d.id, version: d.version, dados: lidos.success ? lidos.data : vazios, parecer: parecerAtual(d), anexos: d.attachments.map(a => ({ id: a.id, fileName: a.fileName, attachmentKey: a.attachmentKey })), mensagens: d.messages.map(m => ({ id: m.id, role: m.role, body: m.body })) } : null;
  return <PageContainer><PageHeader title="Novo chamado" subtitle="Conte o que precisa. A revisão ajuda a equipe a receber as informações necessárias para começar." />{!cats.length && <p role="status" className="mb-5 text-warning">O gestor responsável precisa cadastrar uma categoria antes da primeira abertura.</p>}<NovoChamado inicial={inicial} categorias={cats.map(cat => ({ ...categoriaSchema.parse(cat), id: cat.id }))} setores={setores.filter(s => isFullWrite(c.ctx.role) || (c.ctx.sectors.includes(s.code) && c.config.requesterSectors.includes(s.code))).map(s => ({ code: s.code, label: s.label }))} /></PageContainer>;
}
