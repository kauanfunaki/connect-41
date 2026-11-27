import { FormularioDeFiltro } from "@/components/shared/NavegacaoSemRecarregar";
import Link from "next/link";
import { Boxes, ClipboardCheck, PackageMinus, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { Pagination } from "@/components/shared/Pagination";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { FormularioDoItem } from "@/components/financeiroInterno/Estoque";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { CATEGORIAS_SUGERIDAS, MODULO_ESTOQUE, SITUACOES, TIPOS_DE_ITEM, abaixoDoMinimo, precisaConferir, type SituacaoDoItem } from "@/lib/financeiroInterno/estoque";
import { whereDaBusca, whereDoRecorte, type RecorteDoEstoque } from "@/lib/financeiroInterno/estoqueLista";
import type { Prisma } from "@/generated/prisma/client";
import { salvarItemDoEstoque } from "./actions";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

const RECORTES: readonly { chave: RecorteDoEstoque; rotulo: string }[] = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "com-alguem", rotulo: "Com alguém" },
  { chave: "repor", rotulo: "A repor" },
  { chave: "conferir", rotulo: "A conferir" },
  { chave: "baixados", rotulo: "Baixados" },
];

const TOM: Record<SituacaoDoItem, TomDoSelo> = {
  DISPONIVEL: "sucesso",
  EM_USO: "marca",
  EMPRESTADO: "atencao",
  MANUTENCAO: "atencao",
  BAIXADO: "neutro",
};

/**
 * O Estoque do Financeiro (05/11/2026, decisão do Kauan, fase 1): máquinas e
 * materiais do escritório — com quem está cada um, o que precisa repor e o que
 * não é conferido há tempo.
 *
 * Pagina no banco desde 27/11/2026 (melhoria-571): lia todos os itens e
 * recortava aqui. Os recortes e a busca viram `where` (`estoqueLista.ts`), a
 * lista traz só a página e os cartões do topo contam no banco, sem a busca,
 * como antes.
 */
export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_ESTOQUE);
  const tenantId = ctx.tenantId!;
  const prisma = getPrisma();
  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "todos";
  const pedida = Math.max(1, Math.min(1000, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const busca = (params.q ?? "").trim();

  const hoje = new Date();
  const minimo = prisma.inventoryItem.fields.minQuantity;
  const doRecorte = (r: RecorteDoEstoque): Prisma.InventoryItemWhereInput => ({ AND: [{ tenantId }, whereDoRecorte(r, hoje, minimo)] });
  const where: Prisma.InventoryItemWhereInput = { AND: [{ tenantId }, whereDoRecorte(recorte, hoje, minimo), whereDaBusca(busca)] };
  const lerPagina = (p: number) =>
    prisma.inventoryItem.findMany({
      where,
      select: {
        id: true, kind: true, name: true, category: true, assetTag: true, serialNumber: true, location: true,
        holderName: true, status: true, quantity: true, unit: true, minQuantity: true, lastCheckedAt: true, createdAt: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { id: "asc" }],
      skip: (p - 1) * POR_PAGINA,
      take: POR_PAGINA,
    });

  const [total, primeira, porSituacao, aRepor, aConferir, categoriasGravadas, podeGerir] = await Promise.all([
    prisma.inventoryItem.count({ where }),
    lerPagina(pedida),
    // Os cartões: a situação e o tipo de cada item, contados no banco.
    prisma.inventoryItem.groupBy({ by: ["status", "kind"], where: { tenantId }, _count: { _all: true } }),
    prisma.inventoryItem.count({ where: doRecorte("repor") }),
    prisma.inventoryItem.count({ where: doRecorte("conferir") }),
    prisma.inventoryItem.findMany({ where: { tenantId }, distinct: ["category"], select: { category: true } }),
    podeNoModulo(ctx, MODULO_ESTOQUE, "gerir"),
  ]);
  const totalDePaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  // Página além do fim (link antigo, a última esvaziou): mostra a última que existe.
  const paginaVista = Math.min(pedida, totalDePaginas);
  const daPagina = paginaVista === pedida ? primeira : await lerPagina(paginaVista);

  const contar = (f: (g: (typeof porSituacao)[number]) => boolean) => porSituacao.filter(f).reduce((s, g) => s + g._count._all, 0);
  const temAlgum = contar(() => true) > 0;
  const ativos = contar((g) => g.status !== "BAIXADO");
  const patrimonios = contar((g) => g.status !== "BAIXADO" && g.kind === "patrimonio");
  const comAlguem = contar((g) => g.status === "EM_USO" || g.status === "EMPRESTADO");
  const emprestados = contar((g) => g.status === "EMPRESTADO");
  const href = (r: string, p = 1) => {
    const q = new URLSearchParams();
    if (r !== "todos") q.set("recorte", r);
    if (params.q) q.set("q", params.q);
    if (p > 1) q.set("pagina", String(p));
    const t = q.toString();
    return t ? `/estoque?${t}` : "/estoque";
  };
  const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...categoriasGravadas.map((c) => c.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const quantidade = (i: (typeof daPagina)[number]) => (i.kind === "material" ? `${i.quantity} ${i.unit}` : "—");
  const comQuem = (i: (typeof daPagina)[number]) => i.holderName ?? i.location ?? "—";

  return (
    <PageContainer>
      <PageHeader
        title="Estoque"
        action={podeGerir ? <FormularioDoItem categorias={categorias} action={salvarItemDoEstoque.bind(null, null)} /> : undefined}
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Itens", valor: String(ativos), icone: <Boxes />, detalhe: `${patrimonios} de patrimônio`, href: href("todos"), ativo: recorte === "todos" },
          { rotulo: "Com alguém", valor: String(comAlguem), icone: <UserRound />, detalhe: `${emprestados} emprestados`, href: href("com-alguem"), ativo: recorte === "com-alguem" },
          { rotulo: "A repor", valor: String(aRepor), icone: <PackageMinus />, tom: aRepor > 0 ? "text-warning-fg" : undefined, detalhe: "abaixo do mínimo", href: href("repor"), ativo: recorte === "repor" },
          { rotulo: "A conferir", valor: String(aConferir), icone: <ClipboardCheck />, detalhe: "há mais de 6 meses", href: href("conferir"), ativo: recorte === "conferir" },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(total, "item", "itens")}
        busca={
          <FormularioDeFiltro action="/estoque" className="max-w-full">
            {recorte !== "todos" && <input type="hidden" name="recorte" value={recorte} />}
            <CampoDeBusca compact name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nome, patrimônio, pessoa ou local…" aria-label="Buscar no estoque" className="w-80 max-w-full" />
          </FormularioDeFiltro>
        }
        filtros={<FiltrosDaTela naBarra campos={[{ chave: "recorte", rotulo: "Recorte", vazioLabel: "Todos", opcoes: RECORTES.filter((r) => r.chave !== "todos").map((r) => ({ value: r.chave, label: r.rotulo })) }]} />}
      >
        {total === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={!temAlgum ? "Nenhum item no estoque" : busca ? "Nada encontrado" : "Nenhum item neste recorte"}
            description={!temAlgum ? (podeGerir ? "Cadastre a primeira máquina ou o primeiro material em “Novo item”." : "Os itens aparecem aqui quando a coordenação do Financeiro cadastrar.") : undefined}
          />
        ) : (
          <>
            <CartoesNoCelular>
              {daPagina.map((i) => (
                <Cartao key={i.id}>
                  <TopoDoCartao nome={<Link href={`/estoque/${i.id}`} className="hover:text-brand">{i.name}</Link>} valor={quantidade(i)} />
                  <InfoDoCartao>
                    {i.category}
                    {i.assetTag && <> · nº {i.assetTag}</>}
                  </InfoDoCartao>
                  <InfoDoCartao>{comQuem(i)}</InfoDoCartao>
                  <PeDoCartao>
                    <Selo tom={TOM[i.status as SituacaoDoItem] ?? "neutro"}>{SITUACOES[i.status as SituacaoDoItem] ?? i.status}</Selo>
                    {abaixoDoMinimo(i) && <Selo tom="atencao">Repor</Selo>}
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium text-left">Item</th>
                    <th className="py-2 pr-3 font-medium text-left">Tipo</th>
                    <th className="py-2 pr-3 font-medium text-right">Quantidade</th>
                    <th className="py-2 pr-3 font-medium text-left">Com quem / onde</th>
                    <th className="py-2 font-medium text-left">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {daPagina.map((i) => (
                    <tr key={i.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                      <td className="py-2.5 pr-3">
                        <Link href={`/estoque/${i.id}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {i.name}
                        </Link>
                        <span className="block text-micro text-fg-muted">
                          {i.category}
                          {i.assetTag && <> · nº {i.assetTag}</>}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-fg-secondary">{TIPOS_DE_ITEM[i.kind as keyof typeof TIPOS_DE_ITEM] ?? i.kind}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {quantidade(i)}
                        {i.kind === "material" && i.minQuantity !== null && <span className="block text-micro text-fg-muted">mínimo {i.minQuantity}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-fg-secondary">
                        {i.holderName ?? "—"}
                        {i.location && <span className="block text-micro text-fg-muted">{i.location}</span>}
                      </td>
                      <td className="py-2.5">
                        <span className="flex flex-wrap gap-1.5">
                          <Selo tom={TOM[i.status as SituacaoDoItem] ?? "neutro"}>{SITUACOES[i.status as SituacaoDoItem] ?? i.status}</Selo>
                          {abaixoDoMinimo(i) && <Selo tom="atencao">Repor</Selo>}
                          {precisaConferir(i, hoje) && <Selo tom="neutro">Conferir</Selo>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
            <Pagination page={paginaVista} totalPages={totalDePaginas} buildHref={(p) => href(recorte, p)} total={total} rotulo="itens" />
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
