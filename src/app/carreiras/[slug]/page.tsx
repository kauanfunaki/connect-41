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
import { EtiquetasDaVaga } from "@/components/carreiras/EtiquetasDaVaga";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

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
        <header className="mb-8 text-center">
          {tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={tenant.name} className="h-12 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Trabalhe Conosco</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            Vagas abertas — {tenant.name}
          </p>
        </header>

        {todas.length > 0 && (
          // GET puro: a busca vira URL, funciona sem JavaScript e pode ser
          // compartilhada como link (vagas remotas em Curitiba, por exemplo).
          <form method="get" className="bg-surface border border-border rounded-lg p-4 mb-5 space-y-3" role="search">
            <label htmlFor="q" className="sr-only">Buscar vaga</label>
            <Input id="q" name="q" type="search" defaultValue={filtros.busca} placeholder="Buscar por cargo, área ou palavra-chave" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Filtro nome="cidade" rotulo="Cidade" valor={filtros.cidade} opcoes={opcoes.cidades.map((c) => [c, c])} />
              <Filtro nome="area" rotulo="Área" valor={filtros.area} opcoes={opcoes.areas.map((a) => [a, a])} />
              <Filtro nome="modalidade" rotulo="Modalidade" valor={filtros.modalidade} opcoes={opcoes.modalidades.map((m) => [m, MODALIDADE_LABEL[m]])} />
              <Filtro nome="contrato" rotulo="Contrato" valor={filtros.contrato} opcoes={opcoes.contratos.map((c) => [c, CONTRATO_LABEL[c]])} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-fg-muted tabular-nums">
                {filtradas.length === 1 ? "1 vaga" : `${filtradas.length} vagas`}
                {filtrando && ` de ${todas.length}`}
              </p>
              <div className="flex items-center gap-3">
                {filtrando && (
                  <Link href={`/carreiras/${slug}`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
                    Limpar filtros
                  </Link>
                )}
                <Button type="submit" variant="primary" size="sm">
                  Buscar
                </Button>
              </div>
            </div>
          </form>
        )}

        {todas.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-[14px] text-fg">Nenhuma vaga aberta no momento.</p>
            <p className="text-[12px] text-fg-muted mt-1">Volte em breve — novas oportunidades aparecem aqui.</p>
          </div>
        ) : vagas.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-[14px] text-fg">Nenhuma vaga com esses filtros.</p>
            <Link href={`/carreiras/${slug}`} className="text-[12px] text-brand hover:underline mt-1 inline-block">
              Ver todas as {todas.length} vagas abertas
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {vagas.map((v) => {
              const local = [v.cidade, v.uf].filter(Boolean).join(" – ");
              return (
                <Link
                  key={v.id}
                  href={`/carreiras/${slug}/${v.id}`}
                  className="block bg-surface border border-border rounded-lg p-5 hover:border-border-strong hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-fg">{v.title}</h2>
                      <p className="text-[12px] text-fg-muted mt-0.5">
                        {v.empresa}
                        {local && ` · ${local}`}
                        {v.area && ` · ${v.area}`}
                      </p>
                    </div>
                    {v.quantity > 1 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-brand/10 text-brand border-brand/25 flex-shrink-0">
                        {v.quantity} vagas
                      </span>
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
                    <p className="text-[12.5px] text-fg-muted mt-2 line-clamp-2">{v.publicDescription}</p>
                  )}
                  <p className="text-[11px] text-fg-muted mt-2">
                    Publicada em {formatCalendarDate(v.openedAt)}
                    {v.applicationDeadline && ` · inscrições até ${formatCalendarDate(v.applicationDeadline)}`}
                  </p>
                </Link>
              );
            })}
            {totalDePaginas > 1 && (
              <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Páginas">
                {pagina > 1 ? (
                  <Link href={urlDaLista(slug, filtros, pagina - 1)} className="text-[13px] text-brand hover:underline">
                    ← Anteriores
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-[12px] text-fg-muted tabular-nums">
                  Página {pagina} de {totalDePaginas}
                </span>
                {pagina < totalDePaginas ? (
                  <Link href={urlDaLista(slug, filtros, pagina + 1)} className="text-[13px] text-brand hover:underline">
                    Próximas →
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Um filtro de lista. Sem opção, fica desabilitado em vez de sumir — o layout não pula. */
function Filtro({ nome, rotulo, valor, opcoes }: { nome: string; rotulo: string; valor: string; opcoes: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
      {rotulo}
      <Select name={nome} defaultValue={valor} disabled={opcoes.length === 0}>
        <option value="">Todas</option>
        {opcoes.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </Select>
    </label>
  );
}
