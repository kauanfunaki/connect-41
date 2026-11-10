import { notFound, redirect } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { NovoChamado, type RascunhoDaTela } from "@/components/chamados/NovoChamado";
import { contexto } from "@/lib/chamados/contexto";
import { podeAbrir, setoresQuePodemAbrir } from "@/lib/chamados/acesso";
import { categorias, rascunho } from "@/lib/chamados/consultas";
import { categoriaSchema, dadosRascunhoSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import { getActiveSectors } from "@/lib/sectors";

export const dynamic = "force-dynamic";
export default async function NovoPage({ searchParams }: { searchParams: Promise<{ rascunho?: string }> }) {
  const c = await contexto().catch(() => null); if (!c || !podeAbrir(c.ctx, c.config)) notFound();
  const params = await searchParams;
  const [cats, setores, d] = await Promise.all([categorias(c), getActiveSectors(c.ctx.tenantId), params.rascunho ? rascunho(c, params.rascunho).catch(() => null) : null]);
  if (params.rascunho && !d) notFound(); if (d?.ticket) redirect(`/chamados/${d.ticket.id}`);
  const vazios: DadosDoChamado = { title: "", description: "", categoryId: "", requesterSectorCode: "", priority: "MEDIA", requestData: {}, tags: [] };
  const lidos = dadosRascunhoSchema.safeParse(d?.payload);
  const inicial: RascunhoDaTela | null = d ? { id: d.id, version: d.version, dados: lidos.success ? lidos.data : vazios, anexos: d.attachments.map(a => ({ id: a.id, fileName: a.fileName })) } : null;
  return <PageContainer><PageHeader title="Novo chamado" subtitle="Conte o que precisa. O chamado abre na hora, e a IA faz a triagem em seguida." /><NovoChamado inicial={inicial} categorias={cats.map(cat => ({ ...categoriaSchema.parse(cat), id: cat.id }))} setores={setoresQuePodemAbrir(c.ctx, c.config, setores).map(s => ({ code: s.code, label: s.label }))} /></PageContainer>;
}
