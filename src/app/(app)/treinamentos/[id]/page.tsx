import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { MenuDoRegistro } from "@/components/pessoas/MenuDoRegistro";
import { excluirTreinamento } from "../actions";
import { criarTurma, excluirTurma } from "./actions";
import { AddTurmaForm } from "@/components/treinamentos/AddTurmaForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { formatCalendarDate } from "@/lib/format";

export default async function TreinamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const training = await prisma.training.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      classes: {
        orderBy: { date: "desc" },
        include: { _count: { select: { participants: true } } },
      },
    },
  });
  if (!training) notFound();

  const deleteAction = excluirTreinamento.bind(null, id);
  const criarTurmaAction = criarTurma.bind(null, id);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Treinamentos", href: "/treinamentos" }, { label: training.name, truncate: true }]} />

      {/* Carga horária e ações iam num cabeçalho montado à mão, com "Editar"
          em link com cara de botão (até 30/09); agora é o PageHeader. */}
      <PageHeader
        title={training.name}
        subtitle={training.workloadHours ? <>{training.workloadHours.toString()}h de carga horária</> : undefined}
        action={
          canManage && (
            <div className="flex items-center gap-2">
              <Button href={`/treinamentos/${id}/editar`} variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
              <DeleteButton action={deleteAction} nome={training.name} />
            </div>
          )
        }
      />

      {training.description && (
        <Card className="p-5 mb-4">
          <p className="text-[13px] text-fg whitespace-pre-wrap">{training.description}</p>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">
          Turmas {training.classes.length > 0 && `(${training.classes.length})`}
        </h2>

        {training.classes.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma turma criada ainda.</p>
        ) : (
          // Era uma lista de linhas com a data em link azul e o "Excluir" em
          // texto vermelho (até 30/09). Virou tabela com funil; a exclusão foi
          // para o "⋯", com o diálogo certo — o de antes falava em "campo".
          <TabelaFiltravel
            linhas={training.classes.map((c) => ({
              id: c.id,
              valores: {
                data: c.date.toISOString().slice(0, 10),
                turno: c.shift ?? "",
                instrutor: c.instructor ?? "",
              },
            }))}
          >
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border mb-4">
              <table className="w-full min-w-[640px] text-[length:var(--fs-ui)]">
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Data" chave="data" tipo="data" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Turno" chave="turno" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Instrutor" chave="instrutor" align="right" />
                    </th>
                    <th className="px-4 py-3">Participantes</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {training.classes.map((c) => (
                    <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/treinamentos/${id}/turmas/${c.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {formatCalendarDate(c.date)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{c.shift ?? <span className="text-fg-muted">—</span>}</td>
                      <td className="px-4 py-3 text-fg-secondary">{c.instructor ?? <span className="text-fg-muted">—</span>}</td>
                      <td className="px-4 py-3 text-fg-muted">
                        {c._count.participants} participante{c._count.participants !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button href={`/treinamentos/${id}/turmas/${c.id}`} variant="secondary" size="xs">
                            Abrir <ArrowRight size={11} />
                          </Button>
                          {canManage && (
                            <MenuDoRegistro
                              rotulo="Excluir"
                              titulo={`Excluir a turma de ${formatCalendarDate(c.date)}?`}
                              descricao="Os participantes da turma saem junto."
                              onRemover={excluirTurma.bind(null, id, c.id)}
                            />
                          )}
                        </div>
                      </td>
                    </LinhaFiltravel>
                  ))}
                </tbody>
              </table>
            </div>
          </TabelaFiltravel>
        )}

        {canManage && <AddTurmaForm action={criarTurmaAction} />}
      </Card>
    </PageContainer>
  );
}
