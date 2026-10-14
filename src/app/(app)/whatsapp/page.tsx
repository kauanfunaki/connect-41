import { PainelSemConversa } from "@/components/whatsapp/CaixaDoWhatsapp";

export const dynamic = "force-dynamic";

/**
 * O painel à espera de uma conversa escolhida (09/10/2026: caixa de
 * conversas). A lista é do layout de /whatsapp (14/10/2026); o número de quem
 * espera alguém vem de lá.
 */
export default function ConversasDeWhatsappPage() {
  return <PainelSemConversa />;
}
