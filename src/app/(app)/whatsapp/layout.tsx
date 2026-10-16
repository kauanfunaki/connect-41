import type { ReactNode } from "react";
import { isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EstadoDasConexoes } from "@/components/whatsapp/EstadoDasConexoes";
import { CaixaDoWhatsapp } from "@/components/whatsapp/CaixaDoWhatsapp";
import { carregarLista } from "./caixa";

/**
 * A moldura do WhatsApp do Recrutamento: título, estado dos números e a lista
 * de conversas à esquerda — tudo o que não muda ao abrir outra conversa
 * (14/10/2026). A página (`children`) é só o painel da direita: a lista não
 * remonta, não perde a rolagem nem a busca, e a tela não pisca.
 *
 * A tela ocupa a altura da janela e não rola; rolam os cartões da lista e as
 * mensagens da conversa (`h-full flex flex-col`, com a caixa no resto).
 */
export default async function WhatsappLayout({ children }: { children: ReactNode }) {
  const { ctx, agora, conversas, conexoes, pessoas } = await carregarLista();
  return (
    <PageContainer className="relative h-full flex flex-col overflow-hidden">
      <CaixaDoWhatsapp
        dados={{ conversas, agora, userId: ctx.userId, pessoas }}
        cabecalho={
          <PageHeader
            title="WhatsApp do Recrutamento"
            subtitle="O assistente responde o que sabe; o que sai do combinado aparece aqui, esperando alguém."
            action={<EstadoDasConexoes conexoes={conexoes} podeConfigurar={isFullWrite(ctx.role)} />}
          />
        }
      >
        {children}
      </CaixaDoWhatsapp>
    </PageContainer>
  );
}
