"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Stepper, type StepDef } from "@/components/ui/Stepper";
import { Accordion } from "@/components/ui/Accordion";
import { CampoMes } from "@/components/ui/CampoMes";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import { contextoDaUrl, etapaDaUrl, formatosDoContexto, mesmoContexto, pendenciasAgrupadas, rotuloTipo, somarValores } from "@/lib/contabil/regras";
import { percentual, periodoNaTela } from "@/lib/contabil/exibicao";
import { TIPOS_CONTABEIS, type ConfiguracaoContabil, type ContextoContabil, type PedidoContabil, type TipoContabil } from "@/lib/contabil/types";
import { Campo, comandar, consultar, EstadoContabil, integracaoIndisponivel, ListaDados, moeda } from "./compartilhados";
import { PendenciasContabeis } from "./PendenciasContabeis";

const ETAPAS = ["Escolher período", "Conferir dados", "Resolver pendências", "Gerar arquivos"];
const ativo = (p: PedidoContabil | null) => p?.estado === "pendente" || p?.estado === "executando";
// A origem decide quem limpa o erro (26/10/2026): a consulta seguinte que dá certo limpa o erro de consulta, nunca o de uma ação.
type Erro = { texto: string; integracao: boolean; origem: "config" | "consulta" | "acao" };
const erroDe = (e: unknown, padrao: string, origem: Erro["origem"]): Erro => ({ texto: e instanceof Error ? e.message : padrao, integracao: integracaoIndisponivel(e), origem });
const quando = (v: string) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? "" : formatInstantDateTime(d); };

export function ContabilSped() {
  const router = useRouter(); const search = useSearchParams(); const toast = useToast();
  const [config, setConfig] = useState<ConfiguracaoContabil | null>(null);
  const [erro, setErro] = useState<Erro | null>(null);
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
    consultar<ConfiguracaoContabil>("contexto", {}, c.signal).then(setConfig).catch(e => { if (!c.signal.aborted) setErro(erroDe(e, "Falha ao consultar.", "config")); });
    return () => c.abort();
  }, [recarregar]);
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let falhas = 0;
    if (!id || !contexto.cnpj) return;
    async function carregar() {
      try {
        const r = await consultar<PedidoContabil>("pedido", { id: id!, cnpj: contexto.cnpj }, c.signal);
        if (c.signal.aborted) return;
        setPedido(r); setErro(e => e?.origem === "consulta" ? null : e); falhas = 0; if (ativo(r)) timer = setTimeout(carregar, 10000);
      } catch (e) { if (!c.signal.aborted) { setErro(erroDe(e, "Falha ao consultar.", "consulta")); if (++falhas < 3) timer = setTimeout(carregar, 10000 * falhas); } }
    }
    void carregar(); return () => { c.abort(); clearTimeout(timer); };
  }, [id, contexto.cnpj, recarregar]);
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    if (!geracaoId || !contexto.cnpj) return;
    async function carregar() {
      try {
        const r = await consultar<PedidoContabil>("pedido", { id: geracaoId!, cnpj: contexto.cnpj }, c.signal);
        if (c.signal.aborted) return; setGeracao(r); setErro(e => e?.origem === "consulta" ? null : e); if (ativo(r)) timer = setTimeout(carregar, 10000);
      } catch (e) { if (!c.signal.aborted) setErro(erroDe(e, "Falha ao consultar os arquivos.", "consulta")); }
    }
    void carregar(); return () => { c.abort(); clearTimeout(timer); };
  }, [geracaoId, contexto.cnpj, recarregar]);
  async function executar(operacao: string, dados: Record<string, unknown> = {}, recorte = contexto) {
    setErro(null); setOcupado(true);
    const corpo = JSON.stringify({ contexto: recorte, ...dados });
    if (pendente.current?.operacao !== operacao || pendente.current.corpo !== corpo) pendente.current = { operacao, corpo, chave: crypto.randomUUID() };
    try {
      const r = await comandar<{ id: string }>(operacao, recorte, dados, pendente.current.chave);
      pendente.current = null;
      if (operacao === "conferir") {
        setPedido(null); setGeracao(null); setParcial(false);
        navegar({ pedido: r.id, geracao: null, etapa: "2", cnpj: recorte.cnpj, periodo: recorte.periodo, tipos: recorte.tipos.join(","), somente_faltantes: recorte.incluir_dominio ? null : "1" });
        // O motor devolve o mesmo pedido para um pedido repetido: sem trocar o endereço, só o recarregar volta a consultar (26/10/2026).
        if (r.id === id) setRecarregar(v => v + 1);
      } else if (operacao === "gerar") { setGeracao(null); navegar({ geracao: r.id, etapa: "4" }); if (r.id === geracaoId) setRecarregar(v => v + 1); }
      else setRecarregar(v => v + 1);
    } catch (e) { setErro(erroDe(e, "Não foi possível concluir.", "acao")); }
    finally { setOcupado(false); }
  }
  // A regra salva vira toast (26/10/2026); o aviso de conferência desatualizada, logo abaixo, já diz o que fazer.
  function alterou(mensagem: string) { setPedido(p => p ? { ...p, desatualizado: true } : p); toast.success(mensagem); setRecarregar(v => v + 1); }
  const desatualizado = !!pedido?.desatualizado;
  const temLancamentos = secoes.some(s => s.lancamentos > 0);
  const gerado = geracao?.estado === "concluida" && mesmoContexto(geracao.contexto, contexto) && !geracao.desatualizado && geracao.formato === formato;
  const documentosPendentes = secoes.reduce((n, s) => n + s.documentos_pendentes, 0);
  const motivoGerar = ativo(geracao) ? "Aguarde a geração em andamento terminar." : desatualizado ? "Atualize a conferência antes de gerar." : temLancamentos && pendencias.length > 0 && !parcial ? "Marque a opção acima para gerar só os lançamentos prontos." : "";
  // Etapas anteriores concluídas; as seguintes só pelo botão de avançar, e nada além da conferência antes de ela terminar (26/10/2026).
  const passos = ETAPAS.map((label, i): StepDef => { const n = i + 1; return { label, status: n < etapa ? "done" : n > etapa ? "upcoming" : n === 2 && pedido?.estado === "erro" ? "error" : "current", disabled: n > etapa || (n > 1 && !id) || (n > 2 && !pronto) }; });
  return <PageContainer>
    <PageHeader title="SPED contábil" subtitle="Confira os dados, resolva o que falta e prepare os lançamentos para importar na Domínio." />
    {erro && <Aviso className="mb-4"><p>{erro.texto}</p><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => { setErro(null); setRecarregar(v => v + 1); }}>Tentar novamente</Button>{erro.integracao && <Button size="sm" href="/admin/integracoes" variant="ghost">Configurar integração</Button>}</div></Aviso>}
    {!config ? !erro && <p role="status" className="text-label text-fg-secondary">Consultando a integração…</p> : config.estabelecimentos.length === 0 ? <EmptyState title="Nenhum estabelecimento vinculado" description="Vincule no Connect uma empresa e uma raiz atendidas pela base SPED deste escritório." /> : <>
      <Card className="mb-5 overflow-hidden [&>ol]:border-b-0"><Stepper steps={passos} onStepClick={i => { if (!passos[i].disabled) navegar({ etapa: String(i + 1) }); }} /></Card>
      {etapa !== 1 && <Card className="flex flex-wrap items-center justify-between gap-3 p-4 mb-5 text-label">
        <div className="min-w-0"><strong className="text-fg">{estabelecimento?.nome ?? formatCnpj(contexto.cnpj)}</strong><p className="text-fg-secondary">{formatCnpj(contexto.cnpj)} · {periodoNaTela(contexto.periodo)} · {contexto.tipos.map(rotuloTipo).join(", ")}</p></div>
        <Button size="sm" variant="secondary" onClick={() => navegar({ etapa: "1" })}>Alterar</Button>
      </Card>}
      {desatualizado && etapa !== 1 && <Aviso tom="atencao" className="mb-4">A conferência ficou desatualizada após uma alteração de regra ou arquivo de origem. <Button variant="link" disabled={ocupado || ativo(pedido)} onClick={() => executar("conferir")}>Atualizar conferência</Button></Aviso>}
      {etapa === 1 && <EscolherPeriodo key={JSON.stringify(contexto)} config={config} inicial={contexto} ocupado={ocupado} onConferir={c => executar("conferir", {}, c)} onReabrir={(c, id) => { setPedido(null); setGeracao(null); navegar({ cnpj: c.cnpj, periodo: c.periodo, tipos: c.tipos.join(","), somente_faltantes: c.incluir_dominio ? null : "1", pedido: id, geracao: null, etapa: "2" }); }} />}
      {etapa !== 1 && !pronto && <div className="space-y-4">
        {pedido ? <Andamento pedido={pedido} ocupado={ocupado} onParar={() => executar("parar", { id: pedido.id })} onRetomar={() => executar("retomar", { id: pedido.id })} /> : id ? <p role="status" className="text-label text-fg-secondary">Consultando o andamento…</p> : <Aviso tom="neutro">Escolha um período para começar.</Aviso>}
      </div>}
      {etapa === 2 && pronto && <section aria-labelledby="titulo-conferencia" className="space-y-4">
        <h2 id="titulo-conferencia" className="text-card-title font-semibold text-fg">O que foi encontrado</h2>
        {secoes.map(s => <Card key={s.tipo + s.competencia} className="p-4"><Accordion titulo={<span className="flex flex-wrap items-center gap-2"><span className="font-semibold text-fg">{rotuloTipo(s.tipo)} · {periodoNaTela(s.competencia)}</span>{s.estado === "origem_ausente" ? <Selo tom="atencao">Arquivo de origem ausente</Selo> : s.estado === "sem_movimento" ? <Selo>Sem movimento</Selo> : <Selo tom="sucesso">{s.lancamentos} lançamentos prontos</Selo>}</span>}>
          <div className="grid gap-3 sm:grid-cols-3 py-4 text-label"><p>{s.documentos} documentos encontrados</p><p>{s.lancamentos} lançamentos · {moeda(s.valor)}</p><p>{s.pendencias.length} pendências · {moeda(s.valor_pendente)}</p></div>
          <p className="text-label text-fg-secondary">Destino: {s.destino}</p>
          {!!s.regras_fixas?.length && <Accordion className="mt-3" titulo="Regras usadas pelo motor"><ListaDados linhas={s.regras_fixas} /></Accordion>}
          {s.avisos.map(a => <Aviso tom="atencao" className="mt-2" key={a}>{a}</Aviso>)}
          <Accordion className="mt-3" titulo="Lançamentos e itens fora do relatório"><ListaDados linhas={s.linhas} /><ListaDados linhas={s.descartados} /></Accordion>
        </Accordion></Card>)}
        <Aviso tom={pendencias.length ? "atencao" : "info"}>{pendencias.length ? pendencias.length + " grupos precisam de atenção, envolvendo " + documentosPendentes + " documentos. Defina as contas ou revise o que ficará de fora." : "Nenhuma pendência encontrada nos dados consultados. Revise os arquivos antes de gerar."}</Aviso>
      </section>}
      {etapa === 3 && pronto && <PendenciasContabeis contexto={contexto} pedido={pedido} config={config} onAlterou={alterou} />}
      {etapa === 4 && pronto && <section aria-labelledby="titulo-arquivos" className="space-y-4">
        <h2 id="titulo-arquivos" className="text-card-title font-semibold text-fg">Gerar arquivos</h2>
        <Card className="p-4 space-y-3 text-label">
          {contexto.tipos.map(tipo => { const partes = secoes.filter(s => s.tipo === tipo); return <div key={tipo}><strong className="text-fg">{rotuloTipo(tipo)}</strong><p>{partes.reduce((n, s) => n + s.lancamentos, 0)} lançamentos · {moeda(somarValores(partes.map(s => s.valor)))}</p><p className="text-fg-secondary">{partes[0]?.destino}</p></div>; })}
          <Campo nome="Formato"><Select className="w-full" value={formato} onChange={e => setFormato(e.target.value)}><option value="xlsx">Planilha da Domínio (.xlsx)</option><option value="txt">Arquivo da Domínio (.txt)</option>{formatos.includes("csv") && <option value="csv">Relatório para conferência (.csv)</option>}</Select></Campo>
          {contexto.periodo.length === 4 && <p className="text-fg-secondary">As entradas serão separadas por competência em um ZIP, com pendências e o relatório de conferência.</p>}
        </Card>
        {pendencias.length > 0 && <Aviso tom="atencao">{documentosPendentes} documentos permanecem pendentes, totalizando {moeda(somarValores(secoes.map(s => s.valor_pendente)))}. Esses documentos ficarão fora dos lançamentos.<label className="flex gap-2 mt-3 text-fg"><Checkbox checked={parcial} onChange={e => setParcial(e.target.checked)} />Quero gerar somente os lançamentos prontos.</label><Button variant="link" onClick={() => navegar({ etapa: "3" })}>Voltar às pendências</Button></Aviso>}
        {!temLancamentos && <Aviso tom="atencao">Nenhum lançamento pronto neste período. Confira as pendências e a disponibilidade dos arquivos de origem.</Aviso>}
        <div className="flex flex-col items-start gap-1"><Button variant={gerado ? "secondary" : "primary"} disabled={ocupado || !temLancamentos || !!motivoGerar} onClick={() => executar("gerar", { referencia: pedido.id, formato, aceitar_parcial: parcial })}>{gerado ? "Gerar novamente" : pendencias.length ? "Gerar somente os lançamentos prontos" : "Gerar arquivos"}</Button>{motivoGerar && <p className="text-helper text-fg-muted">{motivoGerar}</p>}</div>
        {geracao && geracao.estado !== "concluida" && <Andamento pedido={geracao} ocupado={ocupado} onParar={() => executar("parar", { id: geracao.id })} onRetomar={() => executar("retomar", { id: geracao.id })} />}
        {geracao?.estado === "concluida" && mesmoContexto(geracao.contexto, contexto) && <Aviso tom={geracao.desatualizado ? "atencao" : "sucesso"}><strong>Arquivos gerados</strong>{geracao.desatualizado && <p>Estes arquivos pertencem a uma conferência anterior. As regras ou a origem foram alteradas depois da geração.</p>}<p className="mt-1">Baixe os arquivos e importe na Domínio. A geração e o download não confirmam a importação.</p><div className="flex flex-wrap gap-2 mt-3">{geracao.arquivos.map(a => <Button key={a.chave} size="sm" href={"/api/contabil/sped/arquivo?" + new URLSearchParams({ id: geracao.id, cnpj: contexto.cnpj, chave: a.chave })} download title={a.nome} variant={gerado ? "primary" : "secondary"}>Baixar {a.tipo === "entradas" ? "entradas" : a.tipo === "apoio" ? "pagamentos" : "faturamento"} (.{a.nome.split(".").pop()})</Button>)}</div></Aviso>}
      </section>}
      {etapa > 1 && <div className="sticky bottom-0 z-10 bg-surface border-t border-border mt-6 py-4 flex flex-wrap items-start justify-between gap-3">
        <Button variant="secondary" onClick={() => navegar({ etapa: String(etapa - 1) })}>Voltar</Button>
        {pronto && etapa < 4 && <div className="flex flex-col items-end gap-1"><Button disabled={ocupado || desatualizado} onClick={() => navegar({ etapa: etapa === 2 && pendencias.length ? "3" : "4" })}>{etapa === 2 && pendencias.length ? "Resolver pendências" : "Gerar arquivos"}</Button>{desatualizado && <p className="text-helper text-fg-muted">Atualize a conferência para continuar.</p>}</div>}
      </div>}
    </>}
  </PageContainer>;
}
function EscolherPeriodo({ config, inicial, ocupado, onConferir, onReabrir }: { config: ConfiguracaoContabil; inicial: ContextoContabil; ocupado: boolean; onConferir: (c: ContextoContabil) => void; onReabrir: (c: ContextoContabil, id: string) => void }) {
  const [cnpj, setCnpj] = useState(inicial.cnpj); const [periodo, setPeriodo] = useState(inicial.periodo);
  const [anual, setAnual] = useState(inicial.periodo.length === 4); const [tipos, setTipos] = useState(inicial.tipos); const [soFalta, setSoFalta] = useState(!inicial.incluir_dominio);
  const recentes = (config.recentes ?? []).filter(p => p.operacao === "conferir");
  const motivo = !periodo ? "Escolha o período." : !tipos.length ? "Escolha ao menos um tipo de lançamento." : "";
  return <Card className="max-w-3xl p-5"><form onSubmit={e => { e.preventDefault(); onConferir({ cnpj, periodo, tipos, incluir_dominio: !soFalta }); }} className="space-y-5">
    <div><h2 className="text-card-title font-semibold text-fg">O que você deseja preparar?</h2>
    <p className="mt-1 text-label text-fg-secondary">Escolha o estabelecimento e o período. As contas já cadastradas serão reaproveitadas.</p></div>
    <Campo nome="Estabelecimento"><Select required className="w-full" value={cnpj} onChange={e => setCnpj(e.target.value)}>{config.estabelecimentos.map(e => <option key={e.cnpj} value={e.cnpj}>{e.nome} — {formatCnpj(e.cnpj)}</option>)}</Select></Campo>
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo nome="Período"><Select className="w-full" value={anual ? "ano" : "mes"} onChange={e => { const ano = e.target.value === "ano"; setAnual(ano); setPeriodo(ano ? periodo.slice(0, 4) : config.competencias.find(c => c.startsWith(periodo)) ?? config.competencias[0] ?? ""); if (ano) setTipos(t => t.filter(v => v !== "saidas")); }}><option value="mes">Uma competência</option><option value="ano">Ano inteiro</option></Select></Campo>
      <Campo nome={anual ? "Ano" : "Competência"}>{anual ? <Input required inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="Ex.: 2026" /> : <CampoMes required value={periodo} onChange={setPeriodo} />}</Campo>
    </div>
    <fieldset className="space-y-3"><legend className="text-label font-semibold mb-3">Tipos de lançamento</legend>{(Object.keys(TIPOS_CONTABEIS) as TipoContabil[]).map(t => <label key={t} className="flex items-start gap-3 text-label"><Checkbox className="mt-1" checked={tipos.includes(t)} disabled={anual && t === "saidas"} onChange={e => setTipos(v => e.target.checked ? [...v, t] : v.filter(i => i !== t))} /><span>{TIPOS_CONTABEIS[t]}{t === "apoio" && <span className="block text-fg-secondary">RPA, recibos, contratos e faturas. Destino: matriz.</span>}{t === "saidas" && anual && <span className="block text-fg-secondary">Para faturamento, escolha uma competência.</span>}</span></label>)}</fieldset>
    <label className="flex items-start gap-3 text-label"><Checkbox className="mt-1" checked={soFalta} onChange={e => setSoFalta(e.target.checked)} /><span>Só o que ainda não está na Domínio<span className="block text-fg-secondary">Desmarcado, inclui todas as notas aptas. Marque somente quando quiser descontar as notas já identificadas na base da Domínio.</span></span></label>
    <div className="flex flex-col items-start gap-1"><Button type="submit" disabled={ocupado || !!motivo}>Conferir período</Button>{motivo && <p className="text-helper text-fg-muted">{motivo}</p>}</div>
    {recentes.length > 0 && <Accordion titulo="Últimas consultas"><ul className="mt-3">{recentes.map(p => { const nome = config.estabelecimentos.find(e => e.cnpj === p.contexto.cnpj)?.nome; const data = p.criado_em ? quando(p.criado_em) : ""; return <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-label border-b border-border py-2">
      <div className="min-w-0"><p className="font-medium text-fg">{nome ?? formatCnpj(p.contexto.cnpj)}</p><p className="text-helper text-fg-secondary">{nome ? formatCnpj(p.contexto.cnpj) + " · " : ""}{periodoNaTela(p.contexto.periodo)} · {p.contexto.tipos.map(rotuloTipo).join(", ")}{data && " · " + data}</p></div>
      <span className="flex items-center gap-2"><EstadoContabil estado={p.estado} /><Button size="sm" variant="secondary" onClick={() => onReabrir(p.contexto, p.id)}>Abrir consulta</Button></span>
    </li>; })}</ul></Accordion>}
  </form></Card>;
}
/** O andamento no desenho do `AcompanhamentoDaExecucao` do Fiscal (26/10/2026): situação no Selo, barra de progresso e a parada confirmada. */
function Andamento({ pedido, ocupado, onParar, onRetomar }: { pedido: PedidoContabil; ocupado: boolean; onParar: () => Promise<void>; onRetomar: () => void }) {
  const { dialog, requestConfirm } = useConfirm();
  const { concluidos, total, etapa } = pedido.progresso; const pct = percentual(pedido.progresso); const aberto = ativo(pedido);
  const titulo = pedido.operacao === "gerar" ? "Geração dos arquivos" : "Conferência do período";
  return <Card className="overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div className="min-w-0"><h2 className="text-card-title font-semibold text-fg">{titulo}</h2><p className="mt-1 text-helper text-fg-secondary">{pedido.estado === "pendente" ? "Aguardando o agente SPED." : etapa || "Preparando os itens."}</p></div><span className="flex flex-wrap items-center gap-2"><EstadoContabil estado={pedido.estado} />{aberto && <Selo tom="marca">Atualizando</Selo>}</span></div>
    <div className="p-5 space-y-3 text-label">
      <div role="progressbar" aria-label={titulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} aria-valuetext={pct === null ? "Calculando os itens" : `${concluidos} de ${total} itens`} className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct ?? 0}%` }} /></div>
      <p className="text-fg-secondary">{pct === null ? "Calculando os itens…" : `${concluidos} de ${total} itens concluídos (${pct}%).`}</p>
      {pedido.erro && <Aviso tom="atencao">{pedido.erro}</Aviso>}
      {aberto ? <><p className="text-fg-secondary">Você pode sair desta página e acompanhar depois. A parada é realizada entre os itens.</p><Button size="sm" variant="secondary" disabled={ocupado} onClick={() => requestConfirm({ title: "Parar após o item atual?", description: "O item em andamento termina; os seguintes ficam pendentes e podem ser retomados depois.", confirmLabel: "Parar" }, onParar)}>Parar após o item atual</Button></> : (pedido.estado === "parada" || pedido.estado === "erro") && <Button size="sm" variant="secondary" disabled={ocupado} onClick={onRetomar}>Retomar itens pendentes</Button>}
    </div>
    {dialog}
  </Card>;
}
