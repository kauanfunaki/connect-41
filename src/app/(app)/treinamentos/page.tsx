import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRight, GraduationCap, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { horasDoDP } from "@/components/pessoas/rotulosDoDP";

export default async function TreinamentosPage() {
  const { ctx, setor } = await abrirTelaDoModulo("dp_treinamentos");
  const canManage = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const treinamentos = await prisma.training.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    include: { _count: { select: { classes: true } } },
  });

  // O texto exibido é o mesmo que vai para o funil: "12 meses" filtra os de
  // reciclagem anual, "Sem validade" os que não vencem.
  const linhas = treinamentos.map((t) => ({
    id: t.id,
    nome: t.name,
    carga: t.workloadHours ? horasDoDP(t.workloadHours) : "",
    validade:
      t.validityMonths != null && t.validityMonths > 0
        ? `${t.validityMonths} ${t.validityMonths === 1 ? "mês" : "meses"}`
        : "Sem validade",
    turmas: `${t._count.classes} turma${t._count.classes !== 1 ? "s" : ""}`,
  }));

  const novo = canManage && (
    <Button href="/treinamentos/novo" variant="primary">
      <Plus size={14} />
      Novo treinamento
    </Button>
  );

  return (
    <PageContainer>
      <PageHeader
        title="Treinamentos"
        subtitle={<>{treinamentos.length} treinamento{treinamentos.length !== 1 ? "s" : ""} cadastrado{treinamentos.length !== 1 ? "s" : ""}</>}
        action={novo || undefined}
      />
      {treinamentos.length === 0 ? (
        <Card>
          {/* Sem repetir o botão de criar: ele mora no cabeçalho (5A, 08/10/2026). */}
          <EmptyState
            icon={<GraduationCap />}
            title="Nenhum treinamento cadastrado"
            description="Cadastre treinamentos e organize turmas para os colaboradores."
          />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {linhas.map((l) => (
              <Link key={l.id} href={`/treinamentos/${l.id}`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={l.nome} valor={l.turmas} />
                  <InfoDoCartao>{[l.carga && `${l.carga} de carga horária`, l.validade].filter(Boolean).join(" · ")}</InfoDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista de linhas-link (até 30/09); virou tabela com funil. */}
          <TabelaFiltravel linhas={linhas.map((l) => ({ id: l.id, valores: { carga: l.carga, validade: l.validade } }))}>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Treinamento</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Carga horária" chave="carga" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Validade" chave="validade" align="right" />
                    </th>
                    <th className="px-4 py-3">Turmas</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/treinamentos/${l.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {l.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{l.carga || <span className="text-fg-muted">—</span>}</td>
                      <td className="px-4 py-3 text-fg-secondary">{l.validade}</td>
                      <td className="px-4 py-3 text-fg-muted">{l.turmas}</td>
                      <td className="px-4 py-3">
                        <Button href={`/treinamentos/${l.id}`} variant="secondary" size="xs">
                          Abrir <ArrowRight size={11} />
                        </Button>
                      </td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </TabelaFiltravel>
        </>
      )}
    </PageContainer>
  );
}
