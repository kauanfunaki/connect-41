import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/shared/PageContainer";
import { CaixaDoAtendimento } from "@/components/atendimento/CaixaDoAtendimento";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { listar } from "@/lib/atendimento/consultas";
import { podeConfigurar } from "@/lib/atendimento/acesso";

export const dynamic = "force-dynamic";

/**
 * O Atendimento (10/11/2026): o WhatsApp do escritório, no menu Geral. A lista
 * mora no layout e não remonta ao abrir outra conversa; a página é só o painel
 * da direita. A tela ocupa a altura da janela e não rola: rolam a lista e as
 * mensagens.
 */
export default async function AtendimentoLayout({ children }: { children: ReactNode }) {
  const c = await contextoDaTela();
  if (!c) notFound();
  const dados = await listar(c);
  return (
    <PageContainer className="relative h-full flex flex-col overflow-hidden">
      <CaixaDoAtendimento
        dados={dados}
        cabecalho={
          <PageHeader
            title="Atendimento"
            subtitle={
              dados.ehTriagem
                ? `O WhatsApp do escritório. Toda conversa nova chega na triagem da ${dados.triagem.label}.`
                : "O WhatsApp do escritório: as conversas do seu setor e as que estão com você."
            }
            action={
              podeConfigurar(c.ctx, c.cfg) ? (
                <Button href="/atendimento/configuracoes" variant="secondary" size="sm">
                  <Settings size={14} /> Configurar
                </Button>
              ) : undefined
            }
          />
        }
      >
        {children}
      </CaixaDoAtendimento>
    </PageContainer>
  );
}
