import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { Conversa } from "@/components/whatsapp/Conversa";
import { lerConversa } from "@/lib/whatsapp/data";
import { acessoAoWhatsapp } from "../caixa";

export const dynamic = "force-dynamic";

/**
 * A conversa aberta no painel (09/10/2026: caixa de conversas). A lista ao
 * lado é do layout de /whatsapp e não roda de novo ao trocar de conversa
 * (14/10/2026): aqui só se carrega a conversa — por isso o acesso é conferido
 * aqui também.
 */
export default async function ConversaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await acessoAoWhatsapp();

  const [conversa, emAndamento] = await Promise.all([
    lerConversa(ctx.tenantId, id),
    // Só candidaturas em andamento entram no seletor: ligar a conversa a um
    // processo já encerrado é quase sempre engano, e o seletor com tudo dentro
    // fica longo demais para escolher direito.
    getPrisma().candidatura.findMany({
      where: { tenantId: ctx.tenantId, status: "EM_ANDAMENTO" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, person: { select: { name: true } }, vaga: { select: { title: true } } },
    }),
  ]);
  if (!conversa) notFound();

  return (
    <Conversa
      key={conversa.id}
      conversa={conversa}
      agora={new Date()}
      candidaturas={emAndamento.map((c) => ({ id: c.id, rotulo: `${c.person.name} — ${c.vaga.title}` }))}
    />
  );
}
