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
import { salvarItemDoEstoque } from "./actions";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

const RECORTES = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "com-alguem", rotulo: "Com alguém" },
  { chave: "repor", rotulo: "A repor" },
  { chave: "conferir", rotulo: "A conferir" },
  { chave: "baixados", rotulo: "Baixados" },
] as const;

const TOM: Record<SituacaoDoItem, TomDoSelo> = {
  DISPONIVEL: "sucesso",
  EM_USO: "marca",
  EMPRESTADO: "atencao",
  MANUTENCAO: "atencao",
  BAIXADO: "neutro",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * O Estoque do Financeiro (05/11/2026, decisão do Kauan, fase 1): máquinas e
 * materiais do escritório — com quem está cada um, o que precisa repor e o que
 * não é conferido há tempo. Lista do escritório (centenas de itens): lê tudo e
 * recorta aqui, como Certificados.
 */
export default async function EstoquePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_ESTOQUE);
  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.recorte)?.chave ?? "todos";
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const busca = semAcento((params.q ?? "").trim());

  const [itens, podeGerir] = await Promise.all([
    getPrisma().inventoryItem.findMany({
      where: { tenantId: ctx.tenantId! },
      select: {
        id: true, kind: true, name: true, category: true, assetTag: true, serialNumber: true, location: true,
        holderName: true, status: true, quantity: true, unit: true, minQuantity: true, lastCheckedAt: true, createdAt: true,
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    podeNoModulo(ctx, MODULO_ESTOQUE, "gerir"),
  ]);

  const hoje = new Date();
  const ativos = itens.filter((i) => i.status !== "BAIXADO");
  const comAlguem = ativos.filter((i) => i.status === "EM_USO" || i.status === "EMPRESTADO");
  const aRepor = ativos.filter(abaixoDoMinimo);
  const aConferir = ativos.filter((i) => precisaConferir(i, hoje));
  const noRecorte = { todos: ativos, "com-alguem": comAlguem, repor: aRepor, conferir: aConferir, baixados: itens.filter((i) => i.status === "BAIXADO") }[recorte];
  const visiveis = busca
    ? noRecorte.filter((i) => semAcento([i.name, i.category, i.assetTag, i.serialNumber, i.location, i.holderName].filter(Boolean).join(" ")).includes(busca))
    : noRecorte;
  const totalDePaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalDePaginas);
  const daPagina = visiveis.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const href = (r: string, p = 1) => {
    const q = new URLSearchParams();
    if (r !== "todos") q.set("recorte", r);
    if (params.q) q.set("q", params.q);
    if (p > 1) q.set("pagina", String(p));
    const t = q.toString();
    return t ? `/estoque?${t}` : "/estoque";
  };
  const categorias = [...new Set([...CATEGORIAS_SUGERIDAS, ...itens.map((i) => i.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const quantidade = (i: (typeof itens)[number]) => (i.kind === "material" ? `${i.quantity} ${i.unit}` : "—");
  const comQuem = (i: (typeof itens)[number]) => i.holderName ?? i.location ?? "—";

  return (
    <PageContainer>
      <PageHeader
        title="Estoque"
        subtitle="As máquinas e os materiais do escritório: com quem está cada um, o que repor e o que conferir."
        action={podeGerir ? <FormularioDoItem categorias={categorias} action={salvarItemDoEstoque.bind(null, null)} /> : undefined}
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Itens", valor: String(ativos.length), icone: <Boxes />, detalhe: `${ativos.filter((i) => i.kind === "patrimonio").length} de patrimônio`, href: href("todos"), ativo: recorte === "todos" },
          { rotulo: "Com alguém", valor: String(comAlguem.length), icone: <UserRound />, detalhe: `${comAlguem.filter((i) => i.status === "EMPRESTADO").length} emprestados`, href: href("com-alguem"), ativo: recorte === "com-alguem" },
          { rotulo: "A repor", valor: String(aRepor.length), icone: <PackageMinus />, tom: aRepor.length > 0 ? "text-warning-fg" : undefined, detalhe: "abaixo do mínimo", href: href("repor"), ativo: recorte === "repor" },
          { rotulo: "A conferir", valor: String(aConferir.length), icone: <ClipboardCheck />, detalhe: "há mais de 6 meses", href: href("conferir"), ativo: recorte === "conferir" },
        ]}
      />

      <CascoDaTabela
        contagem={contarItens(visiveis.length, "item", "itens")}
        busca={
          <FormularioDeFiltro action="/estoque" className="max-w-full">
            {recorte !== "todos" && <input type="hidden" name="recorte" value={recorte} />}
            <CampoDeBusca compact name="q" defaultValue={params.q ?? ""} placeholder="Buscar por nome, patrimônio, pessoa ou local…" aria-label="Buscar no estoque" className="w-80 max-w-full" />
          </FormularioDeFiltro>
        }
        filtros={<FiltrosDaTela naBarra campos={[{ chave: "recorte", rotulo: "Recorte", vazioLabel: "Todos", opcoes: RECORTES.filter((r) => r.chave !== "todos").map((r) => ({ value: r.chave, label: r.rotulo })) }]} />}
      >
        {visiveis.length === 0 ? (
          <EmptyState
            icon={<Boxes />}
            title={itens.length === 0 ? "Nenhum item no estoque" : busca ? "Nada encontrado" : "Nenhum item neste recorte"}
            description={itens.length === 0 ? (podeGerir ? "Cadastre a primeira máquina ou o primeiro material em “Novo item”." : "Os itens aparecem aqui quando a coordenação do Financeiro cadastrar.") : undefined}
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
            <Pagination page={paginaVista} totalPages={totalDePaginas} buildHref={(p) => href(recorte, p)} total={visiveis.length} rotulo="itens" />
          </>
        )}
      </CascoDaTabela>
    </PageContainer>
  );
}
