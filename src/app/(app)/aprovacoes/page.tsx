import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { FiltroDePeriodo, AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { DecisaoDaEquipe } from "@/components/aprovacoes/DecisaoDaEquipe";
import { HistoricoDaAprovacao, SeloDaAprovacao, type EventoDaAprovacao } from "@/components/aprovacoes/HistoricoDaAprovacao";
import { FormAlcada, AlternarAlcada } from "@/components/aprovacoes/FormAlcada";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";
import { podeDecidir, podeEnviarParaAprovacao } from "@/lib/financeiro/aprovacao/regras";
import { MODULO_DE_APROVACOES } from "@/lib/financeiro/aprovacao/servidor";

export const dynamic = "force-dynamic";

const MODULE = MODULO_DE_APROVACOES;
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const SITUACOES = [
  { chave: "aguardando", rotulo: "Aguardando", status: ["AGUARDANDO"] },
  { chave: "reprovadas", rotulo: "Reprovadas", status: ["REPROVADO"] },
  { chave: "todas", rotulo: "Aguardando e reprovadas", status: ["AGUARDANDO", "REPROVADO"] },
] as const;

const LIMITE = 500;

/**
 * Aprovações por alçada: a fila do que espera decisão e o cadastro das alçadas.
 *
 * A fila mostra aguardando e reprovadas — as duas travam a baixa. Aprovada sai
 * da fila e aparece em `/pagar` com o selo; cancelada sai de tudo.
 */
export default async function AprovacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);
  const gerencia = canManageSector(ctx, setor);

  const params = await searchParams;
  const aba = params.aba === "alcadas" && gerencia ? "alcadas" : "fila";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;

  const abas = [
    { chave: "fila", rotulo: "Fila", href: `/aprovacoes${empresaId ? `?empresa=${empresaId}` : ""}` },
    ...(gerencia
      ? [{ chave: "alcadas", rotulo: "Alçadas", href: `/aprovacoes?aba=alcadas${empresaId ? `&empresa=${empresaId}` : ""}` }]
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Aprovações"
        subtitle="Contas a pagar que esperam o “pode pagar” do cliente ou da coordenação. Aguardando e reprovada não são baixadas."
      />
      <div className="mt-4">
        <AbasDeLink abas={abas} ativa={aba} />
      </div>
      {aba === "fila" ? (
        <Fila
          tenantId={ctx.tenantId}
          userId={ctx.userId}
          empresas={empresas}
          empresaId={empresaId}
          situacao={SITUACOES.find((s) => s.chave === params.situacao) ?? SITUACOES[2]}
          podeAgir={podeAgir}
          gerencia={gerencia}
        />
      ) : (
        <Alcadas tenantId={ctx.tenantId} empresas={empresas} empresaId={empresaId} />
      )}
    </PageContainer>
  );
}

async function Fila({
  tenantId,
  userId,
  empresas,
  empresaId,
  situacao,
  podeAgir,
  gerencia,
}: {
  tenantId: string;
  userId: string;
  empresas: { id: string; nome: string }[];
  empresaId: string | null;
  situacao: (typeof SITUACOES)[number];
  podeAgir: boolean;
  gerencia: boolean;
}) {
  const prisma = getPrisma();
  const base = { tenantId, kind: "PAGAR" as const, status: { not: "CANCELADO" as const }, ...(empresaId ? { companyId: empresaId } : {}) };
  const [linhas, contagem] = await Promise.all([
    prisma.financeEntry.findMany({
      where: { ...base, approvalStatus: { in: [...situacao.status] } },
      select: {
        id: true,
        status: true,
        paidAt: true,
        kind: true,
        amount: true,
        dueDate: true,
        description: true,
        approvalStatus: true,
        createdById: true,
        createdBy: { select: { name: true } },
        counterparty: { select: { name: true } },
        company: { select: { name: true, displayName: true } },
        approvalEvents: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            decision: true,
            reason: true,
            createdAt: true,
            actorUser: { select: { name: true } },
            actorPortal: { select: { name: true } },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: LIMITE + 1,
    }),
    prisma.financeEntry.groupBy({
      by: ["approvalStatus"],
      where: { ...base, approvalStatus: { in: ["AGUARDANDO", "REPROVADO"] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const soma = (s: "AGUARDANDO" | "REPROVADO") => contagem.find((c) => c.approvalStatus === s);
  const aguardando = soma("AGUARDANDO");
  const reprovadas = soma("REPROVADO");

  const hrefSituacao = (chave: string) => {
    const q = new URLSearchParams();
    if (empresaId) q.set("empresa", empresaId);
    if (chave !== "todas") q.set("situacao", chave);
    const s = q.toString();
    return s ? `/aprovacoes?${s}` : "/aprovacoes";
  };

  return (
    <>
      <FaixaDeTotais
        itens={[
          { rotulo: "Aguardando", valor: String(aguardando?._count._all ?? 0), tom: aguardando ? "text-warning" : "" },
          { rotulo: "Valor aguardando", valor: moeda(aguardando?._sum.amount ? centavosDeDecimal(aguardando._sum.amount) : 0) },
          { rotulo: "Reprovadas", valor: String(reprovadas?._count._all ?? 0), tom: reprovadas ? "text-danger" : "" },
          { rotulo: "Valor reprovado", valor: moeda(reprovadas?._sum.amount ? centavosDeDecimal(reprovadas._sum.amount) : 0), tom: "text-fg-muted" },
        ]}
      />
      <FiltroDePeriodo
        acao="/aprovacoes"
        empresas={empresas}
        empresaId={empresaId}
        permitirTodas
        extras={{ situacao: situacao.chave === "todas" ? undefined : situacao.chave }}
      />
      <AbasDeLink abas={SITUACOES.map((s) => ({ chave: s.chave, rotulo: s.rotulo, href: hrefSituacao(s.chave) }))} ativa={situacao.chave} />

      {linhas.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Nada esperando decisão"
          description="Contas a pagar lançadas em empresas com alçada entram aqui sozinhas. Uma conta antiga pode ser enviada pela tela de contas a pagar."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Vencimento</th>
                <th className="py-2 pr-3 font-medium">Fornecedor</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium text-right">Valor</th>
                <th className="py-2 pr-3 font-medium">Aprovação</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.slice(0, LIMITE).map((l) => {
                const valorCentavos = centavosDeDecimal(l.amount);
                const descricao = `${l.counterparty.name} · ${moeda(valorCentavos)}`;
                const veredito = podeDecidir(
                  { ...l, valorCentavos },
                  { tipo: "EQUIPE", userId, gerenciaOSetor: gerencia },
                  "APROVAR"
                );
                const decidir: true | string | null =
                  l.approvalStatus !== "AGUARDANDO" || !podeAgir ? null : veredito.pode ? true : veredito.motivo;
                const eventos: EventoDaAprovacao[] = l.approvalEvents.map((e) => ({
                  id: e.id,
                  decisao: e.decision,
                  autor: e.actorPortal?.name ?? e.actorUser?.name ?? "—",
                  lado: e.actorPortal ? "cliente" : "equipe",
                  motivo: e.reason,
                  em: e.createdAt,
                }));
                const ultimoMotivo = [...eventos].reverse().find((e) => e.decisao === "REPROVADO")?.motivo;
                return (
                  <tr key={l.id} className="border-b border-border-soft align-top">
                    <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(l.dueDate)}</td>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{l.counterparty.name}</span>
                      {l.description && <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{l.description}</span>}
                      <span className="block text-[11px] text-fg-muted">lançada por {l.createdBy?.name ?? "—"}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-fg-secondary">{nomeExibicao(l.company)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{moeda(valorCentavos)}</td>
                    <td className="py-2.5 pr-3">
                      <SeloDaAprovacao status={l.approvalStatus} />
                      {l.approvalStatus === "REPROVADO" && ultimoMotivo && (
                        <span className="block text-[11px] text-danger mt-1 max-w-[260px]">“{ultimoMotivo}”</span>
                      )}
                      <HistoricoDaAprovacao eventos={eventos} />
                    </td>
                    <td className="py-2.5">
                      <DecisaoDaEquipe
                        entryId={l.id}
                        descricao={descricao}
                        decidir={decidir}
                        reenviar={podeAgir && l.approvalStatus === "REPROVADO" && podeEnviarParaAprovacao(l).pode}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {linhas.length > LIMITE && <p className="text-[11px] text-fg-muted mt-3">Mostrando as {LIMITE} primeiras. Filtre por empresa.</p>}
        </div>
      )}
    </>
  );
}

async function Alcadas({
  tenantId,
  empresas,
  empresaId,
}: {
  tenantId: string;
  empresas: { id: string; nome: string }[];
  empresaId: string | null;
}) {
  const prisma = getPrisma();
  const [alcadas, usuarios] = await Promise.all([
    prisma.portalApprovalLimit.findMany({
      where: { tenantId, ...(empresaId ? { companyId: empresaId } : {}) },
      select: {
        id: true,
        maxAmount: true,
        active: true,
        company: { select: { name: true, displayName: true } },
        portalUser: { select: { name: true, email: true, active: true } },
      },
      orderBy: [{ companyId: "asc" }, { maxAmount: "desc" }],
      take: 1000,
    }),
    empresaId ? usuariosDoGrupoDaEmpresa(tenantId, empresaId) : Promise.resolve([]),
  ]);

  return (
    <>
      <FiltroDePeriodo acao="/aprovacoes" empresas={empresas} empresaId={empresaId} permitirTodas extras={{ aba: "alcadas" }} />

      <Card className="p-4 mb-4">
        <h2 className="text-[14px] font-semibold mb-1">Nova alçada</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          O usuário do portal aprova contas a pagar desta empresa até o teto. A coordenação aprova sem teto. Com ao menos uma
          alçada ativa, toda conta a pagar lançada em aberto na empresa nasce aguardando aprovação.
        </p>
        {empresaId ? (
          <FormAlcada companyId={empresaId} usuarios={usuarios} />
        ) : (
          <p className="text-[12px] text-fg-muted">Escolha a empresa no filtro acima para cadastrar.</p>
        )}
      </Card>

      {alcadas.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Nenhuma alçada cadastrada" description="Sem alçada, as contas não entram em aprovação sozinhas." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Usuário do portal</th>
                <th className="py-2 pr-3 font-medium text-right">Teto</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {alcadas.map((a) => (
                <tr key={a.id} className="border-b border-border-soft">
                  <td className="py-2.5 pr-3">{nomeExibicao(a.company)}</td>
                  <td className="py-2.5 pr-3">
                    {a.portalUser.name}
                    <span className="block text-[11px] text-fg-muted">{a.portalUser.email}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{moeda(centavosDeDecimal(a.maxAmount))}</td>
                  <td className="py-2.5 pr-3">
                    {/* Alçada ativa de usuário desativado não conta — ver `whereDaAlcadaValida`. */}
                    {!a.portalUser.active ? (
                      <Badge variant="warning">Usuário inativo</Badge>
                    ) : a.active ? (
                      <Badge variant="success">Ativa</Badge>
                    ) : (
                      <Badge variant="info">Inativa</Badge>
                    )}
                  </td>
                  <td className="py-2.5">
                    <AlternarAlcada id={a.id} ativa={a.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function usuariosDoGrupoDaEmpresa(tenantId: string, companyId: string) {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { clientGroupId: true } });
  if (!empresa?.clientGroupId) return [];
  const usuarios = await prisma.portalUser.findMany({
    where: { tenantId, clientGroupId: empresa.clientGroupId, active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return usuarios.map((u) => ({ id: u.id, nome: u.name, email: u.email }));
}
