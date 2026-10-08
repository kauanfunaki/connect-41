import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRight, CheckCircle2, ClipboardList, FileQuestion, Hourglass } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, canActOnSector } from "@/lib/auth/context";
import { scopedAssessmentLinkWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { FiltroDaColunaNaUrl, FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { EmptyState } from "@/components/ui/EmptyState";
import { NovoTesteForm } from "@/components/teste/NovoTesteForm";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { lerLista } from "@/lib/filtroNaUrl";
import type { AssessmentLinkStatus } from "@/generated/prisma/enums";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";
import { Selo } from "@/components/ui/Selo";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

const PER_PAGE = 30;
// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "recrutamento";
const MODULE = "recrutamento_testes";

const STATUS_LABEL: Record<AssessmentLinkStatus, string> = {
  PENDENTE: "Pendente",
  RESPONDIDO: "Respondido",
};

const STATUS_STYLE: Record<AssessmentLinkStatus, string> = {
  PENDENTE: "bg-warning/10 text-warning-fg border-warning/25",
  RESPONDIDO: "bg-success/10 text-success-fg border-success/25",
};

const STATUS_ORDEM: AssessmentLinkStatus[] = ["PENDENTE", "RESPONDIDO"];

// O funil da coluna Teste escolhe o tipo: "DISC", o id de um modelo de
// múltipla escolha, ou este valor para o de múltipla escolha sem modelo.
const SEM_MODELO = "MULTIPLA";

export default async function TestesPage({
  searchParams,
}: {
  /** `teste` é o funil da coluna Teste — parâmetro repetido. */
  searchParams: Promise<{ status?: string; page?: string; teste?: string | string[] }>;
}) {
  const { status, page, teste } = await searchParams;
  const testesEscolhidos = lerLista(teste);
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, "recrutamento_testes"))) notFound();

  const statusFilter =
    status && (["PENDENTE", "RESPONDIDO"] as string[]).includes(status) ? (status as AssessmentLinkStatus) : undefined;

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const prisma = getPrisma();

  // Funil da coluna Teste (polimento de 30/09). A lista é paginada, então
  // filtra aqui, na base inteira — ver `FiltroDaColunaNaUrl`.
  const idsDeModelo = testesEscolhidos.filter((t) => t !== "DISC" && t !== SEM_MODELO && t !== "");
  const alternativasDeTeste = [
    ...(testesEscolhidos.includes("DISC") ? [{ type: "DISC" as const }] : []),
    ...(idsDeModelo.length > 0 ? [{ type: "MULTIPLA_ESCOLHA" as const, templateId: { in: idsDeModelo } }] : []),
    ...(testesEscolhidos.includes(SEM_MODELO) ? [{ type: "MULTIPLA_ESCOLHA" as const, templateId: null }] : []),
  ];
  // Valor desconhecido na URL não pode virar "tudo".
  const ondeTeste =
    testesEscolhidos.length === 0 ? {} : alternativasDeTeste.length > 0 ? { OR: alternativasDeTeste } : { id: { in: [] as string[] } };
  const base = scopedAssessmentLinkWhere(ctx);
  const ondeStatus = statusFilter ? { status: statusFilter } : {};
  const where = { AND: [base, ondeTeste, ondeStatus] };

  const canCreate = canWrite(ctx.role) && canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);

  const [links, total, candidatos, templates, porStatus, porTeste] = await Promise.all([
    prisma.assessmentLink.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        person: { select: { id: true, name: true } },
        candidatura: { select: { id: true, vaga: { select: { id: true, title: true } } } },
        template: { select: { name: true } },
      },
    }),
    prisma.assessmentLink.count({ where }),
    canCreate
      ? prisma.person.findMany({
          where: { type: "CANDIDATO", ...(await scopedPersonWhere(ctx)) },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    canCreate
      ? prisma.assessmentTemplate.findMany({
          where: { tenantId: ctx.tenantId, sectorCode: SECTOR, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    // Os cartões contam cada situação sem o filtro de situação; o funil de
    // teste conta sem o próprio filtro — em cascata, como no Excel.
    prisma.assessmentLink.groupBy({ by: ["status"], where: { AND: [base, ondeTeste] }, _count: { _all: true } }),
    prisma.assessmentLink.groupBy({ by: ["type", "templateId"], where: { AND: [base, ondeStatus] }, _count: { _all: true } }),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  const contagem: Record<AssessmentLinkStatus, number> = { PENDENTE: 0, RESPONDIDO: 0 };
  for (const g of porStatus) contagem[g.status] = g._count._all;

  // Os nomes dos modelos do funil — inclusive os arquivados, que continuam
  // nos testes já enviados.
  const idsNosGrupos = porTeste.map((g) => g.templateId).filter((id): id is string => id !== null);
  const nomesDosModelos = idsNosGrupos.length
    ? await prisma.assessmentTemplate.findMany({ where: { tenantId: ctx.tenantId, id: { in: idsNosGrupos } }, select: { id: true, name: true } })
    : [];
  const nomeDoModelo = new Map(nomesDosModelos.map((t) => [t.id, t.name]));
  const somaPorTeste = new Map<string, { rotulo: string; n: number }>();
  for (const g of porTeste) {
    const valor = g.type === "DISC" ? "DISC" : (g.templateId ?? SEM_MODELO);
    const rotulo = g.type === "DISC" ? "DISC" : g.templateId ? (nomeDoModelo.get(g.templateId) ?? "Modelo excluído") : "Múltipla escolha";
    const atual = somaPorTeste.get(valor);
    somaPorTeste.set(valor, { rotulo, n: (atual?.n ?? 0) + g._count._all });
  }
  const opcoesDeTeste = [...somaPorTeste.entries()]
    .map(([valor, { rotulo, n }]) => ({ valor, rotulo, n }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" }));

  // Carrega o funil (parâmetro repetido) junto: sem ele, virar a página ou
  // clicar num cartão apagava o filtro de teste.
  function buildUrl(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { status, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    for (const t of testesEscolhidos) q.append("teste", t);
    const s = q.toString();
    return s ? `/testes?${s}` : "/testes";
  }

  const nomeDoTeste = (l: (typeof links)[number]) => (l.type === "DISC" ? "DISC" : (l.template?.name ?? "Múltipla escolha"));

  // O resultado em uma etiqueta: o perfil no DISC, o acerto na múltipla escolha.
  const resultado = (l: (typeof links)[number]) => {
    if (l.status !== "RESPONDIDO") return null;
    if (l.type === "DISC" && l.primaryProfile) {
      return (
        <Selo tom="marca">
          Perfil {l.primaryProfile}
          {l.secondaryProfile ?? ""}
        </Selo>
      );
    }
    if (l.type === "MULTIPLA_ESCOLHA") {
      return (
        <Selo tom="marca">
          {(l.scores as { pct: number } | null)?.pct ?? 0}% de acertos
        </Selo>
      );
    }
    return null;
  };

  const seloDoStatus = (s: AssessmentLinkStatus) => (
    <Selo cor={STATUS_STYLE[s]}>
      {STATUS_LABEL[s]}
    </Selo>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Testes"
        subtitle={<>{total} teste{total !== 1 ? "s" : ""}</>}
        action={<>{canCreate && (
          // Era um link de texto cinza (30/09): botão não é link.
          <Button href="/testes/templates" variant="secondary">
            <FileQuestion size={14} /> Modelos de teste
          </Button>
        )}</>}
      />
      {canCreate && <NovoTesteForm candidatos={candidatos} templates={templates} />}

      {/* As duas situações em cartão, com a contagem — eram pílulas sem número
          e um "Limpar" (conferência de 30/09). Clicar no cartão do recorte
          aberto volta para todos. */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Aguardando resposta",
            valor: formatarNumero(contagem.PENDENTE, 0),
            icone: <Hourglass />,
            tom: contagem.PENDENTE > 0 ? "text-warning-fg" : undefined,
            detalhe: statusFilter === "PENDENTE" ? "mostrando agora" : undefined,
            ativo: statusFilter === "PENDENTE",
            href: buildUrl({ status: statusFilter === "PENDENTE" ? undefined : "PENDENTE", page: undefined }),
          },
          {
            rotulo: "Respondidos",
            valor: formatarNumero(contagem.RESPONDIDO, 0),
            icone: <CheckCircle2 />,
            tom: "text-success-fg",
            detalhe: statusFilter === "RESPONDIDO" ? "mostrando agora" : undefined,
            ativo: statusFilter === "RESPONDIDO",
            href: buildUrl({ status: statusFilter === "RESPONDIDO" ? undefined : "RESPONDIDO", page: undefined }),
          },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(total, "teste", "testes")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "status",
                rotulo: "Situação",
                vazioLabel: `Todos (${contagem.PENDENTE + contagem.RESPONDIDO})`,
                opcoes: STATUS_ORDEM.map((s) => ({ value: s, label: `${STATUS_LABEL[s]} (${contagem[s]})` })),
              },
            ]}
          />
        }
      >
        <FiltrosDasColunasNaUrl colunas={[{ chave: "teste", rotulo: "Teste" }]} />

        {links.length === 0 ? (
          <EmptyState
            icon={<ClipboardList />}
            title="Nenhum teste encontrado"
            description="Ajuste os filtros ou envie o primeiro teste pra um candidato acima."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {links.map((l) => (
                <Link key={l.id} href={`/testes/${l.id}`} className="block">
                  <Cartao className="hover:border-brand/40 transition-colors">
                    <TopoDoCartao nome={l.person.name} />
                    <InfoDoCartao>
                      {nomeDoTeste(l)}
                      {l.candidatura ? ` · ${l.candidatura.vaga.title}` : ""}
                    </InfoDoCartao>
                    <PeDoCartao>
                      {seloDoStatus(l.status)}
                      {resultado(l)}
                      <span className="ml-auto text-[length:var(--fs-micro)] text-fg-muted">enviado em {formatInstantDate(l.createdAt)}</span>
                    </PeDoCartao>
                  </Cartao>
                </Link>
              ))}
            </CartoesNoCelular>

            {/* Era uma lista de linhas-link com tudo numa frase (até 30/09).
                Virou tabela no padrão do Connect, com o funil de teste. */}
            <TabelaNoDesktop padrao>
              <table className="w-full table-fixed min-w-[880px] text-[length:var(--fs-ui)]">
                <colgroup>
                  <col />
                  <col className="w-[180px]" />
                  <col className="w-[200px]" />
                  <col className="w-[116px]" />
                  <col className="w-[124px]" />
                  <col className="w-[112px]" />
                  <col className="w-[96px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Candidato</th>
                    <th className="px-4 py-3">
                      <FiltroDaColunaNaUrl rotulo="Teste" chave="teste" opcoes={opcoesDeTeste} />
                    </th>
                    <th className="px-4 py-3">Vaga</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">Resultado</th>
                    <th className="px-4 py-3">Enviado em</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id} className="border-b border-border">
                      <td className="px-4 py-3 min-w-0">
                        <Link
                          href={`/testes/${l.id}`}
                          className="block font-semibold text-fg hover:text-brand transition-colors truncate"
                          title={l.person.name}
                        >
                          {l.person.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary truncate" title={nomeDoTeste(l)}>
                        {nomeDoTeste(l)}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary truncate" title={l.candidatura?.vaga.title}>
                        {l.candidatura ? l.candidatura.vaga.title : <span className="text-fg-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">{seloDoStatus(l.status)}</td>
                      <td className="px-4 py-3">{resultado(l) ?? <span className="text-fg-muted">—</span>}</td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatInstantDate(l.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button href={`/testes/${l.id}`} variant="secondary" size="xs">
                          Abrir <ArrowRight size={11} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => buildUrl({ page: String(p) })} total={total} rotulo="testes" />
    </PageContainer>
  );
}
