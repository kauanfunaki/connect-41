import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ArrowRight, UserPlus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";

const PENDING_EXAM_STATUSES = new Set(["SOLICITADO", "AGENDADO", "REALIZADO", "ASO_PENDENTE"]);

export default async function AdmissoesPage() {
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const prisma = getPrisma();

  const people = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" },
    orderBy: { admissionDate: "asc" },
    include: {
      currentCompany: { select: { name: true } },
      cargo: { select: { name: true } },
      exames: { select: { status: true } },
    },
  });

  const personIds = people.map((p) => p.id);
  const docCounts = personIds.length > 0
    ? await prisma.document.groupBy({
        by: ["entityId"],
        where: { tenantId: ctx.tenantId, entityType: "PERSON", entityId: { in: personIds }, category: "ADMISSAO" },
        _count: { _all: true },
      })
    : [];
  const docCountMap = new Map(docCounts.map((d) => [d.entityId, d._count._all]));

  // Era uma lista de linhas-link sem colunas (até 30/09); virou tabela com
  // funil. O funil de exames filtra pela situação ("pendentes"), e não pelo
  // texto com a contagem — "2 exames pendentes" e "1 exame pendente" são o
  // mesmo recorte para quem está cobrando a clínica.
  const linhas = people.map((p) => {
    const pendingExams = p.exames.filter((e) => PENDING_EXAM_STATUSES.has(e.status)).length;
    const docCount = docCountMap.get(p.id) ?? 0;
    const exames =
      p.exames.length === 0
        ? "Nenhum exame"
        : pendingExams > 0
          ? `${pendingExams} exame${pendingExams !== 1 ? "s" : ""} pendente${pendingExams !== 1 ? "s" : ""}`
          : "Exames concluídos";
    const situacaoDosExames = p.exames.length === 0 ? "Nenhum exame" : pendingExams > 0 ? "Exames pendentes" : "Exames concluídos";
    return {
      id: p.id,
      nome: p.name,
      empresa: p.currentCompany?.name ?? null,
      cargo: p.cargo?.name ?? null,
      exames,
      situacaoDosExames,
      documentos: `${docCount} documento${docCount !== 1 ? "s" : ""}`,
    };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Admissões em andamento"
        subtitle={<>{people.length} colaborador{people.length !== 1 ? "es" : ""} em processo de admissão</>}
      />

      {people.length === 0 ? (
        <Card>
          <EmptyState icon={<UserPlus />} title="Nenhuma admissão em andamento" description="Admissões iniciadas na ficha de cada pessoa aparecem aqui enquanto estiverem em andamento." />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {linhas.map((l) => (
              <Link key={l.id} href={`/pessoas/${l.id}`} className="block">
                <Cartao className="hover:border-brand/40 transition-colors">
                  <TopoDoCartao nome={l.nome} />
                  <InfoDoCartao>{[l.empresa, l.cargo].filter(Boolean).join(" · ") || "Sem empresa/cargo definidos"}</InfoDoCartao>
                  <PeDoCartao>
                    <span className="text-micro text-fg-muted">{l.exames}</span>
                    <span className="ml-auto text-micro text-fg-muted">{l.documentos} de admissão</span>
                  </PeDoCartao>
                </Cartao>
              </Link>
            ))}
          </CartoesNoCelular>

          <TabelaFiltravel
            linhas={linhas.map((l) => ({
              id: l.id,
              valores: { empresa: l.empresa ?? "", cargo: l.cargo ?? "", exames: l.situacaoDosExames },
            }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Colaborador</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Cargo" chave="cargo" />
                    </th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Exames" chave="exames" align="right" />
                    </th>
                    <th className="px-4 py-3">Documentos de admissão</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <Link href={`/pessoas/${l.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {l.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">
                        {l.empresa ? (
                          <span className="block max-w-[240px] truncate" title={l.empresa}>
                            {l.empresa}
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{l.cargo ?? <span className="text-fg-muted">—</span>}</td>
                      <td className={`px-4 py-3 ${l.situacaoDosExames === "Exames pendentes" ? "text-warning-fg" : "text-fg-muted"}`}>
                        {l.exames}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{l.documentos}</td>
                      <td className="px-4 py-3">
                        <Button href={`/pessoas/${l.id}`} variant="secondary" size="xs">
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
