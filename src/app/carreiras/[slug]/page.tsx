import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";
import {
  CONTRATO_LABEL,
  MODALIDADE_LABEL,
  filtrarVagas,
  lerFiltros,
  opcoesDosFiltros,
  paginar,
  temFiltro,
  urlDaListaEm,
} from "@/lib/carreiras/portal";
import { MARCA_41_CARREIRAS, enderecoPublicoDoPortal, imagemDeCompartilhamento } from "@/lib/carreiras/enderecoDeCarreiras";
import { portalDaRequisicao } from "@/lib/carreiras/portalDaRequisicao";
import { metadadosDo41 } from "@/lib/carreiras/metadados41";
import { escritorioDoPortal, vagasAbertasDoPortal } from "@/lib/carreiras/vagasDoPortal";
import { Capa41 } from "@/components/carreiras/41/Capa41";
import { Briefcase, SearchX, Search, UserRound, X } from "lucide-react";
import { EtiquetasDaVaga } from "@/components/carreiras/EtiquetasDaVaga";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { CabecalhoPublico } from "@/components/publico/CabecalhoPublico";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const portal = await portalDaRequisicao(slug);
  if (!portal) return { title: "Página não encontrada", robots: { index: false, follow: false } };
  const url = enderecoPublicoDoPortal(slug, { tipo: "lista" });

  // Da 41, a capa do 41 Carreiras (15/10/2026), com a imagem de
  // compartilhamento e o canônico no endereço principal do portal.
  if (portal.da41) {
    return metadadosDo41({
      titulo: `${MARCA_41_CARREIRAS.nome} — vagas abertas`,
      descricao: `Vagas em empresas cujos processos seletivos são conduzidos pela ${MARCA_41_CARREIRAS.recrutamento}. Encontre a sua e candidate-se pelo site, em poucos minutos.`,
      url,
      imagem: imagemDeCompartilhamento(slug, null),
      imagemAlt: `${MARCA_41_CARREIRAS.nome}: vagas abertas`,
    });
  }

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, active: true },
  });
  if (!tenant || !tenant.active) return { title: "Vagas abertas" };

  const title = `Trabalhe conosco — ${tenant.name}`;
  const description = `Confira as vagas abertas na ${tenant.name} e candidate-se online.`;

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

  // No endereço do 41 Carreiras só existe o escritório da 41.
  const portal = await portalDaRequisicao(slug);
  if (!portal) notFound();
  const { rotas } = portal;

  const tenant = await escritorioDoPortal(slug);
  if (!tenant) notFound();

  const agora = new Date();
  const todas = await vagasAbertasDoPortal(tenant.id, agora);

  // Da 41: a capa do 41 Carreiras (15/10/2026). A lista com busca e filtros
  // mudou para `/vagas`; um link antigo da capa com filtros vai para lá.
  if (portal.da41) {
    if (temFiltro(filtros) || busca.pagina) redirect(urlDaListaEm(rotas.vagas, filtros));
    return <Capa41 slug={slug} rotas={rotas} vagas={todas} agora={agora} />;
  }

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
          titulo="Trabalhe conosco"
          subtitulo={<>Vagas abertas — {tenant.name}</>}
        >
          {/* Botão, e não link de texto (30/09): é a porta de entrada da conta
              do candidato. */}
          <Button href={rotas.conta} variant="secondary" size="sm" className="mt-3">
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
                <CampoDeBusca id="q" name="q" defaultValue={filtros.busca} placeholder="Buscar por cargo, área ou palavra-chave" />
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
                <Button href={rotas.lista} variant="ghost" size="xs">
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
                <Button href={rotas.lista} variant="secondary" size="sm">
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
                // O cartão-atalho do app (`Card href`, 15/10/2026): borda azul,
                // sobe 2px — era o `Card` com o link por dentro e um hover
                // cinza próprio (antes, auditoria DRG-08, o cartão à mão).
                <Card key={v.id} href={rotas.vaga(v.id)} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-card-title font-semibold text-fg">{v.title}</h2>
                      <p className="text-fs-2 text-fg-muted mt-0.5">
                        {v.empresa}
                        {local && ` · ${local}`}
                        {v.area && ` · ${v.area}`}
                      </p>
                    </div>
                    {/* Categoria da vaga, no `Badge` como as etiquetas de baixo
                        (escolha 2A, 08/10/2026) — era uma pílula à mão de 10px. */}
                    {v.quantity > 1 && (
                      <Badge variant="info" className="flex-shrink-0">
                        {v.quantity} vagas
                      </Badge>
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
                </Card>
              );
            })}
            {/* A paginação do app, em botões — era uma cópia local em texto
                azul (30/09). */}
            <Pagination
              page={pagina}
              totalPages={totalDePaginas}
              buildHref={(p) => urlDaListaEm(rotas.lista, filtros, p)}
              total={filtradas.length}
              rotulo="vagas"
            />
          </div>
        )}
      </div>
    </div>
  );
}
