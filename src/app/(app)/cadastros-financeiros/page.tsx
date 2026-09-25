import { notFound } from "next/navigation";
import { Layers, Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatCnpj, formatCpf } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { Input } from "@/components/ui/Input";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { NovaContraparte, EditarContraparte } from "@/components/financeiro/FormContraparte";
import { NovoCentroDeCusto, EditarCentroDeCusto } from "@/components/financeiro/FormCentroDeCusto";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { GRUPOS, TRANSFERENCIA } from "@/lib/dre/estrutura";
import { grupoDeTexto } from "@/lib/dre/mapeamento";
import { NovaCategoriaDaEmpresa, LinhaDaDre, EsconderDoPadrao, EditarCategoriaDaEmpresa } from "@/components/financeiro/PlanoDaEmpresa";

export const dynamic = "force-dynamic";

const MODULE = "bpo_cadastros";
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const ABAS = [
  { chave: "fornecedores", rotulo: "Fornecedores" },
  { chave: "sacados", rotulo: "Sacados" },
  { chave: "todos", rotulo: "Todos" },
  { chave: "centros", rotulo: "Centros de custo" },
  { chave: "plano", rotulo: "Plano de contas" },
] as const;

function documento(d: string | null): string {
  if (!d) return "—";
  return d.length === 14 ? formatCnpj(d) : d.length === 11 ? formatCpf(d) : d;
}

/**
 * Fornecedores e sacados da empresa cliente, e os centros de custo dela.
 *
 * **Uma ficha só para os dois papéis** — é como o schema modela
 * (`FinanceCounterparty`), porque o mesmo CNPJ costuma ser as duas coisas. As
 * abas não são tabelas diferentes: o papel sai do movimento. Fornecedor é quem
 * tem conta a pagar, sacado é quem tem conta a receber, e a ficha ainda sem
 * movimento aparece nas duas até a primeira conta dizer o que ela é.
 *
 * Centros de custo moram aqui porque são cadastro da mesma empresa, com a mesma
 * permissão, e a contraparte aponta para eles como centro padrão.
 */
export default async function CadastrosFinanceirosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  // Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
  // é só o padrão.
  const setor = ctx.tenantId ? ((await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR) : SECTOR;
  if (!ctx.tenantId || !canViewSector(ctx, setor)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const aba = ABAS.find((a) => a.chave === params.aba)?.chave ?? "fornecedores";
  const podeEditar = canActOnSector(ctx, setor);
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const companyId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : empresas[0]?.id;

  const cabecalho = (
    <PageHeader
      title="Fornecedores e sacados"
      subtitle="As contrapartes, os centros de custo e o plano de contas de cada empresa cliente, e o que a próxima conta herda."
    />
  );
  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<Users />} />
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const href = (a: string) => `/cadastros-financeiros?empresa=${companyId}${a === "fornecedores" ? "" : `&aba=${a}`}`;
  const centros = await prisma.costCenter.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    select: { id: true, name: true, code: true, active: true },
    orderBy: { name: "asc" },
  });

  if (aba === "plano") {
    return (
      <PageContainer>
        {cabecalho}
        <FiltroDePeriodo acao="/cadastros-financeiros" empresas={empresas} empresaId={companyId} extras={{ aba }} />
        <AbasDeLink abas={ABAS.map((a) => ({ ...a, href: href(a.chave) }))} ativa={aba} />
        <AbaDoPlano tenantId={ctx.tenantId} companyId={companyId} podeEditar={podeEditar} />
      </PageContainer>
    );
  }

  if (aba === "centros") {
    return (
      <PageContainer>
        {cabecalho}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <FiltroDePeriodo acao="/cadastros-financeiros" empresas={empresas} empresaId={companyId} extras={{ aba }} />
          {podeEditar && <NovoCentroDeCusto companyId={companyId} />}
        </div>
        <AbasDeLink abas={ABAS.map((a) => ({ ...a, href: href(a.chave) }))} ativa={aba} />
        <AbaDeCentros tenantId={ctx.tenantId} companyId={companyId} centros={centros} podeEditar={podeEditar} />
      </PageContainer>
    );
  }

  const [contrapartes, movimento, categorias] = await Promise.all([
    prisma.financeCounterparty.findMany({
      where: { tenantId: ctx.tenantId, companyId },
      select: {
        id: true,
        name: true,
        document: true,
        email: true,
        active: true,
        defaultCategoryId: true,
        defaultCategory: { select: { name: true } },
        defaultCostCenterId: true,
        defaultCostCenter: { select: { name: true, active: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.financeEntry.groupBy({
      by: ["counterpartyId", "kind"],
      // Renegociado e perdido ainda dizem o papel da ficha: são contas a receber
      // que existiram, e o sacado não vira "sem movimento" porque fez um acordo.
      where: {
        tenantId: ctx.tenantId,
        companyId,
        OR: [{ status: { not: "CANCELADO" } }, { closeReason: { in: ["RENEGOCIADO", "PERDA"] } }],
      },
      _count: { _all: true },
    }),
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(ctx.tenantId, companyId, { kind: "PAGAR" }),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const contas = new Map<string, { pagar: number; receber: number }>();
  for (const m of movimento) {
    const atual = contas.get(m.counterpartyId) ?? { pagar: 0, receber: 0 };
    if (m.kind === "PAGAR") atual.pagar = m._count._all;
    else atual.receber = m._count._all;
    contas.set(m.counterpartyId, atual);
  }

  const busca = (params.q ?? "").trim().toLowerCase();
  const visiveis = contrapartes.filter((c) => {
    const n = contas.get(c.id) ?? { pagar: 0, receber: 0 };
    const semMovimento = n.pagar === 0 && n.receber === 0;
    const naAba = aba === "todos" || semMovimento || (aba === "fornecedores" ? n.pagar > 0 : n.receber > 0);
    const naBusca = !busca || c.name.toLowerCase().includes(busca) || (c.document ?? "").includes(busca.replace(/\D/g, "") || "\u0000");
    return naAba && naBusca;
  });

  const listaDeCategorias = categorias.map((c) => ({ id: c.id, nome: c.name }));
  // Inativo não é oferecido como padrão novo — ver `centroPadraoValido`.
  const centrosAtivos = centros.filter((c) => c.active).map((c) => ({ id: c.id, nome: c.name }));

  return (
    <PageContainer>
      {cabecalho}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FiltroDePeriodo acao="/cadastros-financeiros" empresas={empresas} empresaId={companyId} extras={{ aba: aba === "fornecedores" ? undefined : aba }} />
        {podeEditar && <NovaContraparte companyId={companyId} categorias={listaDeCategorias} centros={centrosAtivos} />}
      </div>
      <AbasDeLink abas={ABAS.map((a) => ({ ...a, href: href(a.chave) }))} ativa={aba} />

      <form method="get" action="/cadastros-financeiros" className="mb-4">
        <input type="hidden" name="empresa" value={companyId} />
        {aba !== "fornecedores" && <input type="hidden" name="aba" value={aba} />}
        <Input compact name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nome ou documento…" className="w-72 max-w-full" />
      </form>

      {visiveis.length === 0 ? (
        <EmptyState
          title={busca ? "Nada encontrado" : "Nenhum cadastro nesta aba"}
          description="Cadastros nascem do lançamento de uma nota, de um lançamento manual, da importação por CSV, ou daqui."
          icon={<Users />}
        />
      ) : (
        <>
          <CartoesNoCelular>
            {visiveis.map((c) => {
              const n = contas.get(c.id) ?? { pagar: 0, receber: 0 };
              return (
                <Cartao key={c.id}>
                  <TopoDoCartao nome={c.name} />
                  {c.email && <InfoDoCartao>{c.email}</InfoDoCartao>}
                  <InfoDoCartao className="tabular-nums">{documento(c.document)}</InfoDoCartao>
                  <InfoDoCartao className="mt-1">
                    categoria padrão {c.defaultCategory?.name ?? "—"} · centro padrão {c.defaultCostCenter?.name ?? "—"}
                    {c.defaultCostCenter && !c.defaultCostCenter.active && (
                      <span className="text-warning"> (inativo — não é herdado)</span>
                    )}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    {n.pagar} a pagar · {n.receber} a receber
                  </InfoDoCartao>
                  <PeDoCartao>
                    {c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="info">Inativo</Badge>}
                    {podeEditar && (
                      <span className="ml-auto">
                        <EditarContraparte
                          categorias={listaDeCategorias}
                          centros={centrosAtivos}
                          contraparte={{
                            id: c.id,
                            nome: c.name,
                            documento: c.document,
                            email: c.email,
                            defaultCategoryId: c.defaultCategoryId,
                            ativo: c.active,
                            defaultCostCenterId: c.defaultCostCenterId,
                            centroPadraoNome: c.defaultCostCenter?.name ?? null,
                          }}
                        />
                      </span>
                    )}
                  </PeDoCartao>
                </Cartao>
              );
            })}
          </CartoesNoCelular>

          <TabelaNoDesktop>
          <table className="w-full min-w-[920px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="py-2 pr-3 font-medium">Categoria padrão</th>
                <th className="py-2 pr-3 font-medium">Centro padrão</th>
                <th className="py-2 pr-3 font-medium text-right">Contas a pagar</th>
                <th className="py-2 pr-3 font-medium text-right">Contas a receber</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => {
                const n = contas.get(c.id) ?? { pagar: 0, receber: 0 };
                return (
                  <tr key={c.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{c.name}</span>
                      {c.email && <span className="block text-[11px] text-fg-muted">{c.email}</span>}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-fg-secondary">{documento(c.document)}</td>
                    <td className="py-2.5 pr-3 text-fg-secondary">{c.defaultCategory?.name ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-fg-secondary">
                      {c.defaultCostCenter?.name ?? "—"}
                      {c.defaultCostCenter && !c.defaultCostCenter.active && (
                        <span className="block text-[11px] text-warning">inativo — não é herdado</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{n.pagar}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{n.receber}</td>
                    <td className="py-2.5 pr-3">
                      {c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="info">Inativo</Badge>}
                    </td>
                    <td className="py-2.5">
                      {podeEditar && (
                        <EditarContraparte
                          categorias={listaDeCategorias}
                          centros={centrosAtivos}
                          contraparte={{
                            id: c.id,
                            nome: c.name,
                            documento: c.document,
                            email: c.email,
                            defaultCategoryId: c.defaultCategoryId,
                            ativo: c.active,
                            defaultCostCenterId: c.defaultCostCenterId,
                            centroPadraoNome: c.defaultCostCenter?.name ?? null,
                          }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </TabelaNoDesktop>
          <p className="text-[11px] text-fg-muted mt-3">
            Inativo continua nas contas antigas e deixa de aparecer no lançamento manual. Cadastro não é apagado: a ficha é
            o que liga as notas e as contas de um mesmo fornecedor. O e-mail é para onde vai o lembrete da régua de
            cobrança — sacado sem e-mail fica fora dela. O centro padrão entra na próxima conta quando quem lança não
            escolhe um centro.
          </p>
        </>
      )}
    </PageContainer>
  );
}

async function AbaDeCentros({
  tenantId,
  companyId,
  centros,
  podeEditar,
}: {
  tenantId: string;
  companyId: string;
  centros: { id: string; name: string; code: string | null; active: boolean }[];
  podeEditar: boolean;
}) {
  if (centros.length === 0) {
    return (
      <EmptyState
        title="Nenhum centro de custo nesta empresa"
        description="Centro de custo é opcional: cadastre unidades, obras ou projetos para ver a DRE econômica por centro."
        icon={<Layers />}
      />
    );
  }

  const prisma = getPrisma();
  // Quantos lançamentos cada centro tem — é o que diz se inativar tira alguém
  // do relatório (não tira: inativo continua nele, e a tela diz isso).
  const [uso, padroes] = await Promise.all([
    prisma.financeEntry.groupBy({
      by: ["costCenterId"],
      where: { tenantId, companyId, costCenterId: { not: null } },
      _count: { _all: true },
    }),
    prisma.financeCounterparty.groupBy({
      by: ["defaultCostCenterId"],
      where: { tenantId, companyId, defaultCostCenterId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const lancamentos = new Map(uso.map((u) => [u.costCenterId, u._count._all]));
  const contrapartes = new Map(padroes.map((u) => [u.defaultCostCenterId, u._count._all]));

  return (
    <>
      <CartoesNoCelular>
        {centros.map((c) => (
          <Cartao key={c.id}>
            <TopoDoCartao nome={c.name} valor={c.code ?? undefined} />
            <InfoDoCartao className="tabular-nums mt-1">
              {lancamentos.get(c.id) ?? 0} lançamento(s) · padrão de {contrapartes.get(c.id) ?? 0} contraparte(s)
            </InfoDoCartao>
            <PeDoCartao>
              {c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="info">Inativo</Badge>}
              {podeEditar && (
                <span className="ml-auto">
                  <EditarCentroDeCusto centro={{ id: c.id, nome: c.name, codigo: c.code, ativo: c.active }} />
                </span>
              )}
            </PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      <TabelaNoDesktop>
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Nome</th>
            <th className="py-2 pr-3 font-medium">Código</th>
            <th className="py-2 pr-3 font-medium text-right">Lançamentos</th>
            <th className="py-2 pr-3 font-medium text-right">Padrão de contrapartes</th>
            <th className="py-2 pr-3 font-medium">Situação</th>
            <th className="py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {centros.map((c) => (
            <tr key={c.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
              <td className="py-2.5 pr-3 font-medium">{c.name}</td>
              <td className="py-2.5 pr-3 text-fg-secondary tabular-nums">{c.code ?? "—"}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{lancamentos.get(c.id) ?? 0}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{contrapartes.get(c.id) ?? 0}</td>
              <td className="py-2.5 pr-3">
                {c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="info">Inativo</Badge>}
              </td>
              <td className="py-2.5">
                {podeEditar && <EditarCentroDeCusto centro={{ id: c.id, nome: c.name, codigo: c.code, ativo: c.active }} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </TabelaNoDesktop>
      <p className="text-[11px] text-fg-muted mt-3">
        Um centro por lançamento, sem rateio. Inativo some dos seletores e da herança, e continua na DRE por centro com o que
        já foi lançado nele. Centro de custo não é apagado. Na importação por CSV, a coluna <code>centro_de_custo</code> casa
        pelo nome ou pelo código.
      </p>
    </>
  );
}

/**
 * O plano de contas **desta empresa**: o padrão do escritório, o que a empresa
 * escondeu dele e as categorias só dela (criadas aqui ou trazidas do Omie).
 */
async function AbaDoPlano({ tenantId, companyId, podeEditar }: { tenantId: string; companyId: string; podeEditar: boolean }) {
  const prisma = getPrisma();
  const [categorias, ocultas, excecoes, uso] = await Promise.all([
    prisma.financeCategory.findMany({
      where: ondeDaEmpresa(tenantId, companyId, { apenasAtivas: false, incluirOcultas: true }),
      select: { id: true, name: true, kind: true, planGroup: true, dreGroup: true, active: true, companyId: true, omieCode: true },
      orderBy: [{ planGroup: "asc" }, { name: "asc" }],
    }),
    prisma.financeCategoryHidden.findMany({ where: { tenantId, companyId }, select: { categoryId: true } }),
    prisma.dreCategoryMapping.findMany({ where: { tenantId, companyId }, select: { categoryId: true, grupo: true } }),
    prisma.financeEntry.groupBy({ by: ["categoryId"], where: { tenantId, companyId, categoryId: { not: null } }, _count: { _all: true } }),
  ]);
  const oculta = new Set(ocultas.map((o) => o.categoryId));
  const excecao = new Map(excecoes.map((e) => [e.categoryId, e.grupo]));
  const lancamentos = new Map(uso.map((u) => [u.categoryId, u._count._all]));
  const linhas = [
    ...GRUPOS.map((g) => ({ code: g.code, label: g.label })),
    { code: TRANSFERENCIA, label: "Fora do resultado (transferência)" },
  ];
  const rotulo = (codigo: string | null) => (codigo ? (linhas.find((l) => l.code === grupoDeTexto(codigo))?.label ?? codigo) : "sem linha");
  const grupos = [...new Set(categorias.map((c) => c.planGroup).filter((g): g is string => !!g))].sort();
  const daEmpresa = categorias.filter((c) => c.companyId).length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-[12px] text-fg-muted max-w-2xl">
          O plano padrão do escritório vale para todas as empresas. Aqui ele se ajusta a esta: categoria só dela, o que não se
          usa escondido e a linha da DRE trocada. Nada é apagado — o que já foi lançado continua na DRE.
          {daEmpresa > 0 && ` ${daEmpresa} categoria${daEmpresa > 1 ? "s" : ""} só desta empresa.`}
        </p>
        {podeEditar && <NovaCategoriaDaEmpresa companyId={companyId} linhas={linhas} grupos={grupos} />}
      </div>
      {categorias.length === 0 ? (
        <EmptyState
          title="Plano de contas vazio"
          description="Carregue o plano padrão em Administração › Plano de contas, ou crie aqui uma categoria só desta empresa."
          icon={<Layers />}
        />
      ) : (
        (["PAGAR", "RECEBER"] as const).map((kind) => {
          const doLado = categorias.filter((c) => c.kind === kind);
          if (doLado.length === 0) return null;
          return (
            <div key={kind} className="mb-6">
              <h3 className="text-[14px] font-medium text-fg mb-2">{kind === "PAGAR" ? "Despesas (a pagar)" : "Receitas (a receber)"}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">Categoria</th>
                      <th className="py-2 pr-3 font-medium">Grupo do plano</th>
                      <th className="py-2 pr-3 font-medium">Linha da DRE nesta empresa</th>
                      <th className="py-2 pr-3 font-medium text-right">Lançamentos</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {doLado.map((c) => {
                      const escondida = oculta.has(c.id);
                      const propria = c.companyId !== null;
                      return (
                        <tr key={c.id} className={`border-b border-border-soft align-top ${escondida || !c.active ? "opacity-60" : ""}`}>
                          <td className="py-2 pr-3">
                            <span className="font-medium">{c.name}</span>
                            <span className="ml-2 inline-flex gap-1 align-middle">
                              {propria ? (
                                <Badge variant="info">{c.omieCode ? "Do Omie" : "Desta empresa"}</Badge>
                              ) : null}
                              {escondida && <Badge variant="warning">Não usada aqui</Badge>}
                              {!c.active && <Badge variant="warning">Inativa</Badge>}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-fg-secondary">{c.planGroup ?? "—"}</td>
                          <td className="py-2 pr-3">
                            {podeEditar && !escondida ? (
                              <LinhaDaDre
                                companyId={companyId}
                                categoryId={c.id}
                                valor={propria ? (grupoDeTexto(c.dreGroup) ?? "") : (excecao.get(c.id) ?? "")}
                                linhas={linhas}
                                rotuloDoPadrao={propria ? undefined : rotulo(c.dreGroup)}
                              />
                            ) : (
                              <span className="text-fg-secondary">{rotulo(excecao.get(c.id) ?? c.dreGroup)}</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{lancamentos.get(c.id) ?? 0}</td>
                          <td className="py-2">
                            {podeEditar &&
                              (propria ? (
                                <EditarCategoriaDaEmpresa
                                  categoria={{ id: c.id, nome: c.name, grupo: c.planGroup, linha: grupoDeTexto(c.dreGroup) ?? "", ativa: c.active }}
                                  linhas={linhas}
                                />
                              ) : (
                                <EsconderDoPadrao companyId={companyId} categoryId={c.id} oculta={escondida} />
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
