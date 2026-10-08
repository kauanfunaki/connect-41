import { notFound } from "next/navigation";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { carregarPendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO, emAndamento } from "@/lib/financeiro/pendencias/regras";
import { pedidosAoClienteNoConjunto, setorDaPendencia, setorPadraoDasPendencias } from "@/lib/financeiro/pendencias/setor";
import { getSectorMaps } from "@/lib/sectors";
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
  if (!pedidosAoClienteNoConjunto(modulos)) notFound();

  const { id } = await params;
  const [p, padrao, { labels }] = await Promise.all([
    carregarPendencia(escopo, id, new Date()),
    setorPadraoDasPendencias(escopo.tenantId),
    getSectorMaps(escopo.tenantId),
  ]);
  if (!p) notFound();
  const setor = setorDaPendencia(p.setor, padrao);

  return (
    <PageContainer>
      {/* O "voltar" com destino fixo, no BackButton (07/10/2026): quem chega pelo
          link do e-mail não tem histórico para onde voltar, e o link escrito
          à mão tinha 20px de alvo. */}
      <BackButton href="/portal/pendencias" rotulo="Pendências" className="mb-3" />
      {/* Os selos no `meta` do cabeçalho, embaixo do título, como no detalhe
          da equipe (07/10/2026). Ficavam numa linha solta entre o título e a
          conversa e, depois, no `action`, à direita — um terceiro lugar. */}
      <PageHeader
        title={p.titulo}
        subtitle={
          <>
            {p.empresaNome} · {ROTULO_DO_TIPO[p.tipo]} · {labels[setor] ?? setor}
            {p.prazo && <> · prazo {formatInstantDate(p.prazo)}</>}
          </>
        }
        meta={
          <>
            <SeloDoStatus status={p.status} lado="CLIENTE" />
            <SeloDoPrazo situacao={p.situacaoDoPrazo} status={p.status} />
          </>
        }
      />

      <ConversaDaPendencia
        abertura={{ descricao: p.descricao, anexos: p.anexosDaAbertura, por: p.abertaPor, em: p.abertaEm }}
        mensagens={p.mensagens}
        baseDoDownload="/portal/pendencias/anexos"
        ladoDeQuemVe="CLIENTE"
      />

      {emAndamento(p.status) ? (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            alvo={p.id}
            acao={responderPendenciaCliente}
            rotulo="Enviar resposta"
            dica="A equipe é avisada quando você responde."
          />
        </Card>
      ) : (
        // Aviso neutro onde estaria o campo de resposta (07/10/2026): era um
        // parágrafo cinza de 12px, fácil de passar batido.
        <Aviso tom="neutro" className="mt-5">
          Esta pendência foi encerrada pela equipe. Se ainda houver algo a tratar, fale com o seu contato no escritório.
        </Aviso>
      )}
    </PageContainer>
  );
}
