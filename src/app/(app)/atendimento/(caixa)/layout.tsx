import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ChartColumn, Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/shared/PageContainer";
import { CaixaDoAtendimento } from "@/components/atendimento/CaixaDoAtendimento";
import { BotaoNovaConversa } from "@/components/atendimento/NovaConversa";
import { contextoDaTela } from "@/lib/atendimento/contexto";
import { listar } from "@/lib/atendimento/consultas";
import { ehDaTriagem, podeConfigurar, veTudo } from "@/lib/atendimento/acesso";

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
            action={
              // "+ Nova conversa" no topo, para todos (17/11/2026, melhoria-728); antes era um ícone ao lado da busca.
              <div className="flex flex-wrap gap-2">
                {(ehDaTriagem(c.ctx, c.cfg) || veTudo(c.ctx, c.cfg)) && (
                  <Button href="/atendimento/metricas" variant="secondary" size="sm">
                    <ChartColumn size={14} /> Métricas
                  </Button>
                )}
                {podeConfigurar(c.ctx, c.cfg) && (
                  <Button href="/atendimento/configuracoes" variant="secondary" size="sm">
                    <Settings size={14} /> Configurar
                  </Button>
                )}
                <BotaoNovaConversa veTudo={dados.ehTriagem || dados.veTudo} />
              </div>
            }
          />
        }
      >
        {children}
      </CaixaDoAtendimento>
    </PageContainer>
  );
}
