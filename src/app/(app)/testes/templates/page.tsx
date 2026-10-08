import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { FileQuestion, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { EmptyState } from "@/components/ui/EmptyState";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { AcoesDoModelo } from "@/components/teste/AcoesDoModelo";
import { setorDoModulo, isModuleEnabled } from "@/lib/modules";
import { Selo } from "@/components/ui/Selo";

function seloDoModelo(ativo: boolean) {
  return ativo ? (
    <Selo tom="sucesso">
      Ativo
    </Selo>
  ) : (
    <Selo tom="neutro">
      Arquivado
    </Selo>
  );
}

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "recrutamento";
const MODULE = "recrutamento_testes";

export default async function TemplatesPage() {
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  if (!canManageSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();

  const prisma = getPrisma();
  const templates = await prisma.assessmentTemplate.findMany({
    where: { tenantId: ctx.tenantId, sectorCode: SECTOR },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { questions: true, links: true } } },
  });

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Testes", href: "/testes" }, { label: "Modelos" }]} />

      <PageHeader
        title="Modelos de teste"
        subtitle={<>{templates.length} modelo{templates.length !== 1 ? "s" : ""} — testes de múltipla escolha reutilizáveis (Português, Matemática...)</>}
        action={
          // Ícone no lugar do "+" escrito (DRG-17, 07/10/2026).
          <Button href="/testes/templates/novo" variant="primary">
            <Plus size={14} />
            Novo modelo
          </Button>
        }
      />
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileQuestion />}
            title="Nenhum modelo cadastrado"
            description="Crie um modelo de teste (ex: Português Básico) pra reaproveitar em vários candidatos."
            action={
              <Button href="/testes/templates/novo" variant="primary">
                <Plus size={14} />
                Novo modelo
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
              <table className="w-full table-fixed min-w-[720px]">
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
