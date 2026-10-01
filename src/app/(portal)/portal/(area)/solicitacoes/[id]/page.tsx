import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { SeloDaSolicitacao } from "@/components/solicitacoes/SelosDaSolicitacao";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { carregarSolicitacao } from "@/lib/solicitacoes/consultas";
import { emAberto } from "@/lib/solicitacoes/regras";
import { formatInstantDate } from "@/lib/format";
import { cancelarSolicitacaoCliente, responderSolicitacaoCliente } from "../actions";

export const dynamic = "force-dynamic";

/** Uma solicitação vista pelo cliente: o pedido, o prazo, a conversa e a resposta. */
export default async function PortalSolicitacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("portal_solicitacoes")) notFound();

  const [{ id }, { nova }] = await Promise.all([params, searchParams]);
  const s = await carregarSolicitacao(
    { lado: "CLIENTE", escopo: { tenantId: escopo.tenantId, companyIds: escopo.companyIds ?? [] } },
    id,
    new Date()
  );
  if (!s) notFound();
  const aberta = emAberto(s.status);

  return (
    <PageContainer>
      <Link href="/portal/solicitacoes" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg mb-3">
        <ArrowLeft size={14} /> Solicitações
      </Link>
      <PageHeader
        title={`Solicitação nº ${s.numero}`}
        subtitle={
          <>
            {s.assunto} · {s.empresaNome}
          </>
        }
        action={<SeloDaSolicitacao status={s.status} lado="CLIENTE" />}
      />

      {nova === "1" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-success/40 bg-success-bg px-4 py-3 text-[13px] text-fg">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <span>
            Recebemos a sua solicitação nº {s.numero}. A equipe responde até <strong>{formatInstantDate(s.prazo)}</strong>, e você é avisado
            por e-mail quando ela responder.
          </span>
        </p>
      )}

      {nova !== "1" && aberta && !s.respondidaEm && (
        <p className="mb-4 text-[13px] text-fg-secondary">
          A equipe responde até <strong>{formatInstantDate(s.prazo)}</strong>.
        </p>
      )}

      <ConversaDaPendencia
        abertura={{ descricao: s.descricao, anexos: s.anexosDaAbertura, por: s.abertaPor, em: s.abertaEm }}
        mensagens={s.mensagens}
        baseDoDownload="/portal/solicitacoes/anexos"
        ladoDeQuemVe="CLIENTE"
      />

      {s.status === "CANCELADA" ? (
        <p className="mt-5 text-[12.5px] text-fg-muted">Esta solicitação foi cancelada. Se precisar, abra uma nova.</p>
      ) : (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            alvo={s.id}
            acao={responderSolicitacaoCliente}
            rotulo="Enviar mensagem"
            dica={
              s.status === "CONCLUIDA"
                ? "A equipe concluiu esta solicitação. Se ainda faltar algo, responda aqui: ela volta para a equipe."
                : "Anexe PDF, PNG, JPG ou XML de até 10 MB. A equipe é avisada na hora."
            }
          />
        </Card>
      )}

      {aberta && (
        <div className="mt-4 flex justify-end">
          <ConfirmActionButton
            action={cancelarSolicitacaoCliente.bind(null, s.id)}
            label="Cancelar solicitação"
            title={`Cancelar a solicitação nº ${s.numero}?`}
            description="Use quando não precisar mais. A equipe é avisada e a solicitação sai da fila."
            confirmLabel="Cancelar solicitação"
            successMessage="Solicitação cancelada."
            destructive
          />
        </div>
      )}
    </PageContainer>
  );
}
