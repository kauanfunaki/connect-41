import { Briefcase, SearchX, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { formatCalendarDate } from "@/lib/format";
import { MARCA_41_CARREIRAS, type RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import {
  CONTRATO_LABEL,
  MODALIDADE_LABEL,
  opcoesDosFiltros,
  publicadaHa,
  temFiltro,
  urlDaListaEm,
  type FiltrosDoPortal,
} from "@/lib/carreiras/portal";
import type { VagaAberta } from "@/lib/carreiras/vagasDoPortal";
import { BuscaDoPortal, type CampoDaBusca } from "./BuscaDoPortal";
import { EtiquetasDaVaga } from "./EtiquetasDaVaga";
import { MolduraDe41Carreiras } from "./MolduraDe41Carreiras";

/**
 * O hub do 41 Carreiras (14/10/2026): a página inicial do endereço próprio
 * (e a lista do escritório da 41 no endereço do Connect). Todas as vagas
 * abertas e públicas da 41 — que são das empresas clientes —, com busca e
 * filtros na URL.
 */
export function HubDe41Carreiras({
  logo,
  rotas,
  todas,
  vagas,
  filtradas,
  filtros,
  pagina,
  totalDePaginas,
  agora,
}: {
  logo: string | null;
  rotas: RotasDoPortal;
  /** Todas as vagas abertas (para as opções dos filtros e o total). */
  todas: VagaAberta[];
  /** As da página atual, já filtradas. */
  vagas: VagaAberta[];
  /** Quantas passaram nos filtros. */
  filtradas: number;
  filtros: FiltrosDoPortal;
  pagina: number;
  totalDePaginas: number;
  agora: Date;
}) {
  const opcoes = opcoesDosFiltros(todas);
  const filtrando = temFiltro(filtros);

  // Um filtro com uma opção só não separa nada: aparece só se já estiver
  // escolhido (para dar como tirar).
  const campos: CampoDaBusca[] = (
    [
      { chave: "cidade", rotulo: "Cidade", vazio: "Todas", valor: filtros.cidade, opcoes: opcoes.cidades.map((c) => ({ value: c, label: c })) },
      { chave: "uf", rotulo: "Estado", vazio: "Todos", valor: filtros.uf, opcoes: opcoes.ufs.map((u) => ({ value: u, label: u })) },
      {
        chave: "modalidade",
        rotulo: "Modelo",
        vazio: "Todos",
        valor: filtros.modalidade,
        opcoes: opcoes.modalidades.map((m) => ({ value: m, label: MODALIDADE_LABEL[m] })),
      },
      {
        chave: "contrato",
        rotulo: "Contrato",
        vazio: "Todos",
        valor: filtros.contrato,
        opcoes: opcoes.contratos.map((c) => ({ value: c, label: CONTRATO_LABEL[c] })),
      },
      { chave: "area", rotulo: "Área", vazio: "Todas", valor: filtros.area, opcoes: opcoes.areas.map((a) => ({ value: a, label: a })) },
    ] satisfies CampoDaBusca[]
  ).filter((c) => c.opcoes.length > 1 || c.valor !== "");

  return (
    <MolduraDe41Carreiras logo={logo} inicio={rotas.lista} conta={rotas.conta}>
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <h1 className="text-title font-semibold tracking-[-0.01em] text-fg">Vagas abertas</h1>
          <p className="mt-1.5 max-w-[40em] text-ui leading-relaxed text-fg-muted">
            Oportunidades em empresas clientes da {MARCA_41_CARREIRAS.escritorio}. Escolha a vaga e faça a candidatura aqui
            mesmo, pelo site.
          </p>
        </section>

        {todas.length > 0 && (
          <Card className="mb-5 p-4">
            <BuscaDoPortal acao={rotas.lista} busca={filtros.busca} campos={campos} />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-fs-2 tabular-nums text-fg-muted">
                {filtradas === 1 ? "1 vaga" : `${filtradas} vagas`}
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

        {todas.length === 0 ? (
          <Card>
            <EmptyState icon={<Briefcase />} title="Nenhuma vaga aberta agora" description="Volte em breve — novas oportunidades aparecem aqui." />
          </Card>
        ) : vagas.length === 0 ? (
          <Card>
            <EmptyState
              icon={<SearchX />}
              title="Nenhuma vaga com essa busca."
              action={
                <Button href={rotas.lista} variant="secondary" size="sm">
                  Ver todas as {todas.length} vagas abertas
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-3" aria-label="Vagas abertas">
            {vagas.map((v) => {
              const local = [v.cidade, v.uf].filter(Boolean).join(" – ");
              return (
                <li key={v.id}>
                  <Card href={rotas.vaga(v.id)} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-body font-semibold text-fg">{v.title}</h2>
                        <p className="mt-0.5 text-fs-2 text-fg-muted">
                          <span className="font-medium text-fg-secondary">{v.empresa}</span>
                          {local && ` · ${local}`}
                          {v.area && ` · ${v.area}`}
                        </p>
                      </div>
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
                    <p className="mt-2 text-micro text-fg-muted">
                      {publicadaHa(v.openedAt, agora)}
                      {v.applicationDeadline && ` · inscrições até ${formatCalendarDate(v.applicationDeadline)}`}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          page={pagina}
          totalPages={totalDePaginas}
          buildHref={(p) => urlDaListaEm(rotas.lista, filtros, p)}
          total={filtradas}
          rotulo="vagas"
        />
      </div>
    </MolduraDe41Carreiras>
  );
}
