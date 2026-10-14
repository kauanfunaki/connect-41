import { notFound } from "next/navigation";
import { CalendarClock, ScrollText, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { BarraDaAuditoria, type BotaoDeTipo, type ChipDeLista, type ChipDoPeriodo } from "@/components/auditoria/BarraDaAuditoria";
import { LinhaDoTempo, type DiaNaTela, type EventoNaTela } from "@/components/auditoria/LinhaDoTempo";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSectorMaps } from "@/lib/sectors";
import { formatInstantTime } from "@/lib/format";
import { hojeIso } from "@/lib/datas/calendario";
import {
  ACOES,
  AREAS_DA_AUDITORIA,
  ROTULO_DO_TIPO,
  areaDaAcao,
  codigosDaArea,
  codigosDoTipo,
  codigosQueBatemComABusca,
  descricaoDaAcao,
  tiposQueBatemComABusca,
} from "@/lib/auditoria/acoes";
import { cabecalhoDoDia, contarPorDia, fimDoDia, inicioDoDia, nomeCurtoDoDia, OPCOES_DE_PERIODO, periodoCurto } from "@/lib/auditoria/dias";
import { DIAS_POR_VEZ, MAIS_POR_VEZ, POR_DIA, hrefDaAuditoria, hrefDoPeriodo, lerFiltros, temFiltro } from "@/lib/auditoria/filtros";
import { fraseDoEvento } from "@/lib/auditoria/frase";
import { empresaNosDetalhes, fatosDoRegistro, mudancasDoRegistro, nomeNosDetalhes, registroCompleto } from "@/lib/auditoria/metadados";
import { contagemPorTipo, metricasDaAuditoria, opcoesDeArea, pessoasQueAgiram } from "@/lib/auditoria/metricas";
import { chaveDoAlvo, resolverReferencias } from "@/lib/auditoria/alvos";

type Onde = Prisma.AuditLogWhereInput;

/** Teto da contagem por dia: a lista de instantes do período, que só traz a data. */
const TETO_DE_INSTANTES = 50_000;

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * A busca: nome de quem agiu, a frase e a área da ação, o tipo do cadastro, a
 * empresa (o cadastro da empresa e o que guardou o id dela) e o texto que a
 * linha guardou nos detalhes (o nome de uma pessoa excluída, de uma pasta).
 * O texto dos detalhes é procurado direto no MySQL, só no período escolhido;
 * se falhar, a busca segue sem ele.
 */
async function ondeDaBusca(tenantId: string, busca: string, de: Date, ate: Date): Promise<Onde> {
  const prisma = getPrisma();
  const empresas = await prisma.company
    .findMany({
      where: { tenantId, OR: [{ name: { contains: busca } }, { displayName: { contains: busca } }, { tradeName: { contains: busca } }] },
      select: { id: true },
      take: 50,
    })
    .catch(() => [] as { id: string }[]);
  const empresaIds = empresas.map((e) => e.id);

  let idsNosDetalhes: string[] = [];
  try {
    const porEmpresa = empresaIds.length
      ? Prisma.sql`OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.companyId')) IN (${Prisma.join(empresaIds)})`
      : Prisma.empty;
    const linhas = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM audit_logs
      WHERE tenantId = ${tenantId} AND createdAt >= ${de} AND createdAt < ${ate}
        AND (CAST(metadata AS CHAR) LIKE ${`%${busca}%`} ${porEmpresa})
      LIMIT 5000`;
    idsNosDetalhes = linhas.map((l) => l.id);
  } catch (err) {
    console.error("[auditoria] busca nos detalhes", err);
  }

  const codigos = codigosQueBatemComABusca(busca, Object.keys(ACOES));
  const tipos = tiposQueBatemComABusca(busca);
  const ou: Onde[] = [{ actorName: { contains: busca } }, { user: { is: { name: { contains: busca } } } }, { action: { contains: busca } }];
  if (codigos.length) ou.push({ action: { in: codigos } });
  if (tipos.length) ou.push({ entityType: { in: tipos } });
  if (empresaIds.length) ou.push({ entityType: "Company", entityId: { in: empresaIds } });
  if (idsNosDetalhes.length) ou.push({ id: { in: idsNosDetalhes } });
  return { OR: ou };
}

function ondeDaPessoa(pessoa: string | null): Onde {
  if (!pessoa) return {};
  if (pessoa.startsWith("nome:")) return { userId: null, actorName: pessoa.slice(5) };
  return { userId: pessoa };
}

// Só SUPER_ADMIN acessa — a trilha é informação sensível de todos os setores.
//
// Linha do tempo por dia (escolha "Auditoria · B" do Kauan, 14/10/2026), com os
// números do topo da alternativa A. Era uma tabela com os códigos das ações
// ("financeiro.entry.reversed") e o tipo do cadastro em inglês.
export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const agora = new Date();
  const hoje = hojeIso(agora);
  const f = lerFiltros(await searchParams, hoje);
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;

  const de = inicioDoDia(f.periodo.de);
  const ate = fimDoDia(f.periodo.ate);
  const doPeriodo: Onde = { tenantId, createdAt: { gte: de, lt: ate } };
  const daPessoa = ondeDaPessoa(f.pessoa);
  const daBusca: Onde = f.busca ? await ondeDaBusca(tenantId, f.busca, de, ate) : {};

  // As ações do recorte (sem área e sem tipo): delas saem as áreas, os tipos e os números.
  const porAcaoBruto = await prisma.auditLog.groupBy({
    by: ["action"],
    where: { AND: [doPeriodo, daPessoa, daBusca] },
    _count: { _all: true },
  });
  const porAcaoTodas = porAcaoBruto.map((g) => ({ acao: g.action, total: g._count._all }));
  const daAreaCodigos = f.area ? codigosDaArea(porAcaoTodas.map((p) => p.acao), f.area) : null;
  const porAcao = daAreaCodigos ? porAcaoTodas.filter((p) => daAreaCodigos.includes(p.acao)) : porAcaoTodas;
  const daArea: Onde = daAreaCodigos ? { action: { in: daAreaCodigos } } : {};
  const doTipo: Onde = f.tipo ? { action: { in: codigosDoTipo(porAcao.map((p) => p.acao), f.tipo) } } : {};
  const exclusoes = codigosDoTipo(porAcao.map((p) => p.acao), "excluiu");
  const completo: Onde = { AND: [doPeriodo, daPessoa, daArea, doTipo, daBusca] };

  const [atoresBruto, ultimaExclusao, deHoje, instantes, setores] = await Promise.all([
    prisma.auditLog.groupBy({ by: ["userId", "actorName"], where: { AND: [doPeriodo, daArea, daBusca] }, _count: { _all: true } }),
    exclusoes.length
      ? prisma.auditLog.findFirst({
          where: { AND: [doPeriodo, daPessoa, daArea, daBusca, { action: { in: exclusoes } }] },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : Promise.resolve(null),
    prisma.auditLog.count({ where: { AND: [{ tenantId, createdAt: { gte: inicioDoDia(hoje) } }, daPessoa, daArea, daBusca] } }),
    prisma.auditLog.findMany({ where: completo, select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: TETO_DE_INSTANTES }),
    getSectorMaps(tenantId),
  ]);

  // Quem agiu: o nome atual de quem ainda tem conta; o guardado, de quem foi excluído.
  const idsDosAtores = [...new Set(atoresBruto.flatMap((a) => (a.userId ? [a.userId] : [])))];
  const usuarios = idsDosAtores.length ? await prisma.user.findMany({ where: { id: { in: idsDosAtores } }, select: { id: true, name: true } }) : [];
  const pessoas = pessoasQueAgiram(
    atoresBruto.map((a) => ({ userId: a.userId, nome: a.actorName, total: a._count._all })),
    new Map(usuarios.map((u) => [u.id, u.name]))
  );

  const metricas = metricasDaAuditoria({
    porAcao,
    pessoas: f.pessoa ? pessoas.filter((p) => p.valor === f.pessoa).length : pessoas.length,
    ultimaExclusao: ultimaExclusao?.createdAt ?? null,
    hoje: deHoje,
    agora,
  });

  // ── A linha do tempo: os dias com ação, e as ações de cada dia à vista ──
  const diasComAcao = contarPorDia(instantes.map((i) => i.createdAt));
  const diasAVista = diasComAcao.slice(0, f.dias);
  const porDia = await Promise.all(
    diasAVista.map(async ({ dia, total }) => ({
      dia,
      total,
      linhas: await prisma.auditLog.findMany({
        where: { AND: [completo, { createdAt: { gte: inicioDoDia(dia), lt: fimDoDia(dia) } }] },
        orderBy: { createdAt: "desc" },
        take: f.dia === dia ? f.ver : POR_DIA,
        include: { user: { select: { name: true, photoUrl: true } } },
      }),
    }))
  );

  const resolvidos = await resolverReferencias(
    tenantId,
    porDia.flatMap((d) => d.linhas).map((l) => ({ entityType: l.entityType, entityId: l.entityId, metadata: l.metadata })),
    setores.labels
  );

  const dias: DiaNaTela[] = porDia.map(({ dia, total, linhas }) => {
    const { titulo, apoio } = cabecalhoDoDia(dia, total, hoje);
    const restantes = total - linhas.length;
    const proximos = Math.min(restantes, MAIS_POR_VEZ);
    const doDia = nomeCurtoDoDia(dia, hoje);
    return {
      dia,
      titulo,
      apoio,
      eventos: linhas.map((l): EventoNaTela => {
        const alvo = l.entityType && l.entityId ? (resolvidos.alvos.get(chaveDoAlvo(l.entityType, l.entityId)) ?? null) : null;
        const empresaId = alvo?.empresaId ?? empresaNosDetalhes(l.metadata);
        const empresa = empresaId ? (resolvidos.empresas.get(empresaId) ?? null) : null;
        const nomeDoAtor = l.user?.name ?? l.actorName ?? null;
        const descricao = descricaoDaAcao(l.action);
        const nomeNaFrase = descricao.comNome === false ? null : (alvo?.nome ?? nomeNosDetalhes(l.metadata, descricao.chaveDoNome));
        return {
          id: l.id,
          hora: formatInstantTime(l.createdAt, { hour: "2-digit", minute: "2-digit" }),
          pedacos: fraseDoEvento({
            acao: l.action,
            entityType: l.entityType,
            metadata: l.metadata,
            ator: nomeDoAtor,
            // Sem o vínculo com o usuário (excluído desde 13/10/2026), a linha
            // mostra o nome guardado em `actorName`.
            atorExcluido: !l.user,
            alvo: alvo ? { nome: alvo.nome, href: alvo.href } : null,
            empresa,
          }),
          area: AREAS_DA_AUDITORIA[areaDaAcao(l.action)],
          tipo: descricao.tipo,
          mudancas: mudancasDoRegistro(l.action, l.metadata, resolvidos.nomes),
          fatos: fatosDoRegistro(l.metadata, resolvidos.nomes, descricao.chaveDoNome ?? null),
          abrir: alvo?.href && !nomeNaFrase ? alvo.href : null,
          ator: { nome: nomeDoAtor ?? "?", foto: l.user?.photoUrl ?? null },
          registro: registroCompleto(l.metadata),
        };
      }),
      mais:
        restantes > 0
          ? {
              href: hrefDaAuditoria(f, { dia, ver: linhas.length + MAIS_POR_VEZ }),
              rotulo:
                restantes <= MAIS_POR_VEZ
                  ? `Mostrar mais ${proximos} ${proximos === 1 ? "ação" : "ações"} ${doDia}`
                  : `Mostrar mais ${proximos} ações ${doDia} · faltam ${NUMERO.format(restantes)}`,
            }
          : null,
    };
  });
  const diasQueFaltam = diasComAcao.length - diasAVista.length;

  // ── A barra de filtros ──
  const tipos = contagemPorTipo(porAcao);
  const botoesDeTipo: BotaoDeTipo[] = [
    { chave: "tudo", rotulo: "Tudo", total: null, href: hrefDaAuditoria(f, { tipo: null }), ativo: !f.tipo },
    ...(["criou", "editou", "excluiu"] as const).map((t) => ({
      chave: t,
      rotulo: ROTULO_DO_TIPO[t],
      total: tipos[t],
      href: hrefDaAuditoria(f, { tipo: f.tipo === t ? null : t }),
      ativo: f.tipo === t,
    })),
  ];

  const pessoaAtual = pessoas.find((p) => p.valor === f.pessoa);
  const listas: ChipDeLista[] = [
    {
      chave: "pessoa",
      titulo: "Pessoa",
      rotulo: f.pessoa ? `Pessoa: ${pessoaAtual?.rotulo ?? "escolhida"}` : "Pessoas: todas",
      ativo: Boolean(f.pessoa),
      opcoes: [
        { valor: "", rotulo: "Todas as pessoas", href: hrefDaAuditoria(f, { pessoa: null }), escolhida: !f.pessoa },
        ...pessoas.map((p) => ({
          valor: p.valor,
          rotulo: p.rotulo,
          nota: p.excluido ? "(excluído)" : undefined,
          total: p.total,
          href: hrefDaAuditoria(f, { pessoa: p.valor }),
          escolhida: p.valor === f.pessoa,
        })),
      ],
    },
    {
      chave: "area",
      titulo: "Área",
      rotulo: f.area ? `Área: ${AREAS_DA_AUDITORIA[f.area].rotulo}` : "Área: todas",
      ativo: Boolean(f.area),
      opcoes: [
        { valor: "", rotulo: "Todas as áreas", href: hrefDaAuditoria(f, { area: null }), escolhida: !f.area },
        ...opcoesDeArea(porAcaoTodas).map((a) => ({
          valor: a.chave,
          rotulo: a.rotulo,
          cor: a.cor,
          total: a.total,
          href: hrefDaAuditoria(f, { area: a.chave }),
          escolhida: a.chave === f.area,
        })),
      ],
    },
  ];

  const periodo: ChipDoPeriodo = {
    rotulo: f.periodo.rotulo,
    ativo: f.periodo.chave !== "7d",
    opcoes: OPCOES_DE_PERIODO.map((o) => ({ valor: o.chave, rotulo: o.rotulo, href: hrefDoPeriodo(f, o.chave), escolhida: f.periodo.chave === o.chave })),
    de: f.periodo.chave === "datas" ? f.periodo.de : "",
    ate: f.periodo.chave === "datas" ? f.periodo.ate : "",
    baseSemPeriodo: hrefDoPeriodo(f, "7d"),
  };

  const filtrado = temFiltro(f);

  return (
    <PageContainer>
      <div className="max-w-[1000px]">
        <PageHeader title="Auditoria" subtitle="Quem fez o quê neste escritório, dia a dia." />

        <FaixaDeTotais
          itens={[
            { rotulo: "Ações no período", valor: NUMERO.format(metricas.acoes), icone: <ScrollText />, detalhe: periodoCurto(f.periodo) },
            { rotulo: "Pessoas que agiram", valor: NUMERO.format(metricas.pessoas), icone: <Users />, detalhe: "no período" },
            {
              rotulo: "Exclusões",
              valor: NUMERO.format(metricas.exclusoes),
              icone: <Trash2 />,
              tom: metricas.exclusoes > 0 ? "text-danger" : undefined,
              detalhe: metricas.ultimaExclusao ?? "nenhuma no período",
            },
            { rotulo: "Hoje", valor: NUMERO.format(metricas.hoje), icone: <CalendarClock />, detalhe: "ações até agora" },
          ]}
        />

        <BarraDaAuditoria tipos={botoesDeTipo} listas={listas} periodo={periodo} hrefLimpar={filtrado ? "/admin/auditoria" : null} />

        {dias.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg">
            <EmptyState
              icon={<ScrollText />}
              title={filtrado ? "Nenhuma ação com esses filtros." : "Nenhuma ação nos últimos 7 dias."}
              description={filtrado ? "Tire um filtro ou aumente o período." : "Escolha um período maior no botão “Últimos 7 dias”."}
              action={
                filtrado ? (
                  <Button href="/admin/auditoria" variant="secondary" size="sm">
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <LinhaDoTempo dias={dias} />
            {diasQueFaltam > 0 && (
              <div className="mt-6 flex justify-center">
                <Button href={hrefDaAuditoria(f, { dias: f.dias + DIAS_POR_VEZ })} variant="secondary" size="sm">
                  Ver dias anteriores · {NUMERO.format(diasQueFaltam)} {diasQueFaltam === 1 ? "dia" : "dias"} com ações
                </Button>
              </div>
            )}
            {instantes.length >= TETO_DE_INSTANTES && (
              <p className="mt-4 text-center text-fs-2 text-fg-muted">
                O período tem mais de {NUMERO.format(TETO_DE_INSTANTES)} ações; os dias mais antigos podem não aparecer. Escolha um período menor.
              </p>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
