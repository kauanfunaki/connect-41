import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { listarConversas } from "@/lib/whatsapp/data";
import { setorDoModulo } from "@/lib/modules";

const MODULE = "recrutamento_whatsapp";

export default async function ConversasDeWhatsappPage() {
  const ctx = await getAuthContext();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento")) notFound();

  const agora = new Date();
  const conversas = await listarConversas(ctx.tenantId, agora);

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="WhatsApp do Recrutamento"
        subtitle="As conversas com candidatos. O assistente responde o que sabe; o que sai do combinado aparece aqui, esperando alguém."
      />
      <ConversasLista conversas={conversas} agora={agora} />
    </PageContainer>
  );
}
