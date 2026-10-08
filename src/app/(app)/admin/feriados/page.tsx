import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarDays } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { formatCalendarDate } from "@/lib/format";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { NovoFeriado } from "@/components/admin/AddFeriadoForm";
import { ImportFeriadosButton } from "@/components/admin/ImportFeriadosButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { criarFeriado, excluirFeriado, importarFeriadosNacionais } from "./actions";

export default async function FeriadosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const feriados = await prisma.holiday.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { date: "asc" },
  });

  return (
    <PageContainer>
      <PageHeader
        title="Feriados"
        subtitle={<>{feriados.length} feriado{feriados.length !== 1 ? "s" : ""} cadastrado{feriados.length !== 1 ? "s" : ""}</>}
        action={<NovoFeriado action={criarFeriado} />}
      />

      {/* A importação fica no cartão; o cadastro de um feriado é o "+ Novo
          feriado" do cabeçalho, numa janela (escolha 5A, 08/10/2026) — o
          formulário morava aberto aqui, embaixo da importação. */}
      <Card className="p-4 mb-6">
        <ImportFeriadosButton action={importarFeriadosNacionais} />
        <p className="text-helper text-fg-muted mt-1.5">
          Importa só feriados nacionais (via BrasilAPI). Os estaduais e municipais entram um a um,
          em “Novo feriado”.
        </p>
      </Card>

      {feriados.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarDays />}
            title="Nenhum feriado cadastrado"
            description="Importe os feriados nacionais acima, ou cadastre os estaduais e municipais em “Novo feriado”."
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {feriados.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p className="min-w-0 text-fs-3 text-fg">{f.name}</p>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-fs-2 text-fg-muted tnum">{formatCalendarDate(f.date)}</span>
                {/* Excluir no "⋯" (polimento de 30/09): era texto vermelho colado na data. */}
                <AcoesDoItem
                  excluir={{
                    action: excluirFeriado.bind(null, f.id),
                    titulo: `Excluir o feriado "${f.name}"?`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
