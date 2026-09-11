import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { listarFila, contarPorSituacao, feriadosDoTenant } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { ProcessosFila, SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { NovoProcessoForm } from "@/components/societario/NovoProcessoForm";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { abrirProcesso } from "./actions";

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

// A ordem do recorte é a da fila: o que depende de gente primeiro.
const RECORTES: { chave: string; situacao?: SituacaoDoProcesso }[] = [
  { chave: "todos" },
  { chave: "exigencia", situacao: "EM_EXIGENCIA" },
  { chave: "orgao", situacao: "AGUARDANDO_ORGAO" },
  { chave: "andamento", situacao: "EM_ANDAMENTO" },
];

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  // Gate de módulo além do gate de setor: o módulo é vendido por plano, e quem
  // é do societário num tenant que não contratou não deve ver a tela.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.situacao) ?? RECORTES[0];

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const agora = new Date();
  const prisma = getPrisma();

  const [empresas, tipos] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.processType.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true },
    }),
  ]);

  // A fila inteira vem sempre: os contadores do recorte precisam do total, e
  // uma segunda consulta só para contar discordaria da primeira no instante em
  // que alguém gravasse algo entre as duas.
  const todas = await listarFila(ctx.tenantId, {}, feriados, agora);
  const contagem = contarPorSituacao(todas);
  const linhas = recorte.situacao ? todas.filter((l) => l.situacao === recorte.situacao) : todas;

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <PageHeader title="Processos" />
          <p className="text-[13px] text-fg-muted mt-1">
            Constituição, alteração contratual, baixa e alvarás — com protocolo, exigência e prazo.
          </p>
        </div>
        <NovoProcessoForm
          empresas={empresas.map((e) => ({ value: e.id, label: nomeExibicao(e) }))}
          tipos={tipos.map((t) => ({
            id: t.id,
            name: t.name,
            // O prazo entra no rótulo porque é o que diferencia Constituição de
            // Alteração na hora de escolher — as duas têm o mesmo roteiro.
            prazo: t.variableFlow
              ? "fluxo variável"
              : t.expectedDaysMin === t.expectedDaysMax
                ? `${t.expectedDaysMax} dias úteis`
                : `${t.expectedDaysMin}–${t.expectedDaysMax} dias úteis`,
          }))}
          abrirAction={abrirProcesso}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {RECORTES.map((r) => {
          const ativo = r.chave === recorte.chave;
          const total = r.situacao ? contagem[r.situacao] : todas.length;
          const rotulo = r.situacao ? SITUACAO_LABEL[r.situacao] : "Todos";
          return (
            <Link
              key={r.chave}
              href={r.chave === "todos" ? "/processos" : `/processos?situacao=${r.chave}`}
              aria-current={ativo ? "page" : undefined}
              className={
                ativo
                  ? "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                  : "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              {rotulo}
              <span className="tabular-nums text-fg-muted">{total}</span>
            </Link>
          );
        })}
      </div>

      <ProcessosFila linhas={linhas} filtrado={todas.length > 0 && linhas.length === 0} />
    </PageContainer>
  );
}
