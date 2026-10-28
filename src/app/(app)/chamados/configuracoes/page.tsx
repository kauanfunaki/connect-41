import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfiguracaoDosChamados, SetoresDosChamados } from "@/components/chamados/ConfiguracaoDosChamados";
import { contexto } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { isFullWrite } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { getActiveSectors } from "@/lib/sectors";
import { setorDoModulo } from "@/lib/modules";
import { estadoDoFallback } from "@/lib/chamados/ia-fallback";

export const dynamic = "force-dynamic";

/**
 * A configuração dos chamados numa tela só (lote 6, 28/10/2026). Os setores
 * que podem abrir chamado ficavam à parte, em Administração › Módulos ›
 * Chamados, com o mesmo componente; agora são a última seção daqui, só para o
 * Administrador (como lá), e o endereço antigo redireciona.
 */
export default async function ConfiguracaoPage() {
  const c = await contexto().catch(() => null); if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const administra = isFullWrite(c.ctx.role);
  const [politicas, fallback, setores, selecionados, responsavel] = await Promise.all([
    getPrisma().helpdeskSlaPolicy.findMany({ where: { tenantId: c.ctx.tenantId } }),
    estadoDoFallback(c),
    administra ? getActiveSectors(c.ctx.tenantId) : Promise.resolve([]),
    administra ? getPrisma().helpdeskRequesterSector.findMany({ where: { tenantId: c.ctx.tenantId } }) : Promise.resolve([]),
    administra ? setorDoModulo(c.ctx.tenantId, "helpdesk") : Promise.resolve(null),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Configurar chamados"
        subtitle="Prazos de atendimento, IA alternativa e quem pode abrir chamado. A IA interpreta cada pedido e pergunta o que faltar."
        action={<Button variant="secondary" href="/chamados">Voltar aos chamados</Button>}
      />
      <ConfiguracaoDosChamados politicas={politicas} fallback={fallback} />
      {administra && (
        <section id="setores" className="mt-6 scroll-mt-20">
          <SetoresDosChamados
            setores={setores.map((s) => ({ code: s.code, label: s.label }))}
            selecionados={selecionados.map((s) => s.sectorCode)}
            responsavel={setores.find((s) => s.code === responsavel)?.label ?? responsavel ?? "Não definido"}
          />
        </section>
      )}
    </PageContainer>
  );
}
