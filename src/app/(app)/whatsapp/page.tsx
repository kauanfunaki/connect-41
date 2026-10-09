import { MessagesSquare } from "lucide-react";
import { PainelVazio } from "@/components/conversas/caixa/Caixa";
import { situacaoDaConversa } from "@/lib/whatsapp/conversas";
import { carregarCaixa, MolduraDaCaixa } from "./caixa";

export const dynamic = "force-dynamic";

/** A lista das conversas, com o painel à espera de uma escolhida (09/10/2026: caixa de conversas). */
export default async function ConversasDeWhatsappPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const dados = await carregarCaixa((await searchParams).ver);
  const precisam = dados.conversas.filter((c) => situacaoDaConversa(c, dados.agora) === "precisa_atencao").length;
  return (
    <MolduraDaCaixa
      dados={dados}
      abertaId={null}
      painel={
        <PainelVazio
          icone={<MessagesSquare />}
          titulo="Escolha uma conversa"
          texto={
            precisam > 0
              ? `${precisam === 1 ? "1 conversa precisa" : `${precisam} conversas precisam`} de alguém. Use ↑↓ no painel para passar de uma para outra.`
              : "Ninguém esperando agora. Abra uma conversa à esquerda para ver as mensagens e responder."
          }
        />
      }
    />
  );
}
