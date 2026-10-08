import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovaSolicitacaoForm } from "@/components/solicitacoes/NovaSolicitacaoForm";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { assuntosAtivos } from "@/lib/solicitacoes/assuntos";
import { abrirSolicitacao } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaSolicitacaoPage() {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("portal_solicitacoes")) notFound();

  const [empresas, assuntos] = await Promise.all([
    // As empresas do alcance do cliente, e não as ativas do tenant: o portal é dele.
    empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []),
    assuntosAtivos(escopo.tenantId),
  ]);

  return (
    <PageContainer>
      {/* O "voltar" com destino fixo, no BackButton (07/10/2026): quem chega pelo
          link do e-mail não tem histórico para onde voltar, e o link escrito
          à mão tinha 20px de alvo. */}
      <BackButton href="/portal/solicitacoes" rotulo="Solicitações" className="mb-3" />
      <PageHeader
        title="Nova solicitação"
        subtitle="Escolha o assunto e conte o que você precisa. A equipe certa recebe na hora e responde por aqui."
      />
      {empresas.length === 0 || assuntos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title={empresas.length === 0 ? "Nenhuma empresa no seu acesso" : "Nenhum assunto disponível"}
            description="Fale com o seu contato no escritório."
          />
        </Card>
      ) : (
        <Card className="p-5">
          <NovaSolicitacaoForm
            empresas={empresas}
            assuntos={assuntos.map((a) => ({ id: a.id, label: a.label, description: a.description, responseDays: a.responseDays }))}
            acao={abrirSolicitacao}
          />
        </Card>
      )}
    </PageContainer>
  );
}
