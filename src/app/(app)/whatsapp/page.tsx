import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { EstadoDasConexoes } from "@/components/whatsapp/EstadoDasConexoes";
import { listarConversas, saudeDasConexoes } from "@/lib/whatsapp/data";
import { setorDoModulo } from "@/lib/modules";

const MODULE = "recrutamento_whatsapp";

export const dynamic = "force-dynamic";

export default async function ConversasDeWhatsappPage() {
  const ctx = await getAuthContext();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento")) notFound();

  const agora = new Date();
  // Juntas: a consulta ao provedor tem timeout próprio, e a lista não espera por ela.
  const [conversas, conexoes] = await Promise.all([
    listarConversas(ctx.tenantId, agora),
    saudeDasConexoes(ctx.tenantId, agora),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="WhatsApp do Recrutamento"
        subtitle="As conversas com candidatos. O assistente responde o que sabe; o que sai do combinado aparece aqui, esperando alguém."
      />
      <EstadoDasConexoes conexoes={conexoes} podeConfigurar={isFullWrite(ctx.role)} />
      <ConversasLista conversas={conversas} agora={agora} />
    </PageContainer>
  );
}
