import { notFound } from "next/navigation";
import { BackButton } from "@/components/shared/BackButton";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Conversa } from "@/components/whatsapp/Conversa";
import { lerConversa } from "@/lib/whatsapp/data";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";
import { pessoasDoAtendimento } from "@/lib/whatsapp/equipe";

const MODULE = "recrutamento_whatsapp";

export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? "recrutamento") : "recrutamento";
  if (!ctx.tenantId || !canActOnSector(ctx, setor)) notFound();

  const agora = new Date();
  const conversa = await lerConversa(ctx.tenantId, id);
  if (!conversa) notFound();

  // Só candidaturas em andamento entram no seletor: ligar a conversa a um
  // processo já encerrado é quase sempre engano, e o seletor com tudo dentro
  // fica longo demais para escolher direito.
  const prisma = getPrisma();
  const pessoas = await pessoasDoAtendimento(ctx.tenantId, setor);
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
    <PageContainer>
      <BackButton href="/whatsapp" rotulo="Conversas" className="mb-3" />
      <Conversa
        conversa={conversa}
        agora={agora}
        userId={ctx.userId}
        pessoas={pessoas}
        candidaturas={emAndamento.map((c) => ({
          id: c.id,
          rotulo: `${c.person.name} — ${c.vaga.title}`,
        }))}
      />
    </PageContainer>
  );
}
