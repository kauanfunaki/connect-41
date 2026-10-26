"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Accordion } from "@/components/ui/Accordion";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { CampoData } from "@/components/ui/CampoData";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { pendenciasAgrupadas, rotuloTipo } from "@/lib/contabil/regras";
import { documentoNaTela, periodoNaTela } from "@/lib/contabil/exibicao";
import type { ConfiguracaoContabil, ContextoContabil, Linha, PedidoContabil, PendenciaContabil, PreviaCsv, RegrasContabeis } from "@/lib/contabil/types";
import { Campo, comandar, consultar, EstadoContabil, ListaDados, moeda, texto } from "./compartilhados";

type Edicao = { operacao: string; titulo: string; valores: Linha };
const VISOES = ["pendencias", "regras", "importar"] as const; type Visao = (typeof VISOES)[number];
const SALVO: Record<string, string> = { "importar-csv": "Preenchimento importado.", desconsiderar: "Lançamento desconsiderado.", reconsiderar: "Lançamento reconsiderado.", sugestoes: "Sugestões aplicadas." };
const salvo = (operacao: string) => SALVO[operacao] ?? (operacao.startsWith("remover") ? "Regra removida." : "Regra salva.");
// Pagamento sem nota cuja falta não é conta: a correção é no documento ou na competência de origem (26/10/2026).
const soNaOrigem = (p: PendenciaContabil) => p.tipo === "apoio" && !["codigo_debito", "conta_credito"].includes(p.falta ?? "");
const emAndamento = (p: PedidoContabil | null) => p?.estado === "pendente" || p?.estado === "executando";
export function PendenciasContabeis({ contexto, pedido, config, onAlterou }: { contexto: ContextoContabil; pedido: PedidoContabil; config: ConfiguracaoContabil; onAlterou: (mensagem: string) => void }) {
  const search = useSearchParams(); const router = useRouter();
  const [regras, setRegras] = useState<RegrasContabeis | null>(null); const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [consultaDocs, setConsultaDocs] = useState<{ id: string; linhas: Linha[] } | null>(null);
  const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  const [csv, setCsv] = useState(""); const [previa, setPrevia] = useState<PreviaCsv | null>(null); const [envio, setEnvio] = useState(0);
  const [confirmarSugestoes, setConfirmarSugestoes] = useState(false);
  const [excluir, setExcluir] = useState<{ operacao: string; dados: Linha } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [exportacaoId, setExportacaoId] = useState<string | null>(null); const [exportacaoRecebida, setExportacao] = useState<PedidoContabil | null>(null);
  const chave = useRef<{ assinatura: string; valor: string } | null>(null);
  const todas = useMemo(() => pendenciasAgrupadas(pedido.secoes), [pedido.secoes]);
  const [termo, setTermo] = useState(search.get("busca") ?? ""); const timerBusca = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tipo = search.get("tipo") ?? "";
  const visao: Visao = (VISOES as readonly string[]).includes(search.get("visao") ?? "") ? search.get("visao") as Visao : "pendencias";
  const selecionada = todas.find(p => p.id === search.get("detalhe"));
  const documentos = selecionada && consultaDocs?.id === selecionada.id ? consultaDocs.linhas : null;
  const carregandoDocs = !!selecionada && selecionada.tipo === "entradas" && documentos === null;
  const podeGravar = config.escrita && config.permissoes.agir;
  const filtradas = todas.filter(p => (!tipo || p.tipo === tipo) && (p.nome + " " + p.cnpj_fornecedor + " " + p.cfop + " " + p.motivo).toLowerCase().includes(termo.toLowerCase()));
  const paginas = Math.ceil(filtradas.length / 30);
  const exportacao = exportacaoRecebida?.id === exportacaoId ? exportacaoRecebida : null;
  const dialogoAberto = !!edicao || confirmarSugestoes || !!excluir;
  function url(dados: Record<string, string | null>) {
    const p = new URLSearchParams(search.toString()); for (const [k, v] of Object.entries(dados)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace("/contabil/sped?" + p, { scroll: false }); setPagina(1);
  }
  // A busca filtra na hora e só reescreve a URL quando a pessoa para de digitar (26/10/2026).
  function buscar(v: string) { setTermo(v); setPagina(1); clearTimeout(timerBusca.current); timerBusca.current = setTimeout(() => url({ busca: v }), 400); }
  useEffect(() => () => clearTimeout(timerBusca.current), []);
  function abrir(e: Edicao) { setErro(""); setEdicao(e); }
  async function carregarRegras() { try { setRegras(await consultar<RegrasContabeis>("regras", { cnpj: contexto.cnpj })); } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao consultar regras."); } }
  useEffect(() => {
    const c = new AbortController();
    consultar<RegrasContabeis>("regras", { cnpj: contexto.cnpj }, c.signal).then(setRegras).catch(e => { if (!c.signal.aborted) setErro(e.message); });
    return () => c.abort();
  }, [contexto.cnpj, pedido.revisao]);
  useEffect(() => {
    const c = new AbortController();
    if (!selecionada || selecionada.tipo !== "entradas") return;
    const alvo = selecionada;
    async function carregarDocumentos() {
      const linhas: Linha[] = [];
      try {
        for (const competencia of alvo.competencias) {
          const r = await consultar<{ documentos: Linha[] }>("documentos", { cnpj: contexto.cnpj, competencia, fornecedor: alvo.cnpj_fornecedor, cfop: alvo.cfop, incluir_dominio: String(contexto.incluir_dominio) }, c.signal);
          linhas.push(...r.documentos);
        }
        if (!c.signal.aborted) setConsultaDocs({ id: alvo.id, linhas });
      } catch (e) { if (!c.signal.aborted) setErro(e instanceof Error ? e.message : "Não foi possível consultar os documentos."); }
    }
    void carregarDocumentos();
    return () => c.abort();
  }, [selecionada, contexto.cnpj, contexto.incluir_dominio]);
  // O CSV de pendências é acompanhado aqui, na etapa 3, e não como a geração dos arquivos da etapa 4 (26/10/2026).
  useEffect(() => {
    const c = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    if (!exportacaoId) return;
    async function carregar() {
      try {
        const r = await consultar<PedidoContabil>("pedido", { id: exportacaoId!, cnpj: contexto.cnpj }, c.signal);
        if (c.signal.aborted) return; setExportacao(r); if (emAndamento(r)) timer = setTimeout(carregar, 5000);
      } catch (e) { if (!c.signal.aborted) setErro(e instanceof Error ? e.message : "Não foi possível consultar o arquivo de pendências."); }
    }
    void carregar(); return () => { c.abort(); clearTimeout(timer); };
  }, [exportacaoId, contexto.cnpj]);
  async function executar(operacao: string, dados: Linha, altera = true) {
    setErro(""); setOcupado(true);
    const assinatura = JSON.stringify({ operacao, dados, contexto });
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, valor: crypto.randomUUID() };
    try {
      const r = await comandar<PreviaCsv>(operacao, contexto, dados, chave.current.valor);
      chave.current = null;
      if (altera) { setEdicao(null); onAlterou(salvo(operacao)); await carregarRegras(); }
      return r;
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setOcupado(false); }
  }
  function editar(p: PendenciaContabil) {
    if (soNaOrigem(p)) return;
    if (p.tipo === "apoio") {
      const porCategoria = p.falta === "categoria" || p.falta === "debito" || p.falta === "codigo_debito";
      abrir({ operacao: porCategoria ? "categoria" : p.cnpj_fornecedor ? "credito-apoio" : "nome", titulo: "Definir contas — " + p.nome,
        valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, nome: p.nome, categoria: p.categoria ?? "", conta_credito: "", conta_debito: "", codigo_debito: "", cfop: p.cfop } });
    } else {
      const regraCfop = regras?.cfop.find(r => r.cfop === p.cfop);
      abrir({ operacao: "regra", titulo: "Definir contas — " + p.nome, valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, cfop: p.cfop, conta_debito: regraCfop?.conta_debito ?? "", conta_credito: "", sugestao: p.sugestao } });
    }
  }
  const definirContas = (p: PendenciaContabil, depois?: () => void) => soNaOrigem(p) ? <span className="self-center text-helper text-fg-muted">Revisar na origem</span> : <Button size="sm" variant="secondary" disabled={!podeGravar} onClick={() => { editar(p); depois?.(); }}>Definir contas</Button>;
  async function baixarPendencias() {
    const r = await executar("gerar", { referencia: pedido.id, formato: "pendencias", aceitar_parcial: true }, false) as unknown as { id?: string } | undefined;
    if (r?.id) { setExportacao(null); setExportacaoId(String(r.id)); }
  }
  return <section className="space-y-4" aria-labelledby="titulo-pendencias">
    <div><h2 id="titulo-pendencias" className="text-card-title font-semibold text-fg">Resolva o que falta</h2>
    <p className="mt-1 text-label text-fg-secondary">Veja os documentos antes de definir as contas. As regras salvas serão reutilizadas nas próximas consultas.</p></div>
    {!podeGravar && <Aviso tom="info">{config.permissoes.agir ? "A consulta está disponível. Configure o token de escrita contábil para salvar regras e importar preenchimentos." : "Seu acesso permite consultar e exportar. Alterações exigem permissão de ação no setor."}</Aviso>}
    {erro && !dialogoAberto && <Aviso>{erro}</Aviso>}
    <div className="flex flex-wrap items-start justify-between gap-3">
      <SegmentedControl label="Visão das pendências" active={visao} onChange={v => url({ visao: v })} items={[{ key: "pendencias", label: "Pendências", contagem: todas.length }, { key: "regras", label: "Regras cadastradas" }, { key: "importar", label: "Preencher por CSV" }]} />
      {contexto.periodo.length === 7 && <div className="flex flex-col items-end gap-1"><Button size="sm" variant="secondary" disabled={!podeGravar || ocupado || !regras?.cfop.length} onClick={() => setConfirmarSugestoes(true)}>Aplicar sugestões do período</Button>{podeGravar && regras && !regras.cfop.length && <p className="text-helper text-fg-muted">Cadastre uma conta por CFOP para aplicar as sugestões.</p>}</div>}
    </div>
    {visao === "pendencias" && <>
      <div className="flex flex-wrap gap-3"><div className="flex-1 min-w-48"><CampoDeBusca aria-label="Buscar fornecedor, documento ou motivo" placeholder="Buscar fornecedor, documento ou motivo" value={termo} onChange={e => buscar(e.target.value)} /></div><Select aria-label="Tipo de pendência" className="w-full sm:max-w-60" value={tipo} onChange={e => url({ tipo: e.target.value })}><option value="">Todos os tipos</option>{contexto.tipos.map(t => <option key={t} value={t}>{rotuloTipo(t)}</option>)}</Select></div>
      {!filtradas.length && <Aviso tom="neutro">{todas.length ? "Nenhuma pendência corresponde à busca." : "Nenhuma pendência nos dados consultados. Você pode revisar os arquivos."}</Aviso>}
      <div className="space-y-2">{filtradas.slice((pagina - 1) * 30, pagina * 30).map(p => <Card as="section" key={p.id} className="p-4 text-label">
        <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold text-fg">{p.nome || documentoNaTela(p.cnpj_fornecedor) || p.categoria}</h3><p className="text-fg-secondary">{[documentoNaTela(p.cnpj_fornecedor), p.cfop && "CFOP " + p.cfop, rotuloTipo(p.tipo)].filter(Boolean).join(" · ")}</p></div><p>{p.qtd} documentos · {moeda(p.valor)}</p></div>
        <p className="mt-2">{p.motivo}</p>
        {p.sugestao && <p className="text-fg-secondary mt-1">Há uma sugestão de conta para conferir. Ela só será aplicada após sua confirmação.</p>}
        <div className="flex flex-wrap gap-2 mt-3"><Button size="sm" variant="secondary" onClick={() => url({ detalhe: p.id })}>Ver documentos</Button>{definirContas(p)}{p.tipo === "entradas" && <Button size="sm" variant="ghost" disabled={!podeGravar} onClick={() => abrir({ operacao: "desconsiderar", titulo: "Desconsiderar lançamento", valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, cfop: p.cfop, escopo: "fornecedor", motivo: "" } })}>Desconsiderar</Button>}</div>
      </Card>)}</div>
      {paginas > 1 && <div className="flex justify-between items-center text-label"><Button size="sm" variant="ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span>Página {pagina} de {paginas}</span><Button size="sm" variant="ghost" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Próxima</Button></div>}
    </>}
    {visao === "regras" && (!regras ? <p role="status" className="text-label text-fg-secondary">Consultando as regras…</p> : <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[["regra", "Nova regra de fornecedor"], ["cfop", "Conta por CFOP"], ["categoria", "Conta por categoria"], ["nome", "Conta por nome"]].map(([operacao, titulo]) => <Button key={operacao} size="sm" variant="secondary" disabled={!podeGravar} onClick={() => abrir({ operacao, titulo, valores: {} })}>{titulo}</Button>)}</div>
      {(["fornecedor", "cfop", "categoria", "nome"] as const).map(grupo => { const linhas = regras[grupo]; return <Card key={grupo} className="p-4"><Accordion titulo={<span className="font-semibold text-fg">{({ fornecedor: "Fornecedores e desconsiderações", cfop: "Contas por CFOP", categoria: "Contas por categoria", nome: "Contas por nome" })[grupo]} ({linhas.length})</span>}><TabelaRegras linhas={linhas} podeGravar={podeGravar} podeExcluir={config.permissoes.excluir && config.escrita} onEditar={l => abrir({ operacao: ({ fornecedor: "regra", cfop: "cfop", categoria: "categoria", nome: "nome" })[grupo], titulo: "Editar regra", valores: l })} onRemover={l => { setErro(""); setExcluir({ operacao: grupo === "fornecedor" ? "remover-regra" : grupo === "cfop" ? "remover-cfop" : grupo === "categoria" ? "remover-categoria" : "remover-nome", dados: grupo === "fornecedor" ? { registro_id: l.id } : grupo === "cfop" ? { cfop: l.cfop } : grupo === "categoria" ? { categoria: l.categoria } : { chave_nome: l.chave_nome } }); }} onReconsiderar={l => executar("reconsiderar", { cnpj_fornecedor: l.cnpj_fornecedor, cfop: l.cfop })} /></Accordion></Card>; })}
    </div>)}
    {visao === "importar" && <Card className="space-y-4 p-5">
      <div><h3 className="font-semibold text-fg">Baixe, preencha e devolva o mesmo arquivo</h3><p className="mt-1 text-label text-fg-secondary">1. Baixe as pendências. 2. Preencha as contas no CSV. 3. Importe e confira a prévia antes de salvar. Reenviar uma correção atualiza a regra existente.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" disabled={ocupado || emAndamento(exportacao)} onClick={() => void baixarPendencias()}>{emAndamento(exportacao) ? "Preparando o arquivo…" : exportacao ? "Preparar novamente" : "Baixar pendências"}</Button>
        {exportacao && <EstadoContabil estado={exportacao.estado} />}
        {exportacao?.estado === "concluida" && exportacao.arquivos.map(a => <Button key={a.chave} size="sm" href={"/api/contabil/sped/arquivo?" + new URLSearchParams({ id: exportacao.id, cnpj: contexto.cnpj, chave: a.chave })} download title={a.nome}>Baixar {a.nome}</Button>)}
      </div>
      {exportacao && (exportacao.estado === "erro" || exportacao.estado === "parada") && <Aviso tom="atencao">{exportacao.erro ?? "Não foi possível preparar o arquivo de pendências. Tente novamente."}</Aviso>}
      {podeGravar ? <Campo nome="CSV preenchido"><FileDropzoneField key={envio} name="csv" accept=".csv,text/csv" maxSizeMb={3} compacto onFileChange={async f => { setPrevia(null); setCsv(f ? await f.text() : ""); }} /></Campo> : <p className="text-label text-fg-secondary">Importar o CSV preenchido exige permissão de ação e o token de escrita contábil.</p>}
      {podeGravar && <div className="flex flex-col items-start gap-1"><Button disabled={!csv || ocupado} onClick={() => executar("previa-csv", { csv }, false).then(r => { if (r) setPrevia(r); })}>Conferir preenchimento</Button>{!csv && <p className="text-helper text-fg-muted">Escolha o CSV preenchido para conferir.</p>}</div>}
      {previa && <><Aviso tom="info">{previa.inclusoes} novas regras · {previa.atualizacoes} atualizações · {previa.ignoradas} linhas ignoradas.</Aviso>{!!previa.erros.length && <Aviso><ul className="list-disc pl-4">{previa.erros.map(e => <li key={e}>{e}</li>)}</ul></Aviso>}<ListaDados linhas={previa.amostra} /><div className="flex flex-col items-start gap-1"><Button disabled={ocupado || !podeGravar || !!previa.erros.length} onClick={() => executar("importar-csv", { csv, hash: previa.hash }).then(r => { if (r) { setPrevia(null); setCsv(""); setEnvio(v => v + 1); } })}>Confirmar importação</Button>{!!previa.erros.length && <p className="text-helper text-fg-muted">Corrija as linhas com erro no CSV e envie de novo.</p>}</div></>}
    </Card>}
    <SlideOver open={!!selecionada} onClose={() => url({ detalhe: null })} title={selecionada?.nome || "Documentos"} width="max-w-2xl" fundo="leve">
      {selecionada && <><p className="text-label">{selecionada.qtd} documentos · {moeda(selecionada.valor)} · {selecionada.competencias.map(periodoNaTela).join(", ")}</p><p className="text-label my-3">{selecionada.motivo}</p>{carregandoDocs ? <p role="status" className="text-label text-fg-secondary">Consultando os documentos…</p> : documentos ? <ListaDados linhas={documentos} /> : <p className="text-label">Consulte os exemplos e a origem nos detalhes dos pagamentos, na etapa Conferir dados.</p>}{selecionada.sugestao && <Accordion titulo="Conferir sugestão de conta"><ListaDados linhas={[selecionada.sugestao]} /></Accordion>}<div className="mt-3 flex">{definirContas(selecionada, () => url({ detalhe: null }))}</div></>}
    </SlideOver>
    <SlideOver open={!!edicao} onClose={() => setEdicao(null)} title={edicao?.titulo} width="max-w-2xl" fundo="leve">{edicao && <FormRegra key={JSON.stringify(edicao)} edicao={edicao} categorias={regras?.categorias ?? []} contexto={contexto} ocupado={ocupado} onSalvar={d => executar(edicao.operacao, d)} erro={erro} />}</SlideOver>
    <ConfirmDialog open={confirmarSugestoes} pending={ocupado} error={erro || null} title="Aplicar sugestões conferidas?" description="Serão usadas somente contas de crédito de nome idêntico ao fornecedor e as contas de débito que você já cadastrou por CFOP. Sugestões por semelhança continuam para revisão individual." confirmLabel="Aplicar sugestões" onCancel={() => setConfirmarSugestoes(false)} onConfirm={() => { if (regras) void executar("sugestoes", { contas_debito: JSON.stringify(Object.fromEntries(regras.cfop.map(r => [texto(r.cfop), texto(r.conta_debito)]))), semelhanca_minima: 1 }).then(r => { if (r) setConfirmarSugestoes(false); }); }} />
    <ConfirmDialog destructive pending={ocupado} error={erro || null} open={!!excluir} title="Remover regra?" description="Os documentos que dependem desta regra poderão voltar a ficar pendentes. Os arquivos já gerados permanecem no histórico." confirmLabel="Remover regra" onCancel={() => setExcluir(null)} onConfirm={() => { if (excluir) void executar(excluir.operacao, excluir.dados).then(r => { if (r) setExcluir(null); }); }} />
  </section>;
}
function TabelaRegras({ linhas, podeGravar, podeExcluir, onEditar, onRemover, onReconsiderar }: { linhas: Linha[]; podeGravar: boolean; podeExcluir: boolean; onEditar: (l: Linha) => void; onRemover: (l: Linha) => void; onReconsiderar: (l: Linha) => void }) {
  const [busca, setBusca] = useState(""); const [pagina, setPagina] = useState(1);
  const filtradas = linhas.filter(l => Object.values(l).some(v => texto(v).toLowerCase().includes(busca.toLowerCase())));
  const paginas = Math.ceil(filtradas.length / 20);
  // As ações da linha no "⋯", como nas outras listas; Remover só aparece para quem pode excluir (26/10/2026).
  return <div className="mt-4 space-y-3"><CampoDeBusca aria-label="Buscar regra" placeholder="Buscar fornecedor, CFOP, nome ou conta" value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} />{filtradas.slice((pagina - 1) * 20, pagina * 20).map((l, i) => <div key={i} className="flex items-start justify-between gap-3 border-b border-border py-3 text-label"><div className="min-w-0"><strong className="text-fg">{texto(l.nome_fornecedor || l.nome || l.descricao || l.categoria || l.cfop)}</strong><p className="text-fg-secondary">{[documentoNaTela(texto(l.cnpj_fornecedor)), l.cfop ? "CFOP " + texto(l.cfop) : "", "Débito: " + (texto(l.conta_debito || l.codigo_debito) || "—"), "Crédito: " + (texto(l.conta_credito) || "—"), l.desconsiderar ? "Desconsiderada: " + texto(l.motivo_desconsiderar) : ""].filter(Boolean).join(" · ")}</p></div>
    <MenuDeMaisAcoes rotulo="Ações da regra">{({ close }) => <>{podeGravar && <ItemDoMenu onClick={() => { close(); onEditar(l); }}>Editar</ItemDoMenu>}{podeGravar && !!l.desconsiderar && <ItemDoMenu onClick={() => { close(); onReconsiderar(l); }}>Reconsiderar</ItemDoMenu>}{podeExcluir && <ItemDoMenu danger onClick={() => { close(); onRemover(l); }}>Remover</ItemDoMenu>}</>}</MenuDeMaisAcoes>
  </div>)}<div className="flex justify-between items-center text-label">{paginas > 1 && <Button size="sm" variant="ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>}<span className="text-fg-secondary">{filtradas.length} regras{paginas > 1 && ` · Página ${pagina} de ${paginas}`}</span>{paginas > 1 && <Button size="sm" variant="ghost" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Próxima</Button>}</div></div>;
}
type CampoDaRegra = [chave: string, nome: string, helper?: string];
function FormRegra({ edicao, categorias, contexto, ocupado, onSalvar, erro }: { edicao: Edicao; categorias: { categoria: string; rotulo: string }[]; contexto: ContextoContabil; ocupado: boolean; onSalvar: (d: Linha) => void; erro: string }) {
  const [usarSugestao, setUsarSugestao] = useState(false);
  const sugestao = edicao.valores.sugestao as Linha | undefined;
  const [contas, setContas] = useState<Linha[]>([]); const [buscaConta, setBuscaConta] = useState("");
  const [buscandoContas, setBuscandoContas] = useState(false); const [erroContas, setErroContas] = useState("");
  useEffect(() => {
    if (!buscaConta) return; const c = new AbortController();
    const t = setTimeout(() => { setBuscandoContas(true); setErroContas(""); consultar<{ contas: Linha[] }>("contas", { cnpj: contexto.cnpj, busca: buscaConta }, c.signal).then(r => setContas(r.contas)).catch(e => { if (!c.signal.aborted) setErroContas(e instanceof Error ? e.message : "Não foi possível buscar as contas."); }).finally(() => setBuscandoContas(false)); }, 350);
    return () => { clearTimeout(t); c.abort(); };
  }, [buscaConta, contexto.cnpj]);
  const campos: CampoDaRegra[] = edicao.operacao === "credito-apoio" ? [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["nome_fornecedor", "Nome do fornecedor"], ["conta_credito", "Conta de crédito"]] : edicao.operacao === "desconsiderar" ? [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["cfop", "CFOP"], ["motivo", "Motivo"]] : edicao.operacao === "cfop" ? [["cfop", "CFOP"], ["conta_debito", "Conta de débito"]] : edicao.operacao === "categoria" ? [["categoria", "Categoria"], ["descricao", "Descrição"], ["codigo_debito", "Conta de débito"], ["conta_credito", "Conta de crédito", "Opcional."]] : edicao.operacao === "nome" ? [["nome", "Nome do fornecedor"], ["conta_credito", "Conta de crédito"]] : [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["nome_fornecedor", "Nome do fornecedor"], ["cfop", "CFOP", "Deixe vazio para valer em qualquer CFOP deste fornecedor."], ["conta_debito", "Conta de débito"], ["conta_credito", "Conta de crédito"]];
  return <form onSubmit={e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget).entries()); for (const c of ["conta_debito","conta_credito","codigo_debito"]) if (typeof d[c] === "string") d[c] = d[c].split(" — ")[0]; onSalvar(d); }} className="space-y-4">
    <Aviso tom="info">{edicao.operacao === "desconsiderar" ? "A desconsideração continuará valendo nas próximas consultas. Você poderá reconsiderar pela lista de regras." : "Esta regra será reutilizada nos documentos que correspondam ao fornecedor, CFOP, categoria ou nome informado, inclusive em outros períodos. Sugestões precisam ser conferidas antes de salvar."}</Aviso>
    {erro && <Aviso>{erro}</Aviso>}
    {sugestao && <Aviso tom="neutro">Sugestão para conferir: {texto(sugestao.nome)} · {texto(sugestao.codigo_reduzido || sugestao.classificacao)}. <Button variant="link" onClick={() => setUsarSugestao(true)}>Usar esta sugestão no formulário</Button></Aviso>}
    {campos.map(([chave, nome, helper]) => <Campo nome={nome} helper={helper} key={chave}>{chave === "categoria" ? <Select name={chave} defaultValue={texto(edicao.valores[chave])} required><option value="">Escolha a categoria</option>{categorias.map(c => <option key={c.categoria} value={c.categoria}>{c.rotulo}</option>)}</Select> : chave.includes("conta") || chave === "codigo_debito" ? <CampoComSugestoes key={chave + String(usarSugestao)} name={chave} defaultValue={usarSugestao && chave === "conta_credito" ? texto(sugestao?.codigo_reduzido || sugestao?.classificacao) : texto(edicao.valores[chave])} sugestoes={contas.map(c => texto(c.codigo_reduzido || c.classificacao) + " — " + texto(c.nome))} onChange={e => setBuscaConta(e.target.value)} required={edicao.operacao !== "categoria"} /> : <Input name={chave} defaultValue={texto(edicao.valores[chave])} required={["categoria", "motivo"].includes(chave)} />}</Campo>)}
    {buscandoContas ? <p role="status" className="text-helper text-fg-muted">Buscando contas…</p> : erroContas && <Aviso tom="atencao">{erroContas}</Aviso>}
    {edicao.operacao === "desconsiderar" && <Campo nome="Aplicar a"><Select className="w-full" name="escopo" defaultValue="fornecedor"><option value="fornecedor">Somente este fornecedor e CFOP</option><option value="cfop">Todos os fornecedores deste CFOP</option></Select></Campo>}
    {edicao.operacao === "regra" && <Accordion titulo="Opções adicionais"><Aviso tom="atencao" className="my-3">Data e valor preenchidos substituem os valores de todos os documentos abrangidos por esta regra. Deixe vazios para manter cada documento.</Aviso><div className="space-y-3">{[["codigo_historico", "Código do histórico"], ["historico", "Complemento do histórico"], ["data_lancamento", "Data do lançamento"], ["valor", "Valor"], ["inicia_lote", "Inicia lote"], ["codigo_filial", "Código matriz/filial"], ["centro_custo_debito", "Centro de custo débito"], ["centro_custo_credito", "Centro de custo crédito"], ["observacao", "Observação"]].map(([c, n]) => c === "inicia_lote"
      // O motor recebe "S" ou vazio, como no campo de texto de antes (26/10/2026).
      ? <Switch key={c} name={c} value="S" valorDesligado="" defaultChecked={texto(edicao.valores[c]).toUpperCase() === "S"} rotulo="Inicia lote" />
      : <Campo key={c} nome={n}>{c === "data_lancamento" ? <CampoData name={c} defaultValue={texto(edicao.valores[c])} /> : <Input name={c} inputMode={c === "valor" ? "decimal" : undefined} defaultValue={texto(edicao.valores[c])} />}</Campo>)}</div></Accordion>}
    <Button type="submit" disabled={ocupado}>{ocupado ? "Salvando…" : edicao.operacao === "desconsiderar" ? "Confirmar desconsideração" : "Salvar regra"}</Button>
  </form>;
}
