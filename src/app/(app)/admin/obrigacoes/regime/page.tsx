import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { ToggleObrigacaoButton } from "@/components/admin/ToggleObrigacaoButton";
import { ModeloDeObrigacaoForm, MODELO_EM_BRANCO, type ValoresDoModelo } from "@/components/admin/ModeloDeObrigacaoForm";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, canManageSector } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { hojeIso } from "@/lib/datas/calendario";
import { ROTULO_DO_TIPO_DE_REGIME } from "@/lib/taxRegime";
import { descreverRegraDeData } from "@/lib/obrigacoes/calendario";
import { REGIMES_DO_FILTRO } from "@/lib/obrigacoes/formulario";
import { regrasDoModelo } from "@/lib/obrigacoes/geracao";
import type { RegraDeAplicacao } from "@/lib/obrigacoes/regra";
import { alternarModelo, atualizarModelo, criarModelo, previaDaRegra } from "./actions";

// Obrigações por regime (22/10/2026): o modelo cadastrado uma vez por setor e
// aplicado à carteira pela regra — ver src/lib/obrigacoes. Abre para o
// administrador e para o gestor de setor que tem setor (como Tags e Campos);
// o gestor vê e mexe só nos modelos dos setores dele.

const PERIODICIDADE: Record<string, string> = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral", ANUAL: "Anual" };
const LISTA = "/admin/obrigacoes/regime";

function resumoDaRegra(r: RegraDeAplicacao): string {
  const partes: string[] = [];
  partes.push(
    r.regimes.length === 0
      ? "Todos os regimes"
      : r.regimes.map((k) => ROTULO_DO_TIPO_DE_REGIME[k as keyof typeof ROTULO_DO_TIPO_DE_REGIME] ?? k).join(", ")
  );
  if (r.semMovimento === "NAO") partes.push("com movimento");
  if (r.semMovimento === "SIM") partes.push("sem movimento");
  if (r.comFuncionarios === "SIM") partes.push("com funcionários");
  if (r.comFuncionarios === "NAO") partes.push("sem funcionários");
  if (r.estados.length > 0) partes.push(r.estados.join(", "));
  if (r.cidades.length > 0) partes.push(r.cidades.join(", "));
  if (r.exigeSetorContratado) partes.push("setor contratado");
  return partes.join(" · ");
}

const DESCRICOES_DO_INTERRUPTOR = {
  desativar: "As atividades futuras ainda não concluídas desta obrigação saem dos kanbans. As vencidas e as concluídas ficam.",
  reativar: "As atividades das próximas competências voltam a ser geradas para as empresas da regra.",
};

export default async function ObrigacoesPorRegimePage({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const ctx = await getAuthContext();
  const podeAlgum = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!podeAlgum) notFound();
  const { novo, editar } = await searchParams;

  const prisma = getPrisma();
  const { labels } = await getSectorMaps(ctx.tenantId);
  const doSetor = isFullWrite(ctx.role) ? {} : { sectorCode: { in: ctx.sectors } };

  const [modelos, pipelines, abertas] = await Promise.all([
    prisma.modeloDeObrigacao.findMany({
      where: { tenantId: ctx.tenantId, ...doSetor },
      include: { pipeline: { select: { name: true } } },
      orderBy: [{ active: "desc" }, { sectorCode: "asc" }, { nome: "asc" }],
    }),
    prisma.pipeline.findMany({
      where: { tenantId: ctx.tenantId, active: true, entityType: "COMPANY", ...doSetor },
      select: { id: true, name: true, sectorCode: true },
      orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
    }),
    // As geradas que ainda vão vencer, por modelo — o tamanho da carteira de cada um.
    prisma.obrigacaoGerada.groupBy({
      by: ["modeloId"],
      where: { tenantId: ctx.tenantId, dataLegal: { gte: hojeIso() }, pipelineItemId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const abertasPorModelo = new Map(abertas.map((a) => [a.modeloId, a._count._all]));
  const opcoesDeKanban = pipelines.map((p) => ({ id: p.id, name: p.name, sectorLabel: sectorLabel(labels, p.sectorCode) }));
  const opcoesDeRegime = REGIMES_DO_FILTRO.map((k) => ({ value: k, label: ROTULO_DO_TIPO_DE_REGIME[k] }));

  const linhas = modelos.map((m) => {
    const { datas, aplicacao } = regrasDoModelo(m);
    return { m, datas, aplicacao, abertas: abertasPorModelo.get(m.id) ?? 0, podeMexer: canManageSector(ctx, m.sectorCode) };
  });
  const emEdicao = editar ? linhas.find((l) => l.m.id === editar && l.podeMexer) : undefined;
  const valoresDaEdicao: ValoresDoModelo | null = emEdicao
    ? {
        id: emEdicao.m.id,
        nome: emEdicao.m.nome,
        descricao: emEdicao.m.descricao ?? "",
        pipelineId: emEdicao.m.pipelineId,
        ...emEdicao.datas,
        ...emEdicao.aplicacao,
        semMovimento: emEdicao.aplicacao.semMovimento,
        comFuncionarios: emEdicao.aplicacao.comFuncionarios,
      }
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Obrigações por regime"
        subtitle="Cadastre a obrigação uma vez por setor e diga a que empresas ela se aplica — regime, sem movimento,
          funcionários, estado, cidade. O Connect gera as atividades das próximas competências no kanban do setor, com o
          responsável da empresa, e ajusta sozinho quando a empresa muda de regime."
        action={
          <Button href={`${LISTA}?novo=1`} variant="primary" className="font-medium">
            + Nova obrigação
          </Button>
        }
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers />}
            title="Nenhuma obrigação por regime cadastrada"
            description="Use “+ Nova obrigação”, no alto da tela, para cadastrar o DAS, a DCTFWeb, a DEFIS… com a regra das empresas a que cada uma se aplica."
          />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {linhas.map(({ m, datas, aplicacao, abertas, podeMexer }) => (
              <Cartao key={m.id}>
                <TopoDoCartao nome={m.nome} />
                <InfoDoCartao>
                  {sectorLabel(labels, m.sectorCode)} · kanban {m.pipeline.name} · {PERIODICIDADE[m.periodicidade]}
                </InfoDoCartao>
                <InfoDoCartao>{descreverRegraDeData(datas)}</InfoDoCartao>
                <InfoDoCartao>{resumoDaRegra(aplicacao)}</InfoDoCartao>
                <InfoDoCartao>{abertas} a vencer</InfoDoCartao>
                {podeMexer && (
                  <PeDoCartao>
                    <ToggleObrigacaoButton action={alternarModelo.bind(null, m.id)} ativo={m.active} nome={m.nome} descricoes={DESCRICOES_DO_INTERRUPTOR} />
                    <AcoesDoItem className="ml-auto" editar={`${LISTA}?editar=${m.id}`} />
                  </PeDoCartao>
                )}
              </Cartao>
            ))}
          </CartoesNoCelular>

          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3">Obrigação</th>
                  <th className="px-4 py-3">Setor</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">A quem se aplica</th>
                  <th className="px-4 py-3 text-right">A vencer</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ m, datas, aplicacao, abertas, podeMexer }) => (
                  <tr key={m.id} className={`border-b border-border ${m.id === emEdicao?.m.id ? "bg-surface-hover" : ""}`}>
                    <td className="px-4 py-3">
                      <span className="block max-w-[220px] font-medium text-fg truncate" title={m.nome}>
                        {m.nome}
                      </span>
                      <span className="block text-fs-1 text-fg-muted">{PERIODICIDADE[m.periodicidade]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-fg-secondary">{sectorLabel(labels, m.sectorCode)}</span>
                      <span className="block text-fs-1 text-fg-muted">kanban {m.pipeline.name}</span>
                    </td>
                    <td className="px-4 py-3 text-fg-secondary max-w-[260px]">{descreverRegraDeData(datas)}</td>
                    <td className="px-4 py-3 text-fg-secondary max-w-[280px]">{resumoDaRegra(aplicacao)}</td>
                    <td className="px-4 py-3 text-right text-fg-secondary tabular-nums">{abertas}</td>
                    <td className="px-4 py-3">
                      {podeMexer ? (
                        <ToggleObrigacaoButton action={alternarModelo.bind(null, m.id)} ativo={m.active} nome={m.nome} descricoes={DESCRICOES_DO_INTERRUPTOR} />
                      ) : (
                        <span className="text-fg-secondary">{m.active ? "Ativa" : "Inativa"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{podeMexer && <AcoesDoItem editar={`${LISTA}?editar=${m.id}`} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}

      {novo === "1" && (
        <PainelDeCadastro titulo="Nova obrigação por regime" voltarPara={LISTA} largo>
          <ModeloDeObrigacaoForm
            action={criarModelo}
            previa={previaDaRegra}
            cancelHref={LISTA}
            pipelines={opcoesDeKanban}
            regimes={opcoesDeRegime}
            valores={MODELO_EM_BRANCO}
          />
        </PainelDeCadastro>
      )}
      {valoresDaEdicao && (
        <PainelDeCadastro titulo="Editar obrigação por regime" voltarPara={LISTA} largo>
          <ModeloDeObrigacaoForm
            key={valoresDaEdicao.id}
            action={atualizarModelo}
            previa={previaDaRegra}
            cancelHref={LISTA}
            pipelines={opcoesDeKanban}
            regimes={opcoesDeRegime}
            valores={valoresDaEdicao}
          />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
