import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { formatCalendarDate } from "@/lib/format";
import { VisoesDoControle, AcoesDoControle } from "@/components/tech-interno/NavegacaoTech";
import { VisoesTech } from "@/components/tech-interno/VisoesTech";
import { SituacaoTech } from "@/components/tech-interno/SituacaoTech";
import { listarItens, opcoesTech } from "@/lib/tech-interno/servidor";
import { MODULO_TECH_INTERNO, ROTA_TECH_INTERNO, TIPOS, SITUACOES, PRIORIDADES, EM_ABERTO, hojeEmSaoPaulo, lerFiltros, comVolta, nomeDoSistema, LINK_DO_ITEM } from "@/lib/tech-interno/regras";
import { setoresDoModulo } from "@/lib/modules";

export const dynamic = "force-dynamic";

export default async function ControleInternoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO);
  const params = await searchParams, filtros = lerFiltros(params);
  // A Agenda do controle interno saiu (lote C de 03/11/2026): os prazos dos
  // itens estão na Agenda geral, filtrada no setor do Tech.
  const setorDoTech = (await setoresDoModulo(ctx.tenantId!, MODULO_TECH_INTERNO))?.[0] ?? "tech";
  const agendaHref = `/agenda?view=mes&setor=${encodeURIComponent(setorDoTech)}`;
  if (filtros.view === "agenda") redirect(agendaHref);
  const view = filtros.view === "kanban" ? "kanban" : "lista";
  const [lista, opcoes, podeEditar] = await Promise.all([
    listarItens(ctx, filtros), opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir"),
  ]);
  const hrefPagina = (page: number) => {
    const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "pagina") q.set(k, v);
    q.set("page", String(page)); return `${ROTA_TECH_INTERNO}?${q}`;
  };
  const hoje = hojeEmSaoPaulo();
  const atual = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "voltar") atual.set(k, v);
  const voltar = atual.toString() ? `${ROTA_TECH_INTERNO}?${atual}` : ROTA_TECH_INTERNO, href = (destino: string) => comVolta(destino, voltar);
  const hrefVisao = (view: string, month = filtros.month) => {
    if (view === "historico") return `${ROTA_TECH_INTERNO}/historico`;
    const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "page" && k !== "pagina") q.set(k, v);
    q.set("visao", view); q.set("mes", month); return `${ROTA_TECH_INTERNO}?${q}`;
  };
  const prazoDoItem = (item: typeof lista.items[number]) => {
    const atrasado = item.dueDate && item.dueDate.toISOString().slice(0, 10) < hoje && (EM_ABERTO as readonly string[]).includes(item.status);
    return <span className={atrasado ? "text-danger font-medium" : ""}>{item.dueDate ? formatCalendarDate(item.dueDate) : "Sem prazo"}{atrasado ? " · Atrasado" : ""}</span>;
  };
  const nomeSistema = (item: typeof lista.items[number]) => nomeDoSistema(item, true);
  // O Kanban ocupa a altura da tela, sem rolagem de lado (lote C de 03/11/2026).
  return <PageContainer className={view === "kanban" ? "h-full flex flex-col" : ""}>
    <PageHeader title="Controle interno" subtitle="As melhorias, correções e próximos passos da equipe Tech."
      action={<AcoesDoControle podeEditar={podeEditar} novoHref={href(`${ROTA_TECH_INTERNO}/novo`)} />} />
    <div className="flex-shrink-0"><VisoesDoControle ativa={view} href={v => hrefVisao(v)} /></div>
    <CascoDaTabela className={view === "kanban" ? "flex min-h-0 flex-1 flex-col" : ""} buscaAEsquerda contagem={`${lista.total} ${lista.total === 1 ? "item" : "itens"}`} busca={<DebouncedSearchInput key={filtros.q} paramName="q" placeholder="Buscar título ou descrição" />} filtros={<FiltrosDaTela naBarra campos={[
      { chave: "situacao", rotulo: "Situação", vazioLabel: view === "kanban" ? "Todas" : "Em aberto", opcoes: [...Object.entries(SITUACOES).map(([value, label]) => ({ value, label })), ...(view !== "kanban" || filtros.status === "ALL" ? [{ value: "ALL", label: "Todos" }] : [])] },
      { chave: "tipo", rotulo: "Tipo", opcoes: Object.entries(TIPOS).map(([value, label]) => ({ value, label })) },
      { chave: "prioridade", rotulo: "Prioridade", opcoes: PRIORIDADES.map((label, i) => ({ value: String(i), label })) },
      { chave: "sistema", rotulo: "Sistema", opcoes: [{ value: "NONE", label: "Sem sistema" }, { value: "NEW", label: "Novo sistema" }, ...opcoes.sistemas.map(s => ({ value: s.chave, label: `${s.nome}${s.ativo ? "" : " (inativo)"}` }))] },
      { chave: "responsavel", rotulo: "Responsável", opcoes: [{ value: "me", label: "Comigo" }, { value: "none", label: "Sem responsável" }, ...opcoes.users.map(u => ({ value: u.id, label: u.name }))] },
      { chave: "atrasados", rotulo: "Prazo", vazioLabel: "Todos", opcoes: [{ value: "1", label: "Atrasados" }] },
    ]} />}>
      {view === "kanban" ? <div className="min-h-0 flex-1 rounded-lg border border-border bg-surface"><VisoesTech voltar={voltar} today={hoje} canEdit={podeEditar} items={lista.items.map(item => ({ id: item.id, title: item.title, type: item.type, status: item.status, priority: item.priority, version: item.version, dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null, assignee: item.assignee?.name ?? null, system: nomeSistema(item) }))} /></div> : !lista.items.length ? <EmptyState icon={<ClipboardList />} title="Nenhum item neste recorte" description="Cadastre uma pendência ou ajuste os filtros para encontrar outros itens." /> : <>
        <CartoesNoCelular>{lista.items.map(item => <Cartao key={item.id} className="relative cursor-pointer hover:bg-surface-hover">
          <TopoDoCartao nome={<Link className={`text-fg hover:text-brand ${LINK_DO_ITEM}`} href={href(`${ROTA_TECH_INTERNO}/${item.id}`)}>{item.title}</Link>} />
          <InfoDoCartao>{TIPOS[item.type]} · {PRIORIDADES[item.priority]}</InfoDoCartao><InfoDoCartao>{nomeSistema(item)}</InfoDoCartao>
          <InfoDoCartao>{item.assignee?.name ?? "Sem responsável"} · {prazoDoItem(item)}</InfoDoCartao>
          <PeDoCartao><SituacaoTech key={`${item.id}:${item.version}`} forma="selo" id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={podeEditar} /></PeDoCartao>
        </Cartao>)}</CartoesNoCelular>
        <TabelaNoDesktop padrao><table className="w-full text-ui"><thead><tr>{["Título", "Tipo", "Prioridade", "Sistema", "Situação", "Responsável", "Prazo"].map(label => <th key={label} className="text-left px-4 py-3 font-medium text-fg-secondary">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{lista.items.map(item => <tr key={item.id} className="relative cursor-pointer hover:bg-surface-hover">
            <td className="px-4 py-3 min-w-48 max-w-xs break-words"><Link href={href(`${ROTA_TECH_INTERNO}/${item.id}`)} className={`font-medium text-fg hover:text-brand ${LINK_DO_ITEM}`}>{item.title}</Link></td>
            <td className="px-4 py-3">{TIPOS[item.type]}</td><td className={`px-4 py-3 ${item.priority >= 2 ? "font-semibold" : ""}`}>{PRIORIDADES[item.priority]}</td>
            <td className="px-4 py-3 break-words max-w-48">{nomeSistema(item)}</td><td className="relative h-12 w-44 min-w-40 !p-0"><SituacaoTech key={`${item.id}:${item.version}`} id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={podeEditar} /></td>
            <td className="px-4 py-3">{item.assignee?.name ?? "Sem responsável"}</td><td className="px-4 py-3 whitespace-nowrap">{prazoDoItem(item)}</td>
          </tr>)}</tbody>
        </table></TabelaNoDesktop>
      </>}
    </CascoDaTabela>
    {view === "lista" && lista.pages > 1 && <nav aria-label="Paginação" className="flex flex-wrap justify-end items-center gap-3 mt-4 text-helper">
      {lista.page > 1 && <Button variant="secondary" size="sm" href={hrefPagina(lista.page - 1)}>Anterior</Button>}
      <span>Página {lista.page} de {lista.pages}</span>{lista.page < lista.pages && <Button variant="secondary" size="sm" href={hrefPagina(lista.page + 1)}>Próxima</Button>}
    </nav>}
  </PageContainer>;
}
