import Link from "next/link";
import { ArrowRightLeft, Clock, History, Inbox, Plus, Send, UserCheck } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import type { HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { PageContainer } from "@/components/shared/PageContainer";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { RotaDosSetores, LegendaDosSinais } from "@/components/transferencias/RotaDosSetores";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedHandoffWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate } from "@/lib/format";
import {
  abertaHa,
  assuntoDaTransferencia,
  transferenciaParada,
  HANDOFF_PARADA_DIAS,
  HANDOFF_PRIORITY_LABEL,
  HANDOFF_PRIORITY_OPTIONS,
  HANDOFF_PRIORITY_TOM,
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_TOM,
  SEM_ASSUNTO,
  SITUACOES_COM_O_SETOR,
} from "@/lib/handoffs";
import {
  ABAS_DA_TRANSFERENCIA,
  abasVisiveis,
  digitosDaBusca,
  lerAba,
  quemVeAsTransferencias,
  setoresDaCaixa,
  whereDaAba,
  whereDaBusca,
  whereDosFiltros,
  type AbaDaTransferencia,
  type QuemVeAsTransferencias,
} from "@/lib/handoffAbas";

/** Transferências por página — a lista pagina no servidor desde 10/11/2026. */
const POR_PAGINA = 50;
/** Quantas empresas ou pessoas a busca por nome/CNPJ leva para o filtro. */
const TETO_DA_BUSCA = 500;

const ICONE_DA_ABA: Record<AbaDaTransferencia, React.ReactNode> = {
  setor: <Inbox size={14} aria-hidden />,
  comigo: <UserCheck size={14} aria-hidden />,
  enviadas: <Send size={14} aria-hidden />,
  finalizadas: <History size={14} aria-hidden />,
};

// O vazio de cada aba diz o que entra nela, para a lista vazia não parecer erro.
const VAZIO_DA_ABA: Record<AbaDaTransferencia, { titulo: string; texto: string }> = {
  setor: {
    titulo: "Nada esperando o seu setor",
    texto: "Quando outro setor pedir ao seu para acompanhar uma empresa ou pessoa, a transferência aparece aqui, e o setor é avisado no sino.",
  },
  comigo: {
    titulo: "Nenhuma transferência com você",
    texto: "Aqui ficam as transferências em que você é responsável por um setor que ainda não finalizou a parte dele.",
  },
  enviadas: {
    titulo: "Nenhuma transferência enviada em aberto",
    texto: "O que você ou o seu setor pediu a outros setores fica aqui até todos finalizarem. A devolvida para você responder também aparece aqui.",
  },
  finalizadas: {
    titulo: "Nenhuma transferência finalizada",
    texto: "Quando todos os setores finalizam a parte deles, a transferência vem para cá.",
  },
};

type Parametros = { aba?: string; q?: string; prioridade?: string; setor?: string; responsavel?: string; pagina?: string };

/**
 * A caixa de entrada das transferências (10/11/2026, escolha "B · Caixa de
 * entrada em tabela" do Kauan): abas com a contagem, como nos Chamados, e a
 * tabela padrão. As abas trocaram os três cartões de situação e o "Situação"
 * do Filtros, que repetiam o "Novas" em dois lugares. As regras das abas
 * moram em src/lib/handoffAbas.ts.
 */
export default async function HandoffsPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const params = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const quem = quemVeAsTransferencias(ctx);
  const abas = abasVisiveis(quem);
  const aba = lerAba(params.aba, quem);
  const prisma = getPrisma();
  const agora = new Date();

  const [{ labels: sectorLabels, colors: sectorColors, options: sectorOptions }, responsaveisPossiveis] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    // O filtro de responsável oferece quem já respondeu por alguma transferência
    // do escritório — a lista de todo mundo teria gente que nunca aparece aqui.
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, handoffSectorAssignees: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const prioridade =
    params.prioridade && params.prioridade in HANDOFF_PRIORITY_LABEL ? (params.prioridade as HandoffPriority) : null;
  const setor = params.setor && params.setor in sectorLabels ? params.setor : null;
  const responsavel = params.responsavel && responsaveisPossiveis.some((u) => u.id === params.responsavel) ? params.responsavel : null;
  const termo = (params.q ?? "").trim().slice(0, 100);
  const pedida = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);

  // A busca acha a empresa ou a pessoa pelo nome ou pelo CNPJ/CPF primeiro: a
  // transferência guarda só o id dela, sem relação para o Prisma seguir.
  const achados = termo ? await idsDaBusca(ctx, termo) : null;

  // O mesmo filtro de base para a lista e para a contagem de cada aba, como nos
  // Chamados: o número da aba é o que ela mostraria com a busca e os filtros.
  const base: Prisma.HandoffWhereInput[] = [
    scopedHandoffWhere(ctx),
    ...whereDosFiltros({ prioridade, setor, responsavel }),
    ...(achados ? [whereDaBusca(termo, achados)] : []),
  ];
  const whereDa = (a: AbaDaTransferencia): Prisma.HandoffWhereInput => ({ AND: [...base, whereDaAba(a, quem)] });

  const buscarPagina = (p: number) =>
    prisma.handoff.findMany({
      where: whereDa(aba),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        subject: true,
        fromSector: true,
        entityType: true,
        entityId: true,
        priority: true,
        createdAt: true,
        // Só a visualização de quem olha: sem ela, o ponto azul de "ainda não aberta".
        views: { where: { userId: ctx.userId || "__none__" }, select: { id: true }, take: 1 },
        sectors: {
          orderBy: { createdAt: "asc" },
          select: {
            sectorCode: true,
            status: true,
            createdAt: true,
            assignees: { orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, name: true, photoUrl: true } } } },
          },
        },
      },
    });

  const [contagensDasAbas, primeira] = await Promise.all([
    Promise.all(abas.map((a) => prisma.handoff.count({ where: whereDa(a) }))),
    buscarPagina(pedida),
  ]);
  const contagem = Object.fromEntries(abas.map((a, i) => [a, contagensDasAbas[i]])) as Partial<Record<AbaDaTransferencia, number>>;
  const total = contagem[aba] ?? 0;
  const ultima = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Página além do fim (link antigo, a última esvaziou): mostra a última que existe.
  const pagina = Math.min(pedida, ultima);
  const handoffs = pagina === pedida ? primeira : await buscarPagina(pagina);

  // Nomes das empresas e pessoas — só as da página aberta.
  const companyIds = handoffs.filter((h) => h.entityType === "COMPANY").map((h) => h.entityId);
  const personIds = handoffs.filter((h) => h.entityType === "PERSON").map((h) => h.entityId);
  const [companies, people] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.findMany({ where: { tenantId: ctx.tenantId, id: { in: companyIds } }, select: { id: true, name: true, displayName: true } })
      : Promise.resolve([]),
    personIds.length > 0
      ? prisma.person.findMany({ where: { tenantId: ctx.tenantId, id: { in: personIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const entityNames: Record<string, string> = {};
  companies.forEach((c) => (entityNames[c.id] = nomeExibicao(c)));
  people.forEach((p) => (entityNames[p.id] = p.name));

  function href(mudancas: Partial<Record<keyof Parametros, string | null>>) {
    const atual: Record<string, string | null | undefined> = {
      aba: params.aba ? aba : null,
      q: termo || null,
      prioridade,
      setor,
      responsavel,
      ...mudancas,
    };
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/transferencias?${s}` : "/transferencias";
  }

  const filtrando = Boolean(termo || prioridade || setor || responsavel);
  const linhas = handoffs.map((h) => {
    const assunto = assuntoDaTransferencia(h);
    const pessoas = responsaveisDaLinha(aba, h.sectors, quem);
    return {
      id: h.id,
      href: `/transferencias/${h.id}`,
      assunto,
      naoLida: h.views.length === 0,
      entidade: entityNames[h.entityId] ?? null,
      fromSector: h.fromSector,
      sectors: h.sectors,
      responsaveis: pessoas,
      priority: h.priority,
      abertaHa: abertaHa(h.createdAt, agora),
      abertaEm: formatInstantDate(h.createdAt, { day: "2-digit", month: "long", year: "numeric" }),
      parada: transferenciaParada(h.sectors, agora),
      devolvida: h.sectors.some((s) => s.status === "RETURNED"),
    };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Transferências"
        subtitle="Pedidos de acompanhamento entre setores"
        action={
          canCreate ? (
            <Button href="/transferencias/novo" variant="primary">
              <Plus size={14} aria-hidden /> Nova transferência
            </Button>
          ) : undefined
        }
      />

      <AbasDeLink
        aria-label="Recortes das transferências"
        ativa={aba}
        abas={ABAS_DA_TRANSFERENCIA.filter((a) => abas.includes(a.chave)).map((a) => ({
          chave: a.chave,
          rotulo: a.rotulo,
          href: href({ aba: a.chave, pagina: null }),
          icone: ICONE_DA_ABA[a.chave],
          contagem: contagem[a.chave],
        }))}
      />

      <CascoDaTabela
        buscaAEsquerda
        contagem={contarItens(total, "transferência", "transferências")}
        busca={<DebouncedSearchInput paramName="q" placeholder="Buscar por assunto, empresa ou CNPJ" aria-label="Buscar transferência por assunto, empresa ou CNPJ" className="w-full" />}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "prioridade",
                rotulo: "Prioridade",
                vazioLabel: "Todas",
                opcoes: HANDOFF_PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label })),
              },
              { chave: "setor", rotulo: "Setor que recebe", vazioLabel: "Todos", opcoes: sectorOptions },
              {
                chave: "responsavel",
                rotulo: "Responsável",
                vazioLabel: "Todos",
                opcoes: responsaveisPossiveis.map((u) => ({ value: u.id, label: u.name })),
              },
            ]}
          />
        }
      >
        {linhas.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft />}
            title={filtrando ? "Nenhuma transferência encontrada" : VAZIO_DA_ABA[aba].titulo}
            description={filtrando ? "Tente outra busca ou tire um filtro." : VAZIO_DA_ABA[aba].texto}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((l) => (
                <Cartao key={l.id} className="relative hover:bg-surface-hover">
                  <Assunto linha={l} />
                  <InfoDoCartao className="mt-0.5">{l.entidade ?? "(removido)"}</InfoDoCartao>
                  <RotaDosSetores de={l.fromSector} para={l.sectors} rotulos={sectorLabels} cores={sectorColors} className="mt-2" />
                  <PeDoCartao>
                    <Selo tom={HANDOFF_PRIORITY_TOM[l.priority]}>{HANDOFF_PRIORITY_LABEL[l.priority]}</Selo>
                    <AbertaHa linha={l} />
                    <span className="text-ui text-fg-muted">·</span>
                    <Responsaveis pessoas={l.responsaveis} />
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr>
                    <th className="c41-a-esquerda px-3">Assunto</th>
                    <th className="px-3">Empresa</th>
                    <th className="px-3">Setores</th>
                    <th className="px-3">Responsável</th>
                    <th className="px-3">Prioridade</th>
                    <th className="px-3">Aberta há</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    // A linha inteira abre a transferência: o link do assunto se
                    // estica sobre ela (o mesmo jeito do Controle interno).
                    <tr key={l.id} className="relative border-b border-border-soft">
                      <td className="c41-a-esquerda px-3 max-w-xs">
                        <Assunto linha={l} />
                      </td>
                      <td className="px-3 text-fg-secondary">{l.entidade ?? <span className="text-fg-muted">(removido)</span>}</td>
                      <td className="px-3">
                        <RotaDosSetores de={l.fromSector} para={l.sectors} rotulos={sectorLabels} cores={sectorColors} className="justify-center" />
                      </td>
                      <td className="px-3">
                        <Responsaveis pessoas={l.responsaveis} />
                      </td>
                      <td className="px-3">
                        <Selo tom={HANDOFF_PRIORITY_TOM[l.priority]}>{HANDOFF_PRIORITY_LABEL[l.priority]}</Selo>
                      </td>
                      <td className="px-3 whitespace-nowrap">
                        <AbertaHa linha={l} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>

      {linhas.length > 0 && (
        <div className="mt-3">
          <LegendaDosSinais />
        </div>
      )}
      <Pagination page={pagina} totalPages={ultima} buildHref={(p) => href({ pagina: p > 1 ? String(p) : null })} total={total} rotulo="transferências" />
    </PageContainer>
  );
}

type Linha = {
  href: string;
  assunto: string | null;
  naoLida: boolean;
  abertaHa: string;
  abertaEm: string;
  parada: boolean;
  /** Algum setor devolveu a parte a quem pediu (10/11/2026). */
  devolvida: boolean;
};

/**
 * O assunto como link esticado sobre a linha (ou o cartão), com o ponto de
 * "ainda não aberta" e, quando um setor devolveu a parte, o selo "Devolvida"
 * (10/11/2026): em "Enviadas" é o que pede resposta de quem pediu.
 */
function Assunto({ linha }: { linha: Linha }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 flex-wrap">
      {linha.naoLida ? (
        <span aria-hidden className="size-[7px] flex-shrink-0 rounded-full bg-brand" title="Ainda não aberta por você" />
      ) : (
        <span aria-hidden className="w-[7px] flex-shrink-0" />
      )}
      <Link
        href={linha.href}
        className={`min-w-0 break-words hover:text-brand after:absolute after:inset-0 after:content-[''] ${
          linha.naoLida ? "font-bold text-fg" : "font-medium text-fg"
        }`}
      >
        {linha.naoLida && <span className="sr-only">Ainda não aberta por você: </span>}
        {linha.assunto ?? <span className="font-normal text-fg-muted">{SEM_ASSUNTO}</span>}
        {linha.devolvida && <span className="sr-only"> (devolvida: espera resposta de quem pediu)</span>}
      </Link>
      {linha.devolvida && (
        <span aria-hidden className="relative z-10 inline-flex" title="Um setor devolveu a parte dele: espera a resposta de quem pediu">
          <Selo tom={HANDOFF_STATUS_TOM.RETURNED}>{HANDOFF_STATUS_LABEL.RETURNED}</Selo>
        </span>
      )}
    </span>
  );
}

/** "Aberta há": em âmbar com o relógio quando um setor está sem finalizar há 3 dias ou mais. */
function AbertaHa({ linha }: { linha: Linha }) {
  if (!linha.parada) {
    return (
      <span className="text-ui text-fg-secondary tabular-nums" title={`Aberta em ${linha.abertaEm}`}>
        {linha.abertaHa}
      </span>
    );
  }
  return (
    <span
      className="relative z-10 inline-flex items-center gap-1 text-ui font-semibold text-warning-fg tabular-nums"
      title={`Parada: um setor está sem finalizar há ${HANDOFF_PARADA_DIAS} dias ou mais. Aberta em ${linha.abertaEm}.`}
    >
      <Clock size={13} aria-hidden />
      {linha.abertaHa}
      <span className="sr-only">, parada: um setor está sem finalizar há {HANDOFF_PARADA_DIAS} dias ou mais</span>
    </span>
  );
}

type Pessoa = { id: string; name: string; photoUrl: string | null };

function Responsaveis({ pessoas }: { pessoas: Pessoa[] }) {
  if (pessoas.length === 0) return <span className="text-ui text-fg-muted">Sem responsável</span>;
  const [primeira, ...outras] = pessoas;
  return (
    <span className="inline-flex items-center gap-1.5 text-ui text-fg-secondary" title={pessoas.map((p) => p.name).join(", ")}>
      <AvatarImage src={primeira.photoUrl} name={primeira.name} size={22} fontSize={9} />
      <span className="whitespace-nowrap">{primeira.name}</span>
      {outras.length > 0 && (
        <span className="text-fg-muted">
          +{outras.length}
          <span className="sr-only"> ({outras.map((p) => p.name).join(", ")})</span>
        </span>
      )}
    </span>
  );
}

type SetorDaLinha = {
  sectorCode: string;
  status: HandoffSectorStatus;
  assignees: { user: Pessoa }[];
};

/**
 * Quem aparece em "Responsável": em "Para o meu setor" e "Comigo", os
 * responsáveis da parte que cabe a quem olha (o setor da caixa, ou o setor em
 * que a pessoa responde); nas outras abas, os da transferência inteira, na
 * ordem dos setores. Sem repetir quem responde por dois setores.
 */
function responsaveisDaLinha(aba: AbaDaTransferencia, setores: SetorDaLinha[], quem: QuemVeAsTransferencias): Pessoa[] {
  let daVez = setores;
  // A parte que está com o setor (nova ou resolvendo) — a mesma regra das abas;
  // a devolvida está com quem pediu (10/11/2026).
  if (aba === "setor") {
    const caixa = setoresDaCaixa(quem);
    daVez = setores.filter((s) => SITUACOES_COM_O_SETOR.includes(s.status) && (caixa === null || caixa.includes(s.sectorCode)));
  } else if (aba === "comigo") {
    daVez = setores.filter((s) => SITUACOES_COM_O_SETOR.includes(s.status) && s.assignees.some((a) => a.user.id === quem.userId));
  }
  const vistos = new Map<string, Pessoa>();
  for (const s of daVez) for (const a of s.assignees) if (!vistos.has(a.user.id)) vistos.set(a.user.id, a.user);
  return [...vistos.values()];
}

/** As empresas e pessoas que casam com a busca, pelo nome ou pelo CNPJ/CPF. */
async function idsDaBusca(
  ctx: Awaited<ReturnType<typeof getAuthContext>>,
  termo: string
): Promise<{ empresas: string[]; pessoas: string[] }> {
  const prisma = getPrisma();
  const digitos = digitosDaBusca(termo);
  const [empresas, pessoas] = await Promise.all([
    prisma.company.findMany({
      where: {
        ...(await scopedCompanyWhere(ctx)),
        OR: [
          { name: { contains: termo } },
          { displayName: { contains: termo } },
          ...(digitos ? [{ cnpj: { contains: digitos } }, { cpf: { contains: digitos } }] : []),
        ],
      },
      select: { id: true },
      take: TETO_DA_BUSCA,
    }),
    prisma.person.findMany({
      where: {
        ...(await scopedPersonWhere(ctx)),
        OR: [{ name: { contains: termo } }, ...(digitos ? [{ cpf: { contains: digitos } }] : [])],
      },
      select: { id: true },
      take: TETO_DA_BUSCA,
    }),
  ]);
  return { empresas: empresas.map((e) => e.id), pessoas: pessoas.map((p) => p.id) };
}
