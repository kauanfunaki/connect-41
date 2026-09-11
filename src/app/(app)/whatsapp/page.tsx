import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { ConversasLista } from "@/components/whatsapp/ConversasLista";
import { listarConversas } from "@/lib/whatsapp/data";

export default async function ConversasDeWhatsappPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, "recrutamento")) notFound();

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
