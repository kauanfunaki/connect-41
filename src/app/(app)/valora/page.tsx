import Link from "next/link";
import { notFound } from "next/navigation";
import { Calculator, HandCoins, Hourglass, Percent, Scale, Settings, Stethoscope, Trophy } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Pagination } from "@/components/shared/Pagination";
import { paginaDaUrl, totalDePaginas } from "@/lib/financeiro/paginaDeContas";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { saoPauloParts } from "@/lib/agenda";
import { EditarProposta } from "@/components/valora/EditarProposta";
import { acessoAoValora } from "@/lib/valora/servidor";
import { brl } from "@/lib/valora/formato";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { ROTULO_REGIME, type Perfil } from "@/lib/valora/motor";

export const dynamic = "force-dynamic";

// Situação da proposta no `Selo` — era o `Badge`, a pílula de categoria
// (auditoria DRG-05, 07/10/2026). O azul do "Em aberto" segue como `marca`.
const SITUACAO: Record<string, { rotulo: string; tom: TomDoSelo }> = {
  ABERTA: { rotulo: "Em aberto", tom: "marca" },
  GANHA: { rotulo: "Ganha", tom: "sucesso" },
  PERDIDA: { rotulo: "Perdida", tom: "perigo" },
};

const numero = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

/**
 * Propostas por página (27/11/2026, melhoria-571): a lista ia até as 200 mais
 * recentes; agora pagina no banco, e os números do topo contam todas.
 */
const POR_PAGINA = 50;

/**
 * Propostas simuladas. O registro de ganhas e perdidas, com o motivo e o preço do
 * concorrente, é a fonte mais confiável de "quanto o mercado paga" — as tabelas
 * de sindicato são facultativas e ficam acima do praticado.
 */
export default async function ValoraPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const acesso = await acessoAoValora();
  if (!acesso) notFound();

  const params = await searchParams;
  const prisma = getPrisma();
  const where = { tenantId: acesso.tenantId };
  const buscarPagina = (p: number) =>
    prisma.valoraProposta.findMany({
      where,
      select: {
        id: true,
        cliente: true,
        perfil: true,
        precoAlvo: true,
        precoOferecido: true,
        precoConcorrente: true,
        status: true,
        motivo: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
      // O id desempata as criadas no mesmo instante: a página não repete nem pula proposta.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * POR_PAGINA,
      take: POR_PAGINA,
    });
  const pedida = paginaDaUrl(params.pagina);
  // Os números do topo contam todas as propostas, não a página: eram contados
  // nas 200 que a tela trazia. O "Oferecido ÷ alvo" é a média das razões de
  // cada proposta, que o banco não agrega pelo Prisma: lê só os dois preços.
  const [porSituacao, comPreco, primeira] = await Promise.all([
    prisma.valoraProposta.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.valoraProposta.findMany({
      where: { ...where, precoAlvo: { not: null }, precoOferecido: { not: null } },
      select: { precoAlvo: true, precoOferecido: true },
    }),
    buscarPagina(pedida),
  ]);
  const total = porSituacao.reduce((n, s) => n + s._count._all, 0);
  const ultima = totalDePaginas(total, POR_PAGINA);
  // Página além do fim (link antigo): mostra a última que existe.
  const pagina = Math.min(pedida, ultima);
  const propostas = pagina === pedida ? primeira : await buscarPagina(pagina);
  const linhas = propostas.map((p) => ({
    ...p,
    precoAlvo: numero(p.precoAlvo),
    precoOferecido: numero(p.precoOferecido),
    precoConcorrente: numero(p.precoConcorrente),
    regime: ROTULO_REGIME[(p.perfil as Perfil).regime] ?? "—",
  }));

  const naSituacao = (status: string) => porSituacao.find((s) => s.status === status)?._count._all ?? 0;
  const abertas = naSituacao("ABERTA");
  const ganhas = naSituacao("GANHA");
  const perdidas = naSituacao("PERDIDA");
  const decididas = ganhas + perdidas;
  // Oferecido ÷ alvo: abaixo de 100% é desconto dado; acima, gordura que o cliente aceitou.
  const comparaveis = comPreco
    .map((p) => ({ alvo: numero(p.precoAlvo), oferecido: numero(p.precoOferecido) }))
    .filter((p) => p.alvo && p.oferecido);
  const oferecidoSobreAlvo = comparaveis.length
    ? comparaveis.reduce((s, p) => s + p.oferecido! / p.alvo!, 0) / comparaveis.length
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Valora"
        action={
          <div className="flex flex-wrap gap-2">
            {acesso.podeGerir && (
              <Button href="/valora/diagnostico" variant="secondary" size="sm">
                <Stethoscope size={14} /> Diagnóstico da carteira
              </Button>
            )}
            {acesso.podeGerir && (
              <Button href="/valora/parametros" variant="secondary" size="sm">
                <Settings size={14} /> Parâmetros
              </Button>
            )}
            {acesso.podeSimular && (
              <Button href="/valora/nova" size="sm">
                <Calculator size={14} /> Nova simulação
              </Button>
            )}
          </div>
        }
      />

      {/* Os números do topo no cartão padrão, com ícone (30/09). */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Em aberto", valor: formatarNumero(abertas, 0), icone: <Hourglass /> },
          { rotulo: "Ganhas", valor: formatarNumero(ganhas, 0), icone: <Trophy />, tom: ganhas > 0 ? "text-success-fg" : undefined },
          {
            rotulo: "Taxa de fechamento",
            valor: decididas ? `${Math.round((ganhas / decididas) * 100)}%` : "—",
            icone: <Percent />,
            detalhe: `${decididas} decididas`,
          },
          {
            rotulo: "Oferecido ÷ alvo",
            valor: oferecidoSobreAlvo === null ? "—" : `${Math.round(oferecidoSobreAlvo * 100)}%`,
            icone: <Scale />,
            detalhe: "média das propostas com preço",
          },
        ]}
      />

      {/* No casco das outras listas, com a contagem na barra — era a tabela
          sem casco (auditoria DRG-13, 07/10/2026). Sem Filtros na barra: os
          filtros desta lista são os funis das colunas. */}
      <CascoDaTabela contagem={contarItens(total, "proposta", "propostas")}>
        {linhas.length === 0 ? (
          <EmptyState
            title="Nenhuma proposta ainda"
            description="Toda simulação salva aparece aqui."
            icon={<HandCoins />}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {linhas.map((p) => (
                <Cartao key={p.id}>
                  <TopoDoCartao
                    nome={
                      <Link href={`/valora/${p.id}`} className="text-fg hover:text-brand transition-colors">
                        {p.cliente}
                      </Link>
                    }
                    valor={brl(p.precoAlvo)}
                  />
                  <InfoDoCartao>
                    {p.regime} · {formatInstantDate(p.createdAt)} · {p.createdBy.name}
                  </InfoDoCartao>
                  <InfoDoCartao className="tabular-nums">
                    oferecido {brl(p.precoOferecido)} · concorrente {brl(p.precoConcorrente)}
                  </InfoDoCartao>
                  {p.motivo && <InfoDoCartao>{p.motivo}</InfoDoCartao>}
                  <PeDoCartao>
                    <Selo tom={SITUACAO[p.status]?.tom ?? "marca"}>{SITUACAO[p.status]?.rotulo ?? p.status}</Selo>
                    {acesso.podeSimular && (
                      <div className="ml-auto">
                        <EditarProposta proposta={p} />
                      </div>
                    )}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            {/* Casco padrão e funil por coluna (30/09). O funil filtra no
                navegador a página aberta — desde a paginação (27/11/2026,
                melhoria-571), como em Exigências e Certificados. Sem funil em
                cliente e nos preços: são únicos. */}
            <TabelaFiltravel
              linhas={linhas.map((p) => ({
                id: p.id,
                valores: {
                  regime: p.regime,
                  situacao: SITUACAO[p.status]?.rotulo ?? p.status,
                  criada: saoPauloParts(p.createdAt).dateKey,
                  autor: p.createdBy.name,
                },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[920px]">
                  <thead>
                    <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                      <th className="px-3">Cliente</th>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Regime" chave="regime" />
                      </th>
                      <th className="px-3">Alvo</th>
                      <th className="px-3">Oferecido</th>
                      <th className="px-3">Concorrente</th>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" />
                      </th>
                      <th className="px-3">
                        <FiltroDaColuna
                          rotulo="Criada"
                          campos={[
                            { chave: "criada", rotulo: "Data", tipo: "data" },
                            { chave: "autor", rotulo: "Quem criou" },
                          ]}
                          align="right"
                        />
                      </th>
                      <th className="px-3">
                        <span className="sr-only">Retorno</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((p) => (
                      // A linha abre a proposta (revisão de 05/10): o que foi decidido
                      // na simulação, o retorno e as observações.
                      <LinhaFiltravel key={p.id} id={p.id} href={`/valora/${p.id}`} className="border-b border-border align-top">
                        <td className="px-3">
                          <Link href={`/valora/${p.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                            {p.cliente}
                          </Link>
                          {p.motivo && <span className="block text-micro text-fg-muted">{p.motivo}</span>}
                        </td>
                        <td className="px-3 text-fg-secondary">{p.regime}</td>
                        <td className="px-3 tabular-nums">{brl(p.precoAlvo)}</td>
                        <td className="px-3 tabular-nums">{brl(p.precoOferecido)}</td>
                        <td className="px-3 tabular-nums">{brl(p.precoConcorrente)}</td>
                        <td className="px-3">
                          <Selo tom={SITUACAO[p.status]?.tom ?? "marca"}>{SITUACAO[p.status]?.rotulo ?? p.status}</Selo>
                        </td>
                        <td className="px-3 text-fg-secondary whitespace-nowrap">
                          {formatInstantDate(p.createdAt)}
                          <span className="block text-micro text-fg-muted">{p.createdBy.name}</span>
                        </td>
                        <td className="px-3">{acesso.podeSimular && <EditarProposta proposta={p} />}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
      </CascoDaTabela>
      <Pagination
        page={pagina}
        totalPages={ultima}
        buildHref={(p) => (p > 1 ? `/valora?pagina=${p}` : "/valora")}
        total={total}
        rotulo="propostas"
      />
    </PageContainer>
  );
}
