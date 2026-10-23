"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Stepper } from "@/components/ui/Stepper";
import { Accordion } from "@/components/ui/Accordion";
import { CampoMes } from "@/components/ui/CampoMes";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { contextoDaUrl, etapaDaUrl, formatosDoContexto, mesmoContexto, pendenciasAgrupadas, rotuloTipo, somarValores } from "@/lib/contabil/regras";
import { TIPOS_CONTABEIS, type ConfiguracaoContabil, type ContextoContabil, type PedidoContabil, type TipoContabil } from "@/lib/contabil/types";
import { Campo, comandar, consultar, Mensagem, moeda, texto } from "./compartilhados";
import { PendenciasContabeis } from "./PendenciasContabeis";

const ETAPAS = ["Escolher período", "Conferir dados", "Resolver pendências", "Gerar arquivos"];
const ativo = (p: PedidoContabil | null) => p?.estado === "pendente" || p?.estado === "executando";

export function ContabilSped() {
  const router = useRouter(); const search = useSearchParams();
  const [config, setConfig] = useState<ConfiguracaoContabil | null>(null);
  const [erro, setErro] = useState(""); const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false); const [pedidoRecebido, setPedido] = useState<PedidoContabil | null>(null);
  const [geracaoRecebida, setGeracao] = useState<PedidoContabil | null>(null);
  const [formatoSelecionado, setFormato] = useState("xlsx"); const [parcial, setParcial] = useState(false);
  const [recarregar, setRecarregar] = useState(0);
  const pendente = useRef<{ operacao: string; corpo: string; chave: string } | null>(null);
  const padrao = useMemo<ContextoContabil>(() => ({ cnpj: config?.estabelecimentos[0]?.cnpj ?? "", periodo: config?.competencias[0] ?? "", tipos: ["entradas"], incluir_dominio: true }), [config]);
  const contexto = useMemo(() => contextoDaUrl(new URLSearchParams(search.toString()), padrao), [search, padrao]);
  const formatos = formatosDoContexto(contexto);
  const formato = formatos.includes(formatoSelecionado) ? formatoSelecionado : "xlsx";
  const id = search.get("pedido"); const geracaoId = search.get("geracao");
  const pedido = pedidoRecebido?.id === id ? pedidoRecebido : null;
  const geracao = geracaoRecebida?.id === geracaoId ? geracaoRecebida : null;
  const etapa = config && contexto.cnpj ? etapaDaUrl(new URLSearchParams(search.toString())) : 1;
  const pronto = pedido?.estado === "concluida" && mesmoContexto(pedido.contexto, contexto);
  const secoes = useMemo(() => pronto ? pedido.secoes : [], [pronto, pedido]);
  const pendencias = useMemo(() => pendenciasAgrupadas(secoes), [secoes]);
  const estabelecimento = config?.estabelecimentos.find(e => e.cnpj === contexto.cnpj);
  const navegar = useCallback((mudancas: Record<string, string | null>) => {
    const p = new URLSearchParams(search.toString()); for (const [k, v] of Object.entries(mudancas)) { if (v === null) p.delete(k); else p.set(k, v); }
    router.push("/contabil/sped?" + p, { scroll: false });
  }, [router, search]);
  useEffect(() => {
    const c = new AbortController();
    consultar<ConfiguracaoContabil>("contexto", {}, c.signal).then(setConfig).catch(e => { if (!c.signal.aborted) setErro(e.message); });
    return () => c.abort();
  }, [recarregar]);
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let falhas = 0;
    if (!id || !contexto.cnpj) return;
    async function carregar() {
      try {
        const r = await consultar<PedidoContabil>("pedido", { id: id!, cnpj: contexto.cnpj }, c.signal);
        if (c.signal.aborted) return;
        setPedido(r); falhas = 0; if (ativo(r)) timer = setTimeout(carregar, 10000);
      } catch (e) { if (!c.signal.aborted) { setErro(e instanceof Error ? e.message : "Falha ao consultar."); if (++falhas < 3) timer = setTimeout(carregar, 10000 * falhas); } }
    }
    void carregar(); return () => { c.abort(); clearTimeout(timer); };
  }, [id, contexto.cnpj, recarregar]);
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    if (!geracaoId || !contexto.cnpj) return;
    async function carregar() {
      try {
        const r = await consultar<PedidoContabil>("pedido", { id: geracaoId!, cnpj: contexto.cnpj }, c.signal);
        if (c.signal.aborted) return; setGeracao(r); if (ativo(r)) timer = setTimeout(carregar, 10000);
      } catch (e) { if (!c.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao consultar os arquivos."); }
    }
    void carregar(); return () => { c.abort(); clearTimeout(timer); };
  }, [geracaoId, contexto.cnpj, recarregar]);
  async function executar(operacao: string, dados: Record<string, unknown> = {}, recorte = contexto) {
    setErro(""); setOcupado(true);
    const corpo = JSON.stringify({ contexto: recorte, ...dados });
    if (pendente.current?.operacao !== operacao || pendente.current.corpo !== corpo) pendente.current = { operacao, corpo, chave: crypto.randomUUID() };
    try {
      const r = await comandar<{ id: string }>(operacao, recorte, dados, pendente.current.chave);
      pendente.current = null;
      if (operacao === "conferir") {
        setPedido(null); setGeracao(null); setParcial(false); setAviso("");
        navegar({ pedido: r.id, geracao: null, etapa: "2", cnpj: recorte.cnpj, periodo: recorte.periodo, tipos: recorte.tipos.join(","), somente_faltantes: recorte.incluir_dominio ? null : "1" });
      } else if (operacao === "gerar") { setGeracao(null); navegar({ geracao: r.id, etapa: "4" }); }
      else setRecarregar(v => v + 1);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(false); }
  }
  function alterou() { setPedido(p => p ? { ...p, desatualizado: true } : p); setAviso("Regra salva. Atualize a conferência para incluir essa alteração nos arquivos."); setRecarregar(v => v + 1); }
  const desatualizado = !!pedido?.desatualizado;
  const temLancamentos = secoes.some(s => s.lancamentos > 0);
  const gerado = geracao?.estado === "concluida" && mesmoContexto(geracao.contexto, contexto) && !geracao.desatualizado && geracao.formato === formato;
  return <PageContainer>
    <PageHeader title="SPED contábil" subtitle="Confira os dados, resolva o que falta e prepare os lançamentos para importar na Domínio." />
    {erro && <div className="mb-4"><Mensagem erro>{erro}<div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setErro(""); setRecarregar(v => v + 1); }}>Tentar novamente</Button><Button href="/admin/integracoes" variant="ghost">Configurar integração</Button></div></Mensagem></div>}
    {!config ? !erro && <p role="status">Consultando a integração…</p> : config.estabelecimentos.length === 0 ? <EmptyState title="Nenhum estabelecimento vinculado" description="Vincule no Connect uma empresa e uma raiz atendidas pela base SPED deste escritório." /> : <>
      <div className="rounded-lg border border-border bg-surface mb-5">
        <Stepper steps={ETAPAS.map((label, i) => ({ label, status: i + 1 === etapa ? "current" : "upcoming", disabled: i > 0 && !id }))} onStepClick={i => navegar({ etapa: String(i + 1) })} />
      </div>
      {etapa !== 1 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 border border-border p-4 mb-5 text-label">
        <div><strong>{estabelecimento?.nome ?? contexto.cnpj}</strong><p className="text-fg-secondary">{contexto.cnpj} · {contexto.periodo} · {contexto.tipos.map(rotuloTipo).join(", ")}</p></div>
        <Button variant="secondary" onClick={() => navegar({ etapa: "1" })}>Alterar</Button>
      </div>}
      {aviso && <div className="mb-4"><Mensagem>{aviso}</Mensagem></div>}
      {desatualizado && etapa !== 1 && <div className="mb-4"><Mensagem>A conferência ficou desatualizada após uma alteração de regra ou arquivo de origem. <Button variant="link" disabled={ocupado || ativo(pedido)} onClick={() => executar("conferir")}>Atualizar conferência</Button></Mensagem></div>}
      {etapa === 1 && <EscolherPeriodo key={JSON.stringify(contexto)} config={config} inicial={contexto} ocupado={ocupado} onConferir={c => executar("conferir", {}, c)} onReabrir={(c, id) => { setPedido(null); setGeracao(null); navegar({ cnpj: c.cnpj, periodo: c.periodo, tipos: c.tipos.join(","), somente_faltantes: c.incluir_dominio ? null : "1", pedido: id, geracao: null, etapa: "2" }); }} />}
      {etapa !== 1 && !pronto && <div className="space-y-4">
        {pedido && <Andamento pedido={pedido} ocupado={ocupado} onParar={() => executar("parar", { id: pedido.id })} onRetomar={() => executar("retomar", { id: pedido.id })} />}
        {!pedido && <Mensagem>{id ? "Consultando o andamento…" : "Escolha um período para começar."}</Mensagem>}
      </div>}
      {etapa === 2 && pronto && <section aria-labelledby="titulo-conferencia" className="space-y-4">
        <h2 id="titulo-conferencia" className="text-section-title font-semibold">O que foi encontrado</h2>
        {secoes.map(s => <Accordion key={s.tipo + s.competencia} className="rounded-lg border border-border bg-surface p-4" titulo={<> {rotuloTipo(s.tipo)} · {s.competencia} — {s.estado === "origem_ausente" ? "Arquivo de origem ausente" : s.estado === "sem_movimento" ? "Sem movimento" : s.lancamentos + " lançamentos prontos"} </>}>
          <div className="grid gap-3 sm:grid-cols-3 py-4 text-label"><p>{s.documentos} documentos encontrados</p><p>{s.lancamentos} lançamentos · {moeda(s.valor)}</p><p>{s.pendencias.length} pendências · {moeda(s.valor_pendente)}</p></div>
          <p className="text-label text-fg-secondary">Destino: {s.destino}</p>
          {!!s.regras_fixas?.length && <Accordion titulo="Regras usadas pelo motor"><ListaDados linhas={s.regras_fixas} /></Accordion>}
          {s.avisos.map(a => <p className="text-label text-warning mt-2" key={a}>{a}</p>)}
          <Accordion className="mt-3" titulo={<> Lançamentos e itens fora do relatório </>}><ListaDados linhas={s.linhas} /><ListaDados linhas={s.descartados} /></Accordion>
        </Accordion>)}
        <Mensagem>{pendencias.length ? pendencias.length + " grupos precisam de atenção, envolvendo " + secoes.reduce((n, s) => n + s.documentos_pendentes, 0) + " documentos. Defina as contas ou revise o que ficará de fora." : "Nenhuma pendência encontrada nos dados consultados. Revise os arquivos antes de gerar."}</Mensagem>
      </section>}
      {etapa === 3 && pronto && <PendenciasContabeis contexto={contexto} pedido={pedido} config={config} onAlterou={alterou} />}
      {etapa === 4 && pronto && <section aria-labelledby="titulo-arquivos" className="space-y-4">
        <h2 id="titulo-arquivos" className="text-section-title font-semibold">Revise antes de gerar</h2>
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3 text-label">
          {contexto.tipos.map(tipo => { const partes = secoes.filter(s => s.tipo === tipo); return <div key={tipo}><strong>{rotuloTipo(tipo)}</strong><p>{partes.reduce((n, s) => n + s.lancamentos, 0)} lançamentos · {moeda(somarValores(partes.map(s => s.valor)))}</p><p className="text-fg-secondary">{partes[0]?.destino}</p></div>; })}
          <Campo nome="Formato"><Select className="w-full" value={formato} onChange={e => setFormato(e.target.value)}><option value="xlsx">Planilha da Domínio (.xlsx)</option><option value="txt">Arquivo da Domínio (.txt)</option>{formatos.includes("csv") && <option value="csv">Relatório para conferência (.csv)</option>}</Select></Campo>
          {contexto.periodo.length === 4 && <p>As entradas serão separadas por competência em um ZIP, com pendências e o relatório de conferência.</p>}
        </div>
        {pendencias.length > 0 && <Mensagem>{secoes.reduce((n, s) => n + s.documentos_pendentes, 0)} documentos permanecem pendentes, totalizando {moeda(somarValores(secoes.map(s => s.valor_pendente)))}. Esses documentos ficarão fora dos lançamentos.<label className="flex gap-2 mt-3"><Checkbox checked={parcial} onChange={e => setParcial(e.target.checked)} />Quero gerar somente os lançamentos prontos.</label><Button variant="link" onClick={() => navegar({ etapa: "3" })}>Voltar às pendências</Button></Mensagem>}
        {!temLancamentos && <Mensagem>Nenhum lançamento pronto neste período. Confira as pendências e a disponibilidade dos arquivos de origem.</Mensagem>}
        <Button variant={gerado ? "secondary" : "primary"} disabled={ocupado || ativo(geracao) || desatualizado || !temLancamentos || (pendencias.length > 0 && !parcial)} onClick={() => executar("gerar", { referencia: pedido.id, formato, aceitar_parcial: parcial })}>{gerado ? "Gerar novamente" : pendencias.length ? "Gerar somente os lançamentos prontos" : "Gerar arquivos"}</Button>
        {geracao && geracao.estado !== "concluida" && <Andamento pedido={geracao} ocupado={ocupado} onParar={() => executar("parar", { id: geracao.id })} onRetomar={() => executar("retomar", { id: geracao.id })} />}
        {geracao?.estado === "concluida" && mesmoContexto(geracao.contexto, contexto) && <Mensagem><strong>Arquivos gerados</strong>{geracao.desatualizado && <p>Estes arquivos pertencem a uma conferência anterior. As regras ou a origem foram alteradas depois da geração.</p>}<p className="mt-1">Baixe os arquivos e importe na Domínio. A geração e o download não confirmam a importação.</p><div className="flex flex-wrap gap-2 mt-3">{geracao.arquivos.map(a => <Button key={a.chave} href={"/api/contabil/sped/arquivo?" + new URLSearchParams({ id: geracao.id, cnpj: contexto.cnpj, chave: a.chave })} download title={a.nome} variant={gerado ? "primary" : "secondary"}>Baixar {a.tipo === "entradas" ? "entradas" : a.tipo === "apoio" ? "pagamentos" : "faturamento"} (.{a.nome.split(".").pop()})</Button>)}</div></Mensagem>}
      </section>}
      {etapa > 1 && <div className="sticky bottom-0 z-10 bg-surface border-t border-border mt-6 py-4 flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={() => navegar({ etapa: String(etapa - 1) })}>Voltar</Button>
        {pronto && etapa < 4 && <Button disabled={ocupado || desatualizado} onClick={() => navegar({ etapa: etapa === 2 && pendencias.length ? "3" : "4" })}>{etapa === 2 && pendencias.length ? "Resolver pendências" : "Revisar arquivos"}</Button>}
      </div>}
    </>}
  </PageContainer>;
}
function EscolherPeriodo({ config, inicial, ocupado, onConferir, onReabrir }: { config: ConfiguracaoContabil; inicial: ContextoContabil; ocupado: boolean; onConferir: (c: ContextoContabil) => void; onReabrir: (c: ContextoContabil, id: string) => void }) {
  const [cnpj, setCnpj] = useState(inicial.cnpj); const [periodo, setPeriodo] = useState(inicial.periodo);
  const [anual, setAnual] = useState(inicial.periodo.length === 4); const [tipos, setTipos] = useState(inicial.tipos); const [soFalta, setSoFalta] = useState(!inicial.incluir_dominio);
  return <form onSubmit={e => { e.preventDefault(); onConferir({ cnpj, periodo, tipos, incluir_dominio: !soFalta }); }} className="max-w-3xl rounded-lg border border-border bg-surface p-5 space-y-5">
    <h2 className="text-section-title font-semibold">O que você deseja preparar?</h2>
    <p className="text-label text-fg-secondary">Escolha o estabelecimento e o período. As contas já cadastradas serão reaproveitadas.</p>
    <Campo nome="Estabelecimento"><Select required className="w-full" value={cnpj} onChange={e => setCnpj(e.target.value)}>{config.estabelecimentos.map(e => <option key={e.cnpj} value={e.cnpj}>{e.nome} — {e.cnpj}</option>)}</Select></Campo>
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo nome="Período"><Select className="w-full" value={anual ? "ano" : "mes"} onChange={e => { const ano = e.target.value === "ano"; setAnual(ano); setPeriodo(ano ? periodo.slice(0, 4) : config.competencias.find(c => c.startsWith(periodo)) ?? config.competencias[0] ?? ""); if (ano) setTipos(t => t.filter(v => v !== "saidas")); }}><option value="mes">Uma competência</option><option value="ano">Ano inteiro</option></Select></Campo>
      <Campo nome={anual ? "Ano" : "Competência"}>{anual ? <Input required inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="Ex.: 2026" /> : <CampoMes required value={periodo} onChange={setPeriodo} />}</Campo>
    </div>
    <fieldset className="space-y-3"><legend className="text-label font-semibold mb-3">Tipos de lançamento</legend>{(Object.keys(TIPOS_CONTABEIS) as TipoContabil[]).map(t => <label key={t} className="flex items-start gap-3 text-label"><Checkbox className="mt-1" checked={tipos.includes(t)} disabled={anual && t === "saidas"} onChange={e => setTipos(v => e.target.checked ? [...v, t] : v.filter(i => i !== t))} /><span>{TIPOS_CONTABEIS[t]}{t === "apoio" && <span className="block text-fg-secondary">RPA, recibos, contratos e faturas. Destino: matriz.</span>}{t === "saidas" && anual && <span className="block text-fg-secondary">Para faturamento, escolha uma competência.</span>}</span></label>)}</fieldset>
    <label className="flex items-start gap-3 text-label"><Checkbox className="mt-1" checked={soFalta} onChange={e => setSoFalta(e.target.checked)} /><span>Só o que ainda não está na Domínio<span className="block text-fg-secondary">Desmarcado, inclui todas as notas aptas. Marque somente quando quiser descontar as notas já identificadas na base da Domínio.</span></span></label>
    <Button type="submit" disabled={ocupado || !periodo || !tipos.length}>Conferir período</Button>
    {!!config.recentes?.length && <Accordion titulo="Últimas consultas"><div className="space-y-3 mt-3">{config.recentes.filter(p => p.operacao === "conferir").map(p => <div key={p.id} className="flex flex-wrap justify-between gap-2 text-label border-b border-border py-2"><span>{p.contexto.cnpj} · {p.contexto.periodo} · {({ pendente: "Na fila", executando: "Processando", concluida: "Conferência disponível", erro: "Interrompida", parada: "Parada" } as Record<string,string>)[p.estado] ?? p.estado}</span><Button variant="secondary" onClick={() => onReabrir(p.contexto, p.id)}>Abrir consulta</Button></div>)}</div></Accordion>}
  </form>;
}
function Andamento({ pedido, ocupado, onParar, onRetomar }: { pedido: PedidoContabil; ocupado: boolean; onParar: () => void; onRetomar: () => void }) {
  return <Mensagem erro={pedido.estado === "erro"}><strong>{pedido.estado === "pendente" ? "Aguardando o agente SPED" : pedido.estado === "executando" ? "Processando" : pedido.estado === "parada" ? "Processamento parado" : pedido.estado === "erro" ? "Não foi possível concluir" : "Processamento concluído"}</strong><p>{pedido.progresso.etapa} · {pedido.progresso.concluidos} de {pedido.progresso.total} itens concluídos.</p>{pedido.erro && <p>{pedido.erro}</p>}{ativo(pedido) ? <><p className="mt-1">Você pode sair desta página e acompanhar depois. A parada é realizada entre os itens.</p><Button variant="secondary" disabled={ocupado} onClick={onParar}>Parar após o item atual</Button></> : (pedido.estado === "parada" || pedido.estado === "erro") && <Button variant="secondary" disabled={ocupado} onClick={onRetomar}>Retomar itens pendentes</Button>}</Mensagem>;
}
export function ListaDados({ linhas }: { linhas: Record<string, unknown>[] }) {
  if (!linhas.length) return <p className="text-label text-fg-secondary my-3">Nenhum item nesta lista.</p>;
  const colunas = [...new Set(linhas.flatMap(l => Object.keys(l)))].filter(k => !["sugestao", "caminhos"].includes(k)).slice(0, 8);
  return <div className="overflow-x-auto my-3"><table className="w-full text-ui text-left"><thead><tr>{colunas.map(c => <th key={c} className="p-2 border-b border-border">{c.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{linhas.slice(0, 100).map((l, i) => <tr key={i}>{colunas.map(c => <td key={c} className="p-2 border-b border-border break-words max-w-72">{typeof l[c] === "object" ? JSON.stringify(l[c]) : texto(l[c])}</td>)}</tr>)}</tbody></table>{linhas.length > 100 && <p>Mostrando 100 itens. Use os arquivos para consultar a lista completa.</p>}</div>;
}
