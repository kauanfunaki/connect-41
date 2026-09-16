import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { AcoesDaPendencia } from "@/components/pendencias/AcoesDaPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { carregarPendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO, emAndamento } from "@/lib/financeiro/pendencias/regras";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { responderPendenciaEquipe } from "../actions";

export const dynamic = "force-dynamic";

const MODULE = "bpo_pendencias";
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export default async function PendenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);

  const { id } = await params;
  const p = await carregarPendencia({ tenantId: ctx.tenantId, companyIds: null }, id, new Date());
  if (!p) notFound();

  return (
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <PageHeader
        title={p.titulo}
        subtitle={
          <>
            {p.empresaNome} · {ROTULO_DO_TIPO[p.tipo]}
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

      {p.lancamento && (
        <Card className="mb-4 px-4 py-3 text-[13px]">
          <span className="text-fg-muted">Lançamento vinculado: </span>
          <Link href={p.lancamento.kind === "PAGAR" ? "/pagar?recorte=todas" : "/receber?recorte=todas"} className="text-brand hover:underline">
            {p.lancamento.kind === "PAGAR" ? "a pagar" : "a receber"} · {p.lancamento.contraparteNome} ·{" "}
            {moeda(centavosDeDecimal(p.lancamento.valor))} · vence {formatInstantDate(p.lancamento.vencimento)}
          </Link>
        </Card>
      )}

      <ConversaDaPendencia
        descricao={p.descricao}
        anexosDaAbertura={p.anexosDaAbertura}
        abertaPor={p.abertaPor}
        abertaEm={p.abertaEm}
        mensagens={p.mensagens}
        baseDoDownload="/api/pendencias/anexos"
        ladoDeQuemVe="EQUIPE"
      />

      {podeAgir && emAndamento(p.status) && (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            requestId={p.id}
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
