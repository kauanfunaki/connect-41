import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PortalNav } from "@/components/portal/PortalCabecalho";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { carregarPendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO, emAndamento } from "@/lib/financeiro/pendencias/regras";
import { formatInstantDate } from "@/lib/format";
import { responderPendenciaCliente } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Uma pendência vista pelo cliente: a conversa, os anexos e a resposta.
 *
 * O lançamento vinculado não aparece aqui de propósito: a tela de contas do
 * portal já mostra as contas, e o vínculo é ferramenta da equipe.
 */
export default async function PortalPendenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("bpo_pendencias")) notFound();

  const { id } = await params;
  const p = await carregarPendencia(escopo, id, new Date());
  if (!p) notFound();

  return (
    <PageContainer variant="narrow">
      <PortalNav ativo="pendencias" modulos={modulos} />
      <Link href="/portal/pendencias" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg mb-3">
        <ArrowLeft size={14} /> Pendências
      </Link>
      <PageHeader
        title={p.titulo}
        subtitle={
          <>
            {p.empresaNome} · {ROTULO_DO_TIPO[p.tipo]}
            {p.prazo && <> · prazo {formatInstantDate(p.prazo)}</>}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
        <SeloDoStatus status={p.status} lado="CLIENTE" />
        <SeloDoPrazo situacao={p.situacaoDoPrazo} status={p.status} />
      </div>

      <ConversaDaPendencia
        descricao={p.descricao}
        anexosDaAbertura={p.anexosDaAbertura}
        abertaPor={p.abertaPor}
        abertaEm={p.abertaEm}
        mensagens={p.mensagens}
        baseDoDownload="/portal/pendencias/anexos"
        ladoDeQuemVe="CLIENTE"
      />

      {emAndamento(p.status) ? (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            requestId={p.id}
            acao={responderPendenciaCliente}
            rotulo="Enviar resposta"
            dica="Anexe PDF, PNG, JPG ou XML de até 10 MB. A equipe é avisada quando você responde."
          />
        </Card>
      ) : (
        <p className="mt-5 text-[12px] text-fg-muted">
          Esta pendência foi encerrada pela equipe. Se ainda houver algo a tratar, fale com o seu contato na 41.
        </p>
      )}
    </PageContainer>
  );
}
