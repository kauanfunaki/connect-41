import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { Conversa } from "@/components/whatsapp/Conversa";
import { lerConversa } from "@/lib/whatsapp/data";
import { vizinhas } from "@/lib/conversas/caixa";
import { carregarCaixa, MolduraDaCaixa } from "../caixa";

export const dynamic = "force-dynamic";

/** A conversa aberta no painel, com a lista ao lado (09/10/2026: caixa de conversas). */
export default async function ConversaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const dados = await carregarCaixa((await searchParams).ver);
  const conversa = await lerConversa(dados.ctx.tenantId, id);
  if (!conversa) notFound();

  // Só candidaturas em andamento entram no seletor: ligar a conversa a um
  // processo já encerrado é quase sempre engano, e o seletor com tudo dentro
  // fica longo demais para escolher direito.
  const emAndamento = await getPrisma().candidatura.findMany({
    where: { tenantId: dados.ctx.tenantId, status: "EM_ANDAMENTO" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, person: { select: { name: true } }, vaga: { select: { title: true } } },
  });

  // ↑↓ andam pela lista que está à esquerda (o recorte de agora).
  const { anterior, proxima } = vizinhas(dados.lista, id);
  const href = (outra: { id: string } | null) => (outra ? `/whatsapp/${outra.id}${dados.sufixo}` : null);

  return (
    <MolduraDaCaixa
      dados={dados}
      abertaId={id}
      painel={
        <Conversa
          conversa={conversa}
          agora={dados.agora}
          userId={dados.ctx.userId}
          pessoas={dados.pessoas}
          candidaturas={emAndamento.map((c) => ({ id: c.id, rotulo: `${c.person.name} — ${c.vaga.title}` }))}
          navegacao={{ fechar: `/whatsapp${dados.sufixo}`, anterior: href(anterior), proxima: href(proxima) }}
        />
      }
    />
  );
}
