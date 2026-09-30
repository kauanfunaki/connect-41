import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { FileQuestion } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { AcoesDoModelo } from "@/components/teste/AcoesDoModelo";
import { setorDoModulo } from "@/lib/modules";

function seloDoModelo(ativo: boolean) {
  return ativo ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success border border-success/25">
      Ativo
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-fg-muted border border-border">
      Arquivado
    </span>
  );
}

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "recrutamento";
const MODULE = "recrutamento_testes";

export default async function TemplatesPage() {
  const ctx = await getAuthContext();
  if (!canManageSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();

  const prisma = getPrisma();
  const templates = await prisma.assessmentTemplate.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: SECTOR },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { questions: true, links: true } } },
  });

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/testes" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Testes
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Modelos</span>
      </div>

      <PageHeader
        title="Modelos de teste"
        subtitle={<>{templates.length} modelo{templates.length !== 1 ? "s" : ""} — testes de múltipla escolha reutilizáveis (Português, Matemática...)</>}
        action={<><Button
          href="/testes/templates/novo"
          variant="primary" className="font-medium"
        >
          + Novo modelo
        </Button></>}
      />
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileQuestion />}
            title="Nenhum modelo cadastrado"
            description="Crie um modelo de teste (ex: Português Básico) pra reaproveitar em vários candidatos."
            action={
              <Button
                href="/testes/templates/novo"
                variant="primary" className="font-medium"
              >
                + Novo modelo
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <CartoesNoCelular>
            {templates.map((t) => (
              <Cartao key={t.id}>
                <TopoDoCartao nome={t.name} />
                <InfoDoCartao>
                  {t._count.questions} pergunta{t._count.questions !== 1 ? "s" : ""} · usado {t._count.links} vez{t._count.links !== 1 ? "es" : ""}
                </InfoDoCartao>
                <PeDoCartao>
                  {seloDoModelo(t.active)}
                  <span className="ml-auto">
                    <AcoesDoModelo id={t.id} nome={t.name} ativo={t.active} podeExcluir={t._count.links === 0} />
                  </span>
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          {/* Era uma lista com as ações em texto solto (até 30/09). Virou
              tabela no padrão do Connect, com o funil de situação; a lista
              inteira já vem do servidor, então o funil filtra no navegador. */}
          <TabelaFiltravel
            linhas={templates.map((t) => ({ id: t.id, valores: { situacao: t.active ? "Ativo" : "Arquivado" } }))}
          >
            <TabelaNoDesktop padrao>
              <table className="w-full table-fixed min-w-[720px] text-[length:var(--fs-ui)]">
                <colgroup>
                  <col />
                  <col className="w-[120px]" />
                  <col className="w-[120px]" />
                  <col className="w-[130px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Modelo</th>
                    <th className="px-4 py-3">Perguntas</th>
                    <th className="px-4 py-3">Usado</th>
                    <th className="px-4 py-3">
                      <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <LinhaFiltravel key={t.id} id={t.id} className="border-b border-border">
                      <td className="px-4 py-3 min-w-0">
                        <Link
                          href={`/testes/templates/${t.id}/editar`}
                          className="block font-semibold text-fg hover:text-brand transition-colors truncate"
                          title={t.name}
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{t._count.questions}</td>
                      <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">
                        {t._count.links} vez{t._count.links !== 1 ? "es" : ""}
                      </td>
                      <td className="px-4 py-3">{seloDoModelo(t.active)}</td>
                      <td className="px-4 py-3">
                        <AcoesDoModelo id={t.id} nome={t.name} ativo={t.active} podeExcluir={t._count.links === 0} />
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
