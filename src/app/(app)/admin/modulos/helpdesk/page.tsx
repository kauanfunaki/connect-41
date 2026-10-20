import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { SetoresDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { getActiveSectors } from "@/lib/sectors";
import { setorDoModulo } from "@/lib/modules";

export const dynamic = "force-dynamic";
export default async function AcessosHelpdeskPage() {
  const ctx = await getAuthContext(); if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  const [setores, selecionados, responsavel] = await Promise.all([getActiveSectors(ctx.tenantId), getPrisma().helpdeskRequesterSector.findMany({ where: { tenantId: ctx.tenantId } }), setorDoModulo(ctx.tenantId, "helpdesk")]);
  return <PageContainer><PageHeader title="Setores solicitantes dos chamados" subtitle="Defina quem pode solicitar atendimento. Essa configuração não libera a fila de outros usuários." action={<Button variant="secondary" href="/admin/modulos">Voltar aos módulos</Button>} /><SetoresDosChamados setores={setores.map(s => ({ code: s.code, label: s.label }))} selecionados={selecionados.map(s => s.sectorCode)} responsavel={setores.find(s => s.code === responsavel)?.label ?? responsavel ?? "Não definido"} /></PageContainer>;
}
