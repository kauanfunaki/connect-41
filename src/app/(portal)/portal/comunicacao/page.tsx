import { notFound } from "next/navigation";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
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
  const { escopo, modulos, grupoNome } = await contextoFinanceiroDoPortal();
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
        descricao="fale com a equipe e mande arquivos, por empresa."
        grupoNome={grupoNome}
        ativo="comunicacao"
        modulos={modulos}
        somenteLeitura={false}
      />

      {empresas.length === 0 ? (
        <Card>
          <EmptyState icon={<MessagesSquare />} title="Nenhuma empresa no seu acesso" />
        </Card>
      ) : (
        <>
          {empresas.length > 1 && (
            <nav className="flex flex-wrap gap-1.5 mb-4" aria-label="Empresas">
              {empresas.map((e) => (
                <Link
                  key={e.id}
                  href={`/portal/comunicacao?empresa=${e.id}`}
                  aria-current={e.id === selecionada?.id ? "page" : undefined}
                  className={
                    e.id === selecionada?.id
                      ? "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                      : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
                  }
                >
                  {e.nome}
                </Link>
              ))}
            </nav>
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
