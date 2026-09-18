import { notFound } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeletorDeEmpresaQueNavega } from "@/components/shared/SeletorDeEmpresaQueNavega";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { conversaDaEmpresa } from "@/lib/financeiro/comunicacao/consultas";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { enviarMensagemCliente } from "./actions";

export const dynamic = "force-dynamic";

// A conversa livre, do lado do cliente — e o caminho dele para mandar arquivo
// sem esperar o escritório abrir uma pendência.
export default async function PortalComunicacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_comunicacao")) notFound();

  // As empresas do alcance do cliente, e não as ativas do tenant: o portal é dele.
  const empresas = await empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []);
  const { empresa: pedida } = await searchParams;
  // Com uma empresa só, não há o que escolher: abre direto a conversa dela.
  const selecionada = empresas.find((e) => e.id === pedida) ?? (empresas.length === 1 ? empresas[0] : null);
  const conversa = selecionada ? await conversaDaEmpresa(escopo, selecionada.id) : null;

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Conversa"
        descricao="Fale com a equipe e mande arquivos, por empresa."
        somenteLeitura={false}
      />

      {empresas.length === 0 ? (
        <Card>
          <EmptyState icon={<MessagesSquare />} title="Nenhuma empresa no seu acesso" />
        </Card>
      ) : (
        <>
          {empresas.length > 1 && (
            <div className="mb-4">
              <SeletorDeEmpresaQueNavega empresas={empresas} empresaId={selecionada?.id ?? null} acao="/portal/comunicacao" />
            </div>
          )}

          {!selecionada ? (
            <Card>
              <EmptyState icon={<MessagesSquare />} title="Escolha a empresa" description="A conversa é por empresa." />
            </Card>
          ) : (
            <>
              {conversa && conversa.mensagens.length === 0 ? (
                <Card className="mb-4">
                  <EmptyState
                    icon={<MessagesSquare />}
                    title="Nenhuma mensagem ainda"
                    description="Escreva abaixo — a equipe é avisada na hora."
                  />
                </Card>
              ) : (
                conversa && (
                  <>
                    {conversa.limitada && (
                      <p className="text-[11px] text-fg-muted mb-2">Mostrando as 300 mensagens mais recentes.</p>
                    )}
                    <ConversaDaPendencia
                      mensagens={conversa.mensagens}
                      baseDoDownload="/portal/comunicacao/anexos"
                      ladoDeQuemVe="CLIENTE"
                    />
                  </>
                )
              )}

              <Card className="mt-5 p-4">
                <ResponderPendencia
                  alvo={selecionada.id}
                  campo="companyId"
                  acao={enviarMensagemCliente}
                  rotulo="Enviar mensagem"
                  dica="Anexe PDF, PNG, JPG ou XML de até 10 MB. A equipe é avisada quando você escreve."
                />
              </Card>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
