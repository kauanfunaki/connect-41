import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Conversa } from "@/components/whatsapp/Conversa";
import { lerConversa } from "@/lib/whatsapp/data";

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, "recrutamento")) notFound();

  const agora = new Date();
  const conversa = await lerConversa(ctx.tenantId, id);
  if (!conversa) notFound();

  // Só candidaturas em andamento entram no seletor: ligar a conversa a um
  // processo já encerrado é quase sempre engano, e o seletor com tudo dentro
  // fica longo demais para escolher direito.
  const prisma = getPrisma();
  const emAndamento = await prisma.candidatura.findMany({
    where: { tenantId: ctx.tenantId, status: "EM_ANDAMENTO" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      person: { select: { name: true } },
      vaga: { select: { title: true } },
    },
  });

  return (
    <PageContainer variant="narrow">
      <Link
        href="/whatsapp"
        className="inline-flex items-center gap-1 text-[13px] text-fg-muted hover:text-brand transition-colors mb-4"
      >
        <ArrowLeft size={14} /> Conversas
      </Link>
      <Conversa
        conversa={conversa}
        agora={agora}
        candidaturas={emAndamento.map((c) => ({
          id: c.id,
          rotulo: `${c.person.name} — ${c.vaga.title}`,
        }))}
      />
    </PageContainer>
  );
}
