import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { formatCalendarDate } from "@/lib/format";
import { listarItens, opcoesTech } from "@/lib/tech-interno/servidor";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, TIPOS, SITUACOES, PRIORIDADES, EM_ABERTO, hojeEmSaoPaulo, lerFiltros } from "@/lib/tech-interno/regras";

export const dynamic = "force-dynamic";
const TONS: Record<keyof typeof SITUACOES, TomDoSelo> = { PENDING: "marca", IN_PROGRESS: "atencao", VALIDATION: "atencao", DONE: "neutro", CANCELED: "neutro" };

export default async function ControleInternoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  const params = await searchParams, filtros = lerFiltros(params);
  const [lista, opcoes, podeEditar, podeGerir] = await Promise.all([
    listarItens(ctx, filtros), opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"), podeNoModulo(ctx, MODULO_TECH_INTERNO, "gerir"),
  ]);
  const hrefPagina = (page: number) => {
    const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "pagina") q.set(k, v);
    q.set("page", String(page)); return `${ROTA_TECH_INTERNO}?${q}`;
  };
  const hoje = hojeEmSaoPaulo();
  const prazoDoItem = (item: typeof lista.items[number]) => {
    const atrasado = item.dueDate && item.dueDate.toISOString().slice(0, 10) < hoje && (EM_ABERTO as readonly string[]).includes(item.status);
    return <span className={atrasado ? "text-danger font-medium" : ""}>{item.dueDate ? formatCalendarDate(item.dueDate) : "Sem prazo"}{atrasado ? " · Atrasado" : ""}</span>;
  };
  const nomeSistema = (item: typeof lista.items[number]) => item.systemMode === "NEW" ? "Novo sistema" : item.systemMode === "NONE" ? "Sem sistema" : `${item.tool?.name ?? "Sistema indisponível"}${item.tool && !item.tool.active ? " (inativo)" : ""}`;
  return <PageContainer>
    <PageHeader title="Controle interno" subtitle="As melhorias, correções e próximos passos da equipe Tech." action={<div className="flex flex-wrap gap-2">
      {podeGerir && <Button href={`${ROTA_TECH_INTERNO}/sistemas`} variant="secondary">Sistemas</Button>}
      {podeEditar && <Button href={`${ROTA_TECH_INTERNO}/novo`}>Novo item</Button>}
    </div>} />
    <CascoDaTabela contagem={`${lista.total} ${lista.total === 1 ? "item" : "itens"}`} busca={<DebouncedSearchInput key={filtros.q} paramName="q" placeholder="Buscar título ou descrição" />} filtros={<FiltrosDaTela naBarra campos={[
      { chave: "situacao", rotulo: "Situação", vazioLabel: "Em aberto", opcoes: [...Object.entries(SITUACOES).map(([value, label]) => ({ value, label })), { value: "ALL", label: "Todos" }] },
      { chave: "tipo", rotulo: "Tipo", opcoes: Object.entries(TIPOS).map(([value, label]) => ({ value, label })) },
      { chave: "prioridade", rotulo: "Prioridade", opcoes: PRIORIDADES.map((label, i) => ({ value: String(i), label })) },
      { chave: "sistema", rotulo: "Sistema", opcoes: [{ value: "NONE", label: "Sem sistema" }, { value: "NEW", label: "Novo sistema" }, ...opcoes.tools.map(t => ({ value: t.id, label: `${t.name}${t.active ? "" : " (inativo)"}` }))] },
      { chave: "responsavel", rotulo: "Responsável", opcoes: [{ value: "me", label: "Comigo" }, { value: "none", label: "Sem responsável" }, ...opcoes.users.map(u => ({ value: u.id, label: u.name }))] },
      { chave: "atrasados", rotulo: "Prazo", vazioLabel: "Todos", opcoes: [{ value: "1", label: "Atrasados" }] },
    ]} />}>
      {!lista.items.length ? <EmptyState icon={<ClipboardList />} title="Nenhum item neste recorte" description="Cadastre uma pendência ou ajuste os filtros para encontrar outros itens." /> : <>
        <CartoesNoCelular>{lista.items.map(item => <Cartao key={item.id}>
          <TopoDoCartao nome={<Link className="text-fg hover:text-brand" href={`${ROTA_TECH_INTERNO}/${item.id}`}>{item.title}</Link>} />
          <InfoDoCartao>{TIPOS[item.type]} · {PRIORIDADES[item.priority]}</InfoDoCartao><InfoDoCartao>{nomeSistema(item)}</InfoDoCartao>
          <InfoDoCartao>{item.assignee?.name ?? "Sem responsável"} · {prazoDoItem(item)}</InfoDoCartao>
          <PeDoCartao><Selo tom={TONS[item.status]}>{SITUACOES[item.status]}</Selo></PeDoCartao>
        </Cartao>)}</CartoesNoCelular>
        <TabelaNoDesktop padrao><table className="w-full text-ui"><thead><tr>{["Título", "Tipo", "Prioridade", "Sistema", "Situação", "Responsável", "Prazo"].map(label => <th key={label} className="text-left px-4 py-3 font-medium text-fg-secondary">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{lista.items.map(item => <tr key={item.id} className="hover:bg-surface-hover">
            <td className="px-4 py-3 min-w-48 max-w-xs break-words"><Link href={`${ROTA_TECH_INTERNO}/${item.id}`} className="font-medium text-fg hover:text-brand">{item.title}</Link></td>
            <td className="px-4 py-3">{TIPOS[item.type]}</td><td className={`px-4 py-3 ${item.priority >= 2 ? "font-semibold" : ""}`}>{PRIORIDADES[item.priority]}</td>
            <td className="px-4 py-3 break-words max-w-48">{nomeSistema(item)}</td><td className="px-4 py-3"><Selo tom={TONS[item.status]}>{SITUACOES[item.status]}</Selo></td>
            <td className="px-4 py-3">{item.assignee?.name ?? "Sem responsável"}</td><td className="px-4 py-3 whitespace-nowrap">{prazoDoItem(item)}</td>
          </tr>)}</tbody>
        </table></TabelaNoDesktop>
      </>}
    </CascoDaTabela>
    {lista.pages > 1 && <nav aria-label="Paginação" className="flex flex-wrap justify-end items-center gap-3 mt-4 text-helper">
      {lista.page > 1 && <Button variant="secondary" size="sm" href={hrefPagina(lista.page - 1)}>Anterior</Button>}
      <span>Página {lista.page} de {lista.pages}</span>{lista.page < lista.pages && <Button variant="secondary" size="sm" href={hrefPagina(lista.page + 1)}>Próxima</Button>}
    </nav>}
  </PageContainer>;
}
