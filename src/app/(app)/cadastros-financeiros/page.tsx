import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatCnpj, formatCpf } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { FiltroDePeriodo, AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { NovaContraparte, EditarContraparte } from "@/components/financeiro/FormContraparte";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";

export const dynamic = "force-dynamic";

const MODULE = "bpo_cadastros";
const SECTOR = getModuleDef(MODULE)!.sectorCode;

const ABAS = [
  { chave: "fornecedores", rotulo: "Fornecedores" },
  { chave: "sacados", rotulo: "Sacados" },
  { chave: "todos", rotulo: "Todos" },
] as const;

function documento(d: string | null): string {
  if (!d) return "—";
  return d.length === 14 ? formatCnpj(d) : d.length === 11 ? formatCpf(d) : d;
}

/**
 * Fornecedores e sacados da empresa cliente.
 *
 * **Uma ficha só para os dois papéis** — é como o schema modela
 * (`FinanceCounterparty`), porque o mesmo CNPJ costuma ser as duas coisas. As
 * abas não são tabelas diferentes: o papel sai do movimento. Fornecedor é quem
 * tem conta a pagar, sacado é quem tem conta a receber, e a ficha ainda sem
 * movimento aparece nas duas até a primeira conta dizer o que ela é.
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

  const cabecalho = <PageHeader title="Fornecedores e sacados" subtitle="As contrapartes de cada empresa cliente, e a categoria que a próxima conta herda." />;
  if (!companyId) {
    return (
      <PageContainer>
        {cabecalho}
        <EmptyState title="Nenhuma empresa ativa" icon={<Users />} />
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const [contrapartes, movimento, categorias] = await Promise.all([
    prisma.financeCounterparty.findMany({
      where: { tenantId: ctx.tenantId, companyId },
      select: { id: true, name: true, document: true, email: true, active: true, defaultCategoryId: true, defaultCategory: { select: { name: true } } },
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
      where: { tenantId: ctx.tenantId, kind: "PAGAR", active: true },
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
  const href = (a: string) => `/cadastros-financeiros?empresa=${companyId}${a === "fornecedores" ? "" : `&aba=${a}`}`;

  return (
    <PageContainer>
      {cabecalho}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FiltroDePeriodo acao="/cadastros-financeiros" empresas={empresas} empresaId={companyId} extras={{ aba: aba === "fornecedores" ? undefined : aba }} />
        {podeEditar && <NovaContraparte companyId={companyId} categorias={listaDeCategorias} />}
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Nome</th>
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="py-2 pr-3 font-medium">Categoria padrão</th>
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
                    <td className="py-2.5 pr-3 text-right tabular-nums">{n.pagar}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{n.receber}</td>
                    <td className="py-2.5 pr-3">
                      {c.active ? <Badge variant="success">Ativo</Badge> : <Badge variant="info">Inativo</Badge>}
                    </td>
                    <td className="py-2.5">
                      {podeEditar && (
                        <EditarContraparte
                          categorias={listaDeCategorias}
                          contraparte={{ id: c.id, nome: c.name, documento: c.document, email: c.email, defaultCategoryId: c.defaultCategoryId, ativo: c.active }}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-fg-muted mt-3">
            Inativo continua nas contas antigas e deixa de aparecer no lançamento manual. Cadastro não é apagado: a ficha é
            o que liga as notas e as contas de um mesmo fornecedor. O e-mail é para onde vai o lembrete da régua de
            cobrança — sacado sem e-mail fica fora dela.
          </p>
        </div>
      )}
    </PageContainer>
  );
}
