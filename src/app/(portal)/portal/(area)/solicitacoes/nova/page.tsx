import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovaSolicitacaoForm } from "@/components/solicitacoes/NovaSolicitacaoForm";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { assuntosAtivos } from "@/lib/solicitacoes/assuntos";
import { Aviso } from "@/components/ui/Aviso";
import { LIMITE_DA_DESCRICAO } from "@/lib/solicitacoes/regras";
import { abrirSolicitacao } from "../actions";

export const dynamic = "force-dynamic";

/**
 * A solicitação já preenchida que a Ceci preparou (21/10/2026) chega pelo
 * endereço: `empresa`, `assunto` e `descricao`. Só vale a empresa do acesso e
 * o assunto ativo — o resto fica em branco —, e nada é enviado: o cliente
 * revisa e aperta "Enviar solicitação", pela action de sempre.
 */
export default async function NovaSolicitacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string; assunto?: string; descricao?: string }>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("portal_solicitacoes")) notFound();
  if (await telaBloqueadaNoPortal(escopo.tenantId, "/portal/solicitacoes")) return <TelaIndisponivel />;

  const pedido = await searchParams;
  const [empresas, assuntos] = await Promise.all([
    // As empresas do alcance do cliente, e não as ativas do tenant: o portal é dele.
    empresasDoSeletor(escopo.tenantId, escopo.companyIds ?? []),
    assuntosAtivos(escopo.tenantId),
  ]);

  const inicial = {
    empresaId: empresas.some((e) => e.id === pedido.empresa) ? pedido.empresa : undefined,
    assuntoId: assuntos.some((a) => a.id === pedido.assunto) ? pedido.assunto : undefined,
    descricao: typeof pedido.descricao === "string" ? pedido.descricao.slice(0, LIMITE_DA_DESCRICAO) : undefined,
  };
  const daCeci = !!(inicial.empresaId || inicial.assuntoId || inicial.descricao);

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
          {daCeci && (
            <Aviso tom="info" className="mb-4">
              A Ceci preencheu esta solicitação com o que você contou. Confira, ajuste o que precisar e envie — nada foi
              enviado ainda.
            </Aviso>
          )}
          <NovaSolicitacaoForm
            inicial={inicial}
            empresas={empresas}
            assuntos={assuntos.map((a) => ({ id: a.id, label: a.label, description: a.description, responseDays: a.responseDays }))}
            acao={abrirSolicitacao}
          />
        </Card>
      )}
    </PageContainer>
  );
}
