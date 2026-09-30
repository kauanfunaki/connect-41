import { notFound } from "next/navigation";
import { Landmark } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";
import { StatusDot } from "@/components/shared/StatusDot";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { CarregarPlanoPadrao } from "@/components/admin/CarregarPlanoPadrao";
import { GRUPOS } from "@/lib/dre/estrutura";
import { grupoDeTexto } from "@/lib/dre/mapeamento";
import { alternarCategoria } from "./actions";

/** A linha da DRE pelo nome que a tela mostra; texto que não é grupo conhecido aparece como está. */
function linhaDaDre(dreGroup: string): string {
  return GRUPOS.find((g) => g.code === grupoDeTexto(dreGroup))?.label ?? dreGroup;
}

const LADOS = [
  { kind: "PAGAR" as const, titulo: "Contas a pagar", nota: "Categoria é obrigatória no lançamento" },
  { kind: "RECEBER" as const, titulo: "Contas a receber", nota: "Categoria é opcional no lançamento" },
];

export default async function PlanoDeContasPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  // Só o padrão do escritório. As categorias de cada empresa (criadas no plano
  // dela ou trazidas do Omie) ficam em Fornecedores e sacados › Plano de contas.
  const categorias = await prisma.financeCategory.findMany({
    where: { tenantId: ctx.tenantId, companyId: null },
    orderBy: [{ kind: "asc" }, { planGroup: "asc" }, { name: "asc" }],
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
          <div className="flex flex-wrap items-center gap-2">
            <CarregarPlanoPadrao />
            <Button href="/admin/plano-de-contas/novo" variant="primary" className="font-medium">
              + Nova categoria
            </Button>
          </div>
        }
      />
      <p className="text-[12px] text-fg-muted -mt-2 mb-4 max-w-3xl">
        Este é o plano padrão do escritório, que toda empresa herda. Cada empresa ajusta o dela — categoria própria, o que não
        usa escondido, outra linha da DRE — em Fornecedores e sacados › Plano de contas.
      </p>

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
                  <p className="text-[13px] text-fg-muted px-4 py-3 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)]">
                    Nenhuma categoria deste lado.
                  </p>
                ) : (
                  <>
                    <CartoesNoCelular>
                      {doLado.map((c) => (
                        <Cartao key={c.id}>
                          <TopoDoCartao nome={<span className={c.active ? "" : "text-fg-muted line-through"}>{c.name}</span>} />
                          {c.planGroup && <InfoDoCartao>{c.planGroup}</InfoDoCartao>}
                          {c.dreGroup && <InfoDoCartao>DRE: {linhaDaDre(c.dreGroup)}</InfoDoCartao>}
                          <PeDoCartao>
                            <StatusDot
                              color={c.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                              label={c.active ? "Ativa" : "Inativa"}
                            />
                            <AcoesDeLinha
                              className="ml-auto"
                              foraDeOperacao={!c.active}
                              onToggle={alternarCategoria.bind(null, c.id, !c.active)}
                              editarHref={`/admin/plano-de-contas/${c.id}/editar`}
                            />
                          </PeDoCartao>
                        </Cartao>
                      ))}
                    </CartoesNoCelular>

                    {/* Era uma lista com grupo e linha da DRE numa linha cinza.
                        Com as 189 categorias do plano padrão, virou tabela no
                        casco padrão com funil em grupo, DRE e situação
                        (polimento de 30/09). Editar é botão; desativar foi
                        para o "⋯". Continua sem excluir, de propósito: a FK
                        dos lançamentos é `ON DELETE SET NULL`, e apagar
                        desclassificaria os lançamentos antigos. */}
                    <TabelaFiltravel
                      linhas={doLado.map((c) => ({
                        id: c.id,
                        valores: {
                          grupo: c.planGroup ?? "",
                          dre: c.dreGroup ? linhaDaDre(c.dreGroup) : "",
                          situacao: c.active ? "Ativa" : "Inativa",
                        },
                      }))}
                    >
                      <TabelaNoDesktop padrao>
                        <table className="w-full min-w-[820px] text-[13px]">
                          <thead>
                            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-muted">
                              <th className="px-4 py-3">Categoria</th>
                              <th className="px-4 py-3">
                                <FiltroDaColuna rotulo="Grupo" chave="grupo" />
                              </th>
                              <th className="px-4 py-3">
                                <FiltroDaColuna rotulo="Linha da DRE" chave="dre" />
                              </th>
                              <th className="px-4 py-3">
                                <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                              </th>
                              <th className="px-4 py-3">
                                <span className="sr-only">Ações</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {doLado.map((c) => (
                              <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border">
                                <td className="px-4 py-3">
                                  <span
                                    className={`block max-w-[280px] truncate ${c.active ? "text-fg" : "text-fg-muted line-through"}`}
                                    title={c.name}
                                  >
                                    {c.name}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  {c.planGroup ? (
                                    <span className="block max-w-[240px] truncate text-fg-secondary" title={c.planGroup}>
                                      {c.planGroup}
                                    </span>
                                  ) : (
                                    <span className="text-fg-muted">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-fg-secondary">
                                  {c.dreGroup ? linhaDaDre(c.dreGroup) : <span className="text-fg-muted">—</span>}
                                </td>
                                <td className="px-4 py-3">
                                  <StatusDot
                                    color={c.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                                    label={c.active ? "Ativa" : "Inativa"}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <AcoesDeLinha
                                    foraDeOperacao={!c.active}
                                    onToggle={alternarCategoria.bind(null, c.id, !c.active)}
                                    editarHref={`/admin/plano-de-contas/${c.id}/editar`}
                                  />
                                </td>
                              </LinhaFiltravel>
                            ))}
                          </tbody>
                        </table>
                      </TabelaNoDesktop>
                    </TabelaFiltravel>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
