import Link from "next/link";
import { SquareKanban } from "lucide-react";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { notFound } from "next/navigation";
import { canViewSector, getAuthContext } from "@/lib/auth/context";
import { cartaoDaSolicitacao } from "@/lib/solicitacoes/cartaoServidor";
import { TOM_DA_ETAPA } from "@/lib/kanban/camposDaTarefa";
import { Selo } from "@/components/ui/Selo";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { InfoRow } from "@/components/empresas/InfoRow";
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
import { abrirPeloEndereco } from "@/lib/enderecoCurtoServidor";
import { endereco } from "@/lib/enderecoCurto";

export const dynamic = "force-dynamic";

/** Uma solicitação vista pela equipe: o pedido, o prazo prometido, a conversa (com as notas internas) e as ações. */
export default async function SolicitacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  // O endereço curto (10/11/2026, pedido do Kauan): /solicitacoes/solicitacao-12,
  // com o número do protocolo. O do uuid passa para ele.
  const { id } = await abrirPeloEndereco("solicitacao", ctx.tenantId, (await params).id, await searchParams);
  const s = await carregarSolicitacao({ lado: "EQUIPE", tenantId: ctx.tenantId }, id, new Date());
  // Setor alheio responde "não encontrada", igual a uma que não existe.
  if (!s || !podeVerSolicitacao(ctx, { sectorCode: s.setor, assigneeId: s.assigneeId })) notFound();
  const podeAgir = podeAgirNaSolicitacao(ctx, { sectorCode: s.setor, assigneeId: s.assigneeId });
  const [ativos, { labels }, destinos, cartao] = await Promise.all([
    getActiveSectors(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    podeAgir ? destinosDaEmpresa(ctx, s.empresaId) : Promise.resolve(null),
    cartaoDaSolicitacao(ctx.tenantId, s.id),
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
            <Link href={endereco("empresa", s.empresaNumero)} className="hover:underline">
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
          {/* Os fatos no par rótulo/valor das fichas (`InfoRow`, como na do
              lead) — eram rótulos em caixa alta escritos à mão (15/10/2026). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4 min-w-0 flex-1">
            <InfoRow label="Aberta por" value={`${s.abertaPor} · ${formatInstantDateTime(s.abertaEm)}`} />
            <InfoRow label="Responsável" value={s.responsavel?.nome ?? "Ninguém assumiu"} />
            <InfoRow
              label={s.respondidaEm ? "Primeira resposta" : "Resposta prometida até"}
              value={s.respondidaEm ? formatInstantDateTime(s.respondidaEm) : formatInstantDate(s.prazo)}
              mono
            />
            {!aberta && s.encerradaEm && (
              <InfoRow
                label="Encerrada"
                value={`${formatInstantDateTime(s.encerradaEm)}${s.encerradaPor ? ` · ${s.encerradaPor}` : " · pelo cliente"}`}
                className="sm:col-span-3"
              />
            )}
            {/* O cartão no quadro do setor, quando o assunto liga (09/11/2026).
                Quem não vê o setor da lista lê onde ele está, sem o link. */}
            {cartao && (
              <InfoRow label="Cartão no quadro" className="sm:col-span-3">
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                  {canViewSector(ctx, cartao.sectorCode) ? (
                    <Link href={cartao.href} title={`Abrir o cartão em ${cartao.lista}`} className="inline-flex items-center gap-1.5 text-brand hover:underline min-w-0 max-w-full">
                      <SquareKanban size={14} aria-hidden className="flex-shrink-0" />
                      <span className="truncate">{cartao.lista}</span>
                    </Link>
                  ) : (
                    <span title={cartao.lista} className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                      <SquareKanban size={14} aria-hidden className="flex-shrink-0 text-fg-muted" />
                      <span className="truncate">{cartao.lista}</span>
                    </span>
                  )}
                  <Selo tom={TOM_DA_ETAPA[cartao.colunaTipo]}>{cartao.coluna}</Selo>
                </span>
              </InfoRow>
            )}
          </div>
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
