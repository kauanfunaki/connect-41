import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { pedidosAoClienteLigados, setorDaPendencia, setorPadraoDasPendencias } from "@/lib/financeiro/pendencias/setor";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { AcoesDaPendencia } from "@/components/pendencias/AcoesDaPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { carregarPendencia, lembretesDaPendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO, emAndamento } from "@/lib/financeiro/pendencias/regras";
import { passosPorExtenso, rotuloDoPasso, situacaoDoLembrete } from "@/lib/financeiro/pendencias/lembrete";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { responderPendenciaEquipe } from "../actions";

export const dynamic = "force-dynamic";


export default async function PendenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  if (!(await pedidosAoClienteLigados(ctx.tenantId))) notFound();

  const { id } = await params;
  const agora = new Date();
  const [p, lembretes, padrao, { labels }] = await Promise.all([
    carregarPendencia({ tenantId: ctx.tenantId, companyIds: null }, id, agora),
    lembretesDaPendencia(ctx.tenantId, id),
    setorPadraoDasPendencias(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);
  if (!p) notFound();
  // O setor é o da pendência (01/10: qualquer setor pede ao cliente). Setor
  // alheio responde "não encontrada", igual a uma que não existe.
  const setor = setorDaPendencia(p.setor, padrao);
  if (!canViewSector(ctx, setor)) notFound();
  const podeAgir = canActOnSector(ctx, setor);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title={p.titulo}
        subtitle={
          <>
            {p.empresaNome} · {ROTULO_DO_TIPO[p.tipo]} · {labels[setor] ?? setor}
            {p.prazo && <> · prazo {formatInstantDate(p.prazo)}</>}
          </>
        }
        action={podeAgir ? <AcoesDaPendencia id={p.id} status={p.status} /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2 mt-3 mb-4">
        <SeloDoStatus status={p.status} lado="EQUIPE" />
        <SeloDoPrazo situacao={p.situacaoDoPrazo} status={p.status} />
        {p.status === "RESOLVIDA" && p.resolvidaEm && (
          <span className="text-[12px] text-fg-muted">
            resolvida {p.resolvidaPor ? `por ${p.resolvidaPor} ` : ""}em {formatInstantDateTime(p.resolvidaEm)}
          </span>
        )}
      </div>

      {/* O que o cliente recebeu sozinho precisa estar à vista de quem cobra: sem isso,
          a equipe liga para lembrar de algo que o e-mail já lembrou ontem. */}
      {lembretes.length > 0 ? (
        <Card className="mb-4 p-4 text-[12px]">
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-2">Lembretes automáticos ao cliente</h2>
          <ul className="flex flex-col gap-1">
            {lembretes.map((l) => {
              const s = situacaoDoLembrete(l, agora);
              return (
                <li key={l.passo} className={s.tom === "falha" ? "text-danger" : "text-fg-secondary"}>
                  {rotuloDoPasso(l.passo)} · {formatInstantDateTime(l.em)} · {s.texto}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        p.status === "ABERTA" &&
        p.prazo && (
          <p className="mb-4 text-[12px] text-fg-muted">
            Se o prazo passar sem resposta, o cliente recebe lembrete por e-mail com {passosPorExtenso()} dias de atraso.
          </p>
        )
      )}

      {p.lancamento && (
        // Rótulo em cima e valor embaixo, como as outras fichas — era
        // "Lançamento vinculado:" corrido na mesma linha do link.
        <Card className="mb-4 p-4 text-[13px]">
          <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">Lançamento vinculado</p>
          <Link href={p.lancamento.kind === "PAGAR" ? "/pagar?recorte=todas" : "/receber?recorte=todas"} className="text-brand hover:underline">
            {p.lancamento.kind === "PAGAR" ? "a pagar" : "a receber"} · {p.lancamento.contraparteNome} ·{" "}
            {moeda(centavosDeDecimal(p.lancamento.valor))} · vence {formatInstantDate(p.lancamento.vencimento)}
          </Link>
        </Card>
      )}

      <ConversaDaPendencia
        abertura={{ descricao: p.descricao, anexos: p.anexosDaAbertura, por: p.abertaPor, em: p.abertaEm }}
        mensagens={p.mensagens}
        baseDoDownload="/api/pendencias/anexos"
        ladoDeQuemVe="EQUIPE"
      />

      {podeAgir && emAndamento(p.status) && (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            alvo={p.id}
            acao={responderPendenciaEquipe}
            dica="Responder devolve a pendência para o cliente, que recebe um e-mail só com o título e o link."
          />
        </Card>
      )}
      {podeAgir && !emAndamento(p.status) && (
        <p className="mt-5 text-[12px] text-fg-muted">Pendência encerrada. Reabra para continuar a conversa.</p>
      )}
    </PageContainer>
  );
}
