import Link from "next/link";
import { History } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, LINK_DO_ITEM, nomeDoSistema } from "@/lib/tech-interno/regras";
import { historicoTech } from "@/lib/tech-interno/servidor";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { VisoesDoControle, AcoesDoControle } from "@/components/tech-interno/NavegacaoTech";
import { SituacaoTech } from "@/components/tech-interno/SituacaoTech";

export const dynamic = "force-dynamic";

// O Histórico é a terceira aba do Controle interno (05/11/2026), ao lado de
// Lista e Kanban. Mais enxuto: os itens mexidos por último, com título,
// sistema, responsável e situação. O que mudou, campo a campo, fica na linha
// do tempo do próprio item.
export default async function HistoricoTechPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), params = await searchParams;
  const texto = (chave: string) => typeof params[chave] === "string" ? (params[chave] as string).trim() : "";
  const p = Number(texto("page") || 1), q = texto("q").slice(0, 200), autor = texto("autor").slice(0, 191);
  const [{ pages, page, changes, autores }, podeEditar] = await Promise.all([
    historicoTech(ctx, { pagina: Number.isInteger(p) && p > 0 ? Math.min(p, 1000000) : 1, q, autor }),
    podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"),
  ]);
  const aqui = new URLSearchParams(); if (q) aqui.set("q", q); if (autor) aqui.set("autor", autor);
  const hrefPagina = (n: number) => { const u = new URLSearchParams(aqui); u.set("page", String(n)); return `${ROTA_TECH_INTERNO}/historico?${u}`; };
  // Um item por linha: vários registros seguidos do mesmo item viram um só.
  const vistos = new Set<string>(), itens = changes.filter(c => !vistos.has(c.itemId) && vistos.add(c.itemId)).map(c => c.item);
  const linkDoItem = (id: string) => `${ROTA_TECH_INTERNO}/${id}`;
  const hrefVisao = (v: string) => v === "historico" ? `${ROTA_TECH_INTERNO}/historico` : `${ROTA_TECH_INTERNO}?visao=${v}`;
  return <PageContainer>
    <PageHeader title="Controle interno" subtitle="As melhorias, correções e próximos passos da equipe Tech."
      action={<AcoesDoControle podeEditar={podeEditar} novoHref={`${ROTA_TECH_INTERNO}/novo`} />} />
    <VisoesDoControle ativa="historico" href={hrefVisao} />
    <CascoDaTabela buscaAEsquerda
      busca={<DebouncedSearchInput key={q} paramName="q" placeholder="Buscar pelo título do item" />}
      filtros={<FiltrosDaTela naBarra campos={[{ chave: "autor", rotulo: "Quem mexeu", vazioLabel: "Todos", opcoes: autores.map(a => ({ value: a.authorId, label: a.authorName })) }]} />}>
      {!itens.length ? <EmptyState icon={<History />} title={q || autor ? "Nenhum item neste recorte" : "Nada registrado ainda"}
        description={q || autor ? "Ajuste a busca ou o filtro para ver outros itens." : "Os itens criados ou alterados aparecem aqui, do mais recente para o mais antigo."} />
        : <>
          <CartoesNoCelular>{itens.map(item => <Cartao key={item.id} className="relative cursor-pointer hover:bg-surface-hover">
            <TopoDoCartao nome={<Link className={`text-fg hover:text-brand ${LINK_DO_ITEM}`} href={linkDoItem(item.id)}>{item.title}</Link>} />
            <InfoDoCartao>{nomeDoSistema(item, true)}</InfoDoCartao><InfoDoCartao>{item.assignee?.name ?? "Sem responsável"}</InfoDoCartao>
            <PeDoCartao><SituacaoTech forma="selo" id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={false} /></PeDoCartao>
          </Cartao>)}</CartoesNoCelular>
          <TabelaNoDesktop padrao><table className="w-full text-ui"><thead><tr>{["Título", "Sistema", "Responsável", "Situação"].map(label => <th key={label} className="text-left px-4 py-3 font-medium text-fg-secondary">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{itens.map(item => <tr key={item.id} className="relative cursor-pointer hover:bg-surface-hover">
              <td className="px-4 py-3 min-w-48 max-w-md break-words"><Link href={linkDoItem(item.id)} className={`font-medium text-fg hover:text-brand ${LINK_DO_ITEM}`}>{item.title}</Link></td>
              <td className="px-4 py-3 break-words max-w-48">{nomeDoSistema(item, true)}</td>
              <td className="px-4 py-3">{item.assignee?.name ?? "Sem responsável"}</td>
              <td className="relative h-12 w-44 min-w-40 !p-0"><SituacaoTech id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={false} /></td>
            </tr>)}</tbody>
          </table></TabelaNoDesktop>
        </>}
    </CascoDaTabela>
    {pages > 1 && <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-end gap-3 text-helper">
      {page > 1 && <Button variant="secondary" size="sm" href={hrefPagina(page - 1)}>Anterior</Button>}
      <span>Página {page} de {pages}</span>{page < pages && <Button variant="secondary" size="sm" href={hrefPagina(page + 1)}>Próxima</Button>}
    </nav>}
  </PageContainer>;
}
