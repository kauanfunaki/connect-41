import Link from "next/link";
import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { ToggleCategoriaButton } from "@/components/admin/ToggleCategoriaButton";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { alternarCategoria } from "./actions";

const LADOS = [
  { kind: "PAGAR" as const, titulo: "Contas a pagar", nota: "Categoria é obrigatória no lançamento" },
  { kind: "RECEBER" as const, titulo: "Contas a receber", nota: "Categoria é opcional no lançamento" },
];

export default async function PlanoDeContasPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const categorias = await prisma.financeCategory.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ kind: "asc" }, { dreGroup: "asc" }, { name: "asc" }],
  });

  const ativasParaPagar = categorias.filter((c) => c.kind === "PAGAR" && c.active).length;

  return (
    <PageContainer>
      <PageHeader
        title="Plano de contas"
        subtitle={
          <>
            {categorias.length} categoria{categorias.length !== 1 ? "s" : ""} — é o que classifica
            o lançamento gerado a partir de um documento fiscal
          </>
        }
        action={
          <Button href="/admin/plano-de-contas/novo" variant="primary" className="font-medium">
            + Nova categoria
          </Button>
        }
      />

      {ativasParaPagar === 0 && (
        <Card className="mb-6 border-warning/30 bg-warning/8">
          <div className="px-4 py-3 space-y-1">
            <p className="text-[13px] font-medium text-fg">
              Nenhuma categoria ativa em contas a pagar
            </p>
            <p className="text-[12px] text-fg-muted">
              Enquanto isso, nenhum documento fiscal vira conta a pagar: o lançamento é recusado
              por falta de categoria. Cadastre ao menos uma para destravar o fluxo.
            </p>
          </div>
        </Card>
      )}

      {categorias.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark />}
            title="Plano de contas vazio"
            description="Cadastre as categorias que classificam despesas e receitas. Elas aparecem no dropdown quando um documento fiscal vira lançamento."
            action={
              <Button href="/admin/plano-de-contas/novo" variant="primary" className="font-medium">
                + Nova categoria
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {LADOS.map(({ kind, titulo, nota }) => {
            const doLado = categorias.filter((c) => c.kind === kind);
            return (
              <div key={kind}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-[15px] font-medium text-fg">{titulo}</h2>
                  <span className="text-[12px] text-fg-muted">{nota}</span>
                </div>
                {doLado.length === 0 ? (
                  <p className="text-[13px] text-fg-muted px-4 py-3 bg-surface border border-border rounded-lg">
                    Nenhuma categoria deste lado.
                  </p>
                ) : (
                  <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                    {doLado.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className={`text-[13px] ${c.active ? "text-fg" : "text-fg-muted line-through"}`}>
                            {c.name}
                          </p>
                          {c.dreGroup && (
                            <p className="text-[12px] text-fg-muted truncate">{c.dreGroup}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Link
                            href={`/admin/plano-de-contas/${c.id}/editar`}
                            className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                          >
                            Editar
                          </Link>
                          <ToggleCategoriaButton
                            action={alternarCategoria.bind(null, c.id, !c.active)}
                            ativa={c.active}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
