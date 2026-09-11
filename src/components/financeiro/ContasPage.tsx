import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { listarContas, competenciasComContas, type TipoDeConta } from "@/lib/financeiro/data";
import { saoPauloParts } from "@/lib/agenda";
import { ContasTable, moeda } from "./ContasTable";

const SECTOR = "bpo";

const RECORTES = [
  { chave: "abertas", rotulo: "Em aberto" },
  { chave: "vencidas", rotulo: "Vencidas" },
  { chave: "todas", rotulo: "Todas" },
] as const;

/**
 * A tela de contas, que serve a pagar e a receber.
 *
 * Uma só porque **são a mesma tela com outro sinal**: o Connect unificou
 * `Payable` e `Receivable` num `FinanceEntry` com `kind`, e duplicar o
 * componente aqui reintroduziria pela porta dos fundos a separação que o
 * schema já resolveu. O que muda é o rótulo da contraparte (fornecedor ×
 * cliente) e o do total.
 */
export async function ContasPage({
  kind,
  modulo,
  searchParams,
}: {
  kind: TipoDeConta;
  modulo: string;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, modulo))) notFound();

  const params = await searchParams;
  const recorte =
    RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "abertas";

  const prisma = getPrisma();
  const agora = new Date();

  const [resultado, competencias, empresas] = await Promise.all([
    listarContas(
      ctx.tenantId,
      kind,
      { recorte, competencia: params.competencia, empresaId: params.empresa },
      agora
    ),
    competenciasComContas(ctx.tenantId, kind),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
  ]);

  const aPagar = kind === "PAGAR";
  const base = aPagar ? "/pagar" : "/receber";

  function comParam(chave: string, valor: string | undefined) {
    const q = new URLSearchParams();
    if (params.competencia) q.set("competencia", params.competencia);
    if (params.empresa) q.set("empresa", params.empresa);
    if (recorte !== "abertas") q.set("recorte", recorte);
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  }

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="mb-5">
        <PageHeader title={aPagar ? "Contas a pagar" : "Contas a receber"} />
        <p className="text-[13px] text-fg-muted mt-1">
          {aPagar
            ? "O que sai. Nasce do documento fiscal e herda o valor dele — com retenção, pelo líquido."
            : "O que entra. Nasce do documento fiscal emitido pela empresa."}
        </p>
      </div>

      {/* Três números, e o primeiro é o que a pessoa procura: quanto falta.
          Vencido em destaque porque é o que já custa. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-md overflow-hidden mb-4">
        <div className="bg-surface px-3.5 py-3">
          <span className="block text-[11px] uppercase tracking-wide text-fg-muted">Em aberto</span>
          <span className="block text-[17px] font-semibold tabular-nums mt-0.5">
            {moeda(resultado.totais.emAberto)}
          </span>
        </div>
        <div className="bg-surface px-3.5 py-3">
          <span className="block text-[11px] uppercase tracking-wide text-fg-muted">Vencido</span>
          <span
            className={`block text-[17px] font-semibold tabular-nums mt-0.5 ${
              resultado.totais.vencido > 0 ? "text-danger" : ""
            }`}
          >
            {moeda(resultado.totais.vencido)}
          </span>
        </div>
        <div className="bg-surface px-3.5 py-3">
          <span className="block text-[11px] uppercase tracking-wide text-fg-muted">Vence hoje</span>
          <span className="block text-[17px] font-semibold tabular-nums mt-0.5">
            {moeda(resultado.totais.venceHoje)}
          </span>
        </div>
        <div className="bg-surface px-3.5 py-3">
          <span className="block text-[11px] uppercase tracking-wide text-fg-muted">
            {aPagar ? "Pago" : "Recebido"}
          </span>
          <span className="block text-[17px] font-semibold tabular-nums mt-0.5 text-fg-muted">
            {moeda(resultado.totais.pago)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {RECORTES.map((r) => {
          const ativo = r.chave === recorte;
          return (
            <Link
              key={r.chave}
              href={comParam("recorte", r.chave === "abertas" ? undefined : r.chave)}
              aria-current={ativo ? "page" : undefined}
              className={
                ativo
                  ? "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                  : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              {r.rotulo}
            </Link>
          );
        })}

        {competencias.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-2">
            <Link
              href={comParam("competencia", undefined)}
              className={
                !params.competencia
                  ? "h-8 px-2.5 inline-flex items-center rounded-md border border-border-strong text-fg text-[12px]"
                  : "h-8 px-2.5 inline-flex items-center rounded-md border border-border text-fg-muted text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              Todas as competências
            </Link>
            {competencias.slice(0, 6).map((c) => (
              <Link
                key={c}
                href={comParam("competencia", c)}
                className={
                  params.competencia === c
                    ? "h-8 px-2.5 inline-flex items-center rounded-md border border-border-strong text-fg text-[12px] tabular-nums"
                    : "h-8 px-2.5 inline-flex items-center rounded-md border border-border text-fg-muted text-[12px] tabular-nums hover:bg-surface-hover transition-colors"
                }
              >
                {c}
              </Link>
            ))}
          </div>
        )}
      </div>

      <ContasTable
        linhas={resultado.linhas}
        kind={kind}
        filtrado={resultado.totalGeral > 0 && resultado.linhas.length === 0}
        hojeISO={saoPauloParts(agora).dateKey}
      />

      {empresas.length > 0 && params.empresa && (
        <p className="mt-4 text-[12px] text-fg-muted">
          Filtrado por {nomeExibicao(empresas.find((e) => e.id === params.empresa) ?? empresas[0])} ·{" "}
          <Link href={comParam("empresa", undefined)} className="text-brand hover:underline">
            limpar
          </Link>
        </p>
      )}
    </PageContainer>
  );
}
