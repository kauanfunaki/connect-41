import Link from "next/link";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { SeloDaSolicitacao, SeloDoPrazoDeResposta } from "@/components/solicitacoes/SelosDaSolicitacao";
import { AcoesDaSolicitacao } from "@/components/solicitacoes/AcoesDaSolicitacao";
import { CamposDaRespostaDaEquipe } from "@/components/solicitacoes/CamposDaRespostaDaEquipe";
import { carregarSolicitacao } from "@/lib/solicitacoes/consultas";
import { podeAgirNaSolicitacao, podeVerSolicitacao } from "@/lib/solicitacoes/acesso";
import { emAberto } from "@/lib/solicitacoes/regras";
import { responderSolicitacaoEquipe } from "../actions";
import { CampoGuardarNosArquivos } from "@/components/arquivos/CampoGuardarNosArquivos";
import { destinosDaEmpresa } from "@/lib/drive/servidor";

export const dynamic = "force-dynamic";

/** Uma solicitação vista pela equipe: o pedido, o prazo prometido, a conversa (com as notas internas) e as ações. */
export default async function SolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const { id } = await params;
  const s = await carregarSolicitacao({ lado: "EQUIPE", tenantId: ctx.tenantId }, id, new Date());
  // Setor alheio responde "não encontrada", igual a uma que não existe.
  if (!s || !podeVerSolicitacao(ctx, { sectorCode: s.setor, assigneeId: s.assigneeId })) notFound();
  const podeAgir = podeAgirNaSolicitacao(ctx, { sectorCode: s.setor, assigneeId: s.assigneeId });
  const [ativos, { labels }, destinos] = await Promise.all([
    getActiveSectors(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    podeAgir ? destinosDaEmpresa(ctx, s.empresaId) : Promise.resolve(null),
  ]);
  const aberta = emAberto(s.status);

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Solicitações" escrito à mão, e a situação no
          `meta`, embaixo do título — o desenho de registro de trabalho do
          processo e do lead (padrões aceitos em 08/10/2026). Era no `action`,
          do outro lado da tela. */}
      <Breadcrumb
        items={[
          { label: "Solicitações", href: "/solicitacoes" },
          { label: `Nº ${s.numero}` },
        ]}
      />
      <PageHeader
        title={`Solicitação nº ${s.numero}`}
        subtitle={
          <>
            {s.assunto} ·{" "}
            <Link href={`/empresas/${s.empresaId}`} className="hover:underline">
              {s.empresaNome}
            </Link>{" "}
            · {labels[s.setor] ?? s.setor}
          </>
        }
        meta={
          <>
            <SeloDaSolicitacao status={s.status} lado="EQUIPE" />
            <SeloDoPrazoDeResposta situacao={s.situacao} />
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 text-fs-3 min-w-0 flex-1">
            <div>
              <dt className="text-fs-1 font-semibold uppercase tracking-wider text-fg-muted">Aberta por</dt>
              <dd className="mt-0.5 text-fg">
                {s.abertaPor} · {formatInstantDateTime(s.abertaEm)}
              </dd>
            </div>
            <div>
              <dt className="text-fs-1 font-semibold uppercase tracking-wider text-fg-muted">Responsável</dt>
              <dd className="mt-0.5 text-fg">{s.responsavel?.nome ?? "Ninguém assumiu"}</dd>
            </div>
            <div>
              <dt className="text-fs-1 font-semibold uppercase tracking-wider text-fg-muted">
                {s.respondidaEm ? "Primeira resposta" : "Resposta prometida até"}
              </dt>
              <dd className="mt-0.5 text-fg tabular-nums">
                {s.respondidaEm ? formatInstantDateTime(s.respondidaEm) : formatInstantDate(s.prazo)}
              </dd>
            </div>
            {!aberta && s.encerradaEm && (
              <div className="sm:col-span-3">
                <dt className="text-fs-1 font-semibold uppercase tracking-wider text-fg-muted">Encerrada</dt>
                <dd className="mt-0.5 text-fg">
                  {formatInstantDateTime(s.encerradaEm)}
                  {s.encerradaPor ? ` · ${s.encerradaPor}` : " · pelo cliente"}
                </dd>
              </div>
            )}
          </dl>
          {podeAgir && (
            <AcoesDaSolicitacao
              id={s.id}
              status={s.status}
              souResponsavel={!!ctx.userId && s.responsavel?.id === ctx.userId}
              setorAtual={s.setor}
              setores={ativos.map((a) => ({ code: a.code, label: a.label }))}
            />
          )}
        </div>
      </Card>

      <ConversaDaPendencia
        abertura={{ descricao: s.descricao, anexos: s.anexosDaAbertura, por: s.abertaPor, em: s.abertaEm }}
        mensagens={s.mensagens}
        baseDoDownload="/api/solicitacoes/anexos"
        ladoDeQuemVe="EQUIPE"
      />

      {podeAgir && (
        <Card className="mt-5 p-4">
          <ResponderPendencia
            alvo={s.id}
            acao={responderSolicitacaoEquipe}
            rotulo="Enviar"
            dica={
              aberta
                ? "O cliente recebe um e-mail avisando que há resposta — o texto fica só no portal."
                : "Solicitação encerrada: reabra para responder ao cliente. A nota interna continua valendo."
            }
            extras={
              <>
                <CamposDaRespostaDaEquipe id={s.id} />
                <CampoGuardarNosArquivos companyId={s.empresaId} destinos={destinos} />
              </>
            }
          />
        </Card>
      )}
    </PageContainer>
  );
}
