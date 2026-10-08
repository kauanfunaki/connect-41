import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";
import { publicUrl } from "@/lib/jobPostingSchema";
import {
  CONTRATO_LABEL,
  MODALIDADE_LABEL,
  filtrarVagas,
  lerFiltros,
  localDaVaga,
  opcoesDosFiltros,
  paginar,
  temFiltro,
  urlDaLista,
  whereDoPrazo,
} from "@/lib/carreiras/portal";
import { Briefcase, SearchX, Search, UserRound, X } from "lucide-react";
import { EtiquetasDaVaga } from "@/components/carreiras/EtiquetasDaVaga";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, active: true },
  });
  if (!tenant || !tenant.active) return { title: "Vagas abertas" };

  const title = `Trabalhe Conosco — ${tenant.name}`;
  const description = `Confira as vagas abertas na ${tenant.name} e candidate-se online.`;
  const url = publicUrl(`/carreiras/${slug}`);

  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: { type: "website", title, description, ...(url ? { url } : {}), siteName: title, locale: "pt_BR" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CarreirasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const busca = await searchParams;
  const filtros = lerFiltros(busca);
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  const abertas = await prisma.vaga.findMany({
    // Prazo vencido sai da lista sozinho — ver `whereDoPrazo`.
    where: { tenantId: tenant.id, isPublic: true, status: "ABERTA", ...whereDoPrazo(new Date()) },
    select: {
      id: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      applicationDeadline: true,
      workCity: true,
      workStateCode: true,
      salaryMin: true,
      salaryMax: true,
      showSalary: true,
      workMode: true,
      contractType: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
      cargo: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  const todas = abertas.map((v) => ({
    ...v,
    empresa: v.company.tradeName || v.company.name,
    ...localDaVaga(v),
    area: v.cargo?.name ?? null,
    salaryMin: v.salaryMin === null ? null : v.salaryMin.toNumber(),
    salaryMax: v.salaryMax === null ? null : v.salaryMax.toNumber(),
  }));
  const filtradas = filtrarVagas(todas, filtros);
  const { itens: vagas, pagina, totalDePaginas } = paginar(filtradas, busca.pagina);
  const opcoes = opcoesDosFiltros(todas);
  const filtrando = temFiltro(filtros);

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <CabecalhoPublico
          centralizado
          className="mb-8"
          logo={tenant.logoUrl ? { src: tenant.logoUrl, alt: tenant.name } : null}
          titulo="Trabalhe Conosco"
          subtitulo={<>Vagas abertas — {tenant.name}</>}
        >
          {/* Botão, e não link de texto (30/09): é a porta de entrada da conta
              do candidato. */}
          <Button href={`/carreiras/${slug}/minha-conta`} variant="secondary" size="sm" className="mt-3">
            <UserRound size={13} /> Já se candidatou? Acompanhe suas candidaturas
          </Button>
        </CabecalhoPublico>

        {todas.length > 0 && (
          <Card className="p-4 mb-5 space-y-3">
            <div className="flex flex-wrap items-start gap-2">
              {/* A busca por texto fica fora do "Filtros", num GET puro: vira
                  URL, funciona sem JavaScript e pode ser compartilhada como
                  link. Os filtros escolhidos vão junto, escondidos — senão
                  buscar apagava a cidade escolhida. */}
              <form method="get" role="search" className="flex flex-1 min-w-[16rem] items-center gap-2">
                <label htmlFor="q" className="sr-only">Buscar vaga</label>
                <Input id="q" name="q" type="search" defaultValue={filtros.busca} placeholder="Buscar por cargo, área ou palavra-chave" />
                {(["cidade", "area", "modalidade", "contrato"] as const).map((k) =>
                  filtros[k] ? <input key={k} type="hidden" name={k} value={filtros[k]} /> : null
                )}
                <Button type="submit" variant="primary">
                  <Search size={14} /> Buscar
                </Button>
              </form>
              {/* Cidade, área, modalidade e contrato no botão "Filtros" — eram
                  quatro selects numa grade dentro do formulário (conferência
                  de 30/09). Cada escolha navega na hora e preserva a busca. */}
              <FiltrosDaTela
                campos={[
                  { chave: "cidade", rotulo: "Cidade", vazioLabel: "Todas", opcoes: opcoes.cidades.map((c) => ({ value: c, label: c })) },
                  { chave: "area", rotulo: "Área", vazioLabel: "Todas", opcoes: opcoes.areas.map((a) => ({ value: a, label: a })) },
                  {
                    chave: "modalidade",
                    rotulo: "Modalidade",
                    vazioLabel: "Todas",
                    opcoes: opcoes.modalidades.map((m) => ({ value: m, label: MODALIDADE_LABEL[m] })),
                  },
                  {
                    chave: "contrato",
                    rotulo: "Contrato",
                    vazioLabel: "Todos",
                    opcoes: opcoes.contratos.map((c) => ({ value: c, label: CONTRATO_LABEL[c] })),
                  },
                ].filter((c) => c.opcoes.length > 0)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-fs-2 text-fg-muted tabular-nums">
                {filtradas.length === 1 ? "1 vaga" : `${filtradas.length} vagas`}
                {filtrando && ` de ${todas.length}`}
              </p>
              {filtrando && (
                <Button href={`/carreiras/${slug}`} variant="ghost" size="xs">
                  <X size={11} /> Limpar filtros
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Os vazios no `EmptyState` do app, dentro de cartão — eram caixas
            montadas à mão (auditoria DRG-28, 07/10/2026). Mesmo texto. */}
        {todas.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Briefcase />}
              title="Nenhuma vaga aberta no momento."
              description="Volte em breve — novas oportunidades aparecem aqui."
            />
          </Card>
        ) : vagas.length === 0 ? (
          <Card>
            <EmptyState
              icon={<SearchX />}
              title="Nenhuma vaga com esses filtros."
              action={
                <Button href={`/carreiras/${slug}`} variant="secondary" size="sm">
                  Ver todas as {todas.length} vagas abertas
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {vagas.map((v) => {
              const local = [v.cidade, v.uf].filter(Boolean).join(" – ");
              return (
                // O `Card` com o link por dentro — era o cartão escrito à mão
                // no próprio link (auditoria DRG-08, 07/10/2026).
                <Card key={v.id} className="hover:border-border-strong hover:bg-surface-hover transition-colors">
                  <Link href={`/carreiras/${slug}/${v.id}`} className="block p-5 rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-body font-semibold text-fg">{v.title}</h2>
                        <p className="text-fs-2 text-fg-muted mt-0.5">
                          {v.empresa}
                          {local && ` · ${local}`}
                          {v.area && ` · ${v.area}`}
                        </p>
                      </div>
                      {/* O selo do app — era uma pílula à mão de 10px (DRG-06). */}
                      {v.quantity > 1 && (
                        <Selo tom="marca" className="flex-shrink-0">
                          {v.quantity} vagas
                        </Selo>
                      )}
                    </div>
                    <div className="mt-2.5">
                      <EtiquetasDaVaga
                        workMode={v.workMode}
                        contractType={v.contractType}
                        salaryMin={v.salaryMin}
                        salaryMax={v.salaryMax}
                        showSalary={v.showSalary}
                      />
                    </div>
                    {v.publicDescription && (
                      <p className="text-fs-2 text-fg-muted mt-2 line-clamp-2">{v.publicDescription}</p>
                    )}
                    <p className="text-micro text-fg-muted mt-2">
                      Publicada em {formatCalendarDate(v.openedAt)}
                      {v.applicationDeadline && ` · inscrições até ${formatCalendarDate(v.applicationDeadline)}`}
                    </p>
                  </Link>
                </Card>
              );
            })}
            {/* A paginação do app, em botões — era uma cópia local em texto
                azul (30/09). */}
            <Pagination
              page={pagina}
              totalPages={totalDePaginas}
              buildHref={(p) => urlDaLista(slug, filtros, p)}
              total={filtradas.length}
              rotulo="vagas"
            />
          </div>
        )}
      </div>
    </div>
  );
}
