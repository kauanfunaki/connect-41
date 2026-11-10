"use client";
import { iconeDaAbaFiscal } from "@/components/fiscal/iconeDaAbaFiscal";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArchiveRestore, Download, FileText, Plus, Settings2, Upload } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { FilterButton, FilterButtonSection } from "@/components/ui/FilterButton";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { formatCnpj, formatInstantDateTime, formatarNumero } from "@/lib/format";
import { uploadComProgresso } from "@/lib/uploadComProgresso";
import { formatarRaiz } from "./AbrangenciaLocalSped";
import { dadosDoApoio, FormularioLocalSped, novoApoio, type EdicaoSped } from "./FormularioLocalSped";
import { CartaoDaGeracao, FaltasDoArquivo, ROTULO_DA_OBRIGACAO, SinalDoAgente, hrefDoGerado, rotuloDoTipo, useGeracoes, type GeracaoDaEstacao } from "./AcompanhamentoDaGeracao";
import type { BaseLocal } from "@/lib/fiscal/sped/local/servidor";
import { quadroPorCfop } from "@/lib/fiscal/sped/local/calculo";
import { reaisExatos, somar, type ContextoLocal, type Obrigacao, type ProdutoFiscal, type DocumentoEscriturado, type ItemFiscal } from "@/lib/fiscal/sped/local/dominio";
import { hrefDoSped, type EtapaDoSped } from "@/lib/fiscal/sped/etapas";
import type { ContadoresDoAcervo } from "@/lib/fiscal/sped/local/acervo";
import type { RespostaDoAcervo, ResumoDoAcervo } from "@/lib/fiscal/sped/local/acervoServidor";

/** O andamento do "Trazer do acervo" na tela: o resumo da primeira volta e a soma dos lotes. */
type ResultadoDoAcervo = { resumo: ResumoDoAcervo; contadores: ContadoresDoAcervo; pedidos: number; retomados: number; lidos: number; recusados: number; restantes: number; pausado: boolean; erro: string | null; em: string };
const numero = (n: number) => formatarNumero(n, 0);
/**
 * O último "Trazer do acervo" de cada recorte (empresa, competência, abrangência). A estação
 * remonta quando a revisão muda — e cada XML lido muda a revisão —, então o resultado fica
 * fora dela para sobreviver ao refresh do fim. Só o navegador escreve aqui.
 */
const acervosDaSessao = new Map<string, ResultadoDoAcervo>();

type Props = { aba: EtapaDoSped; empresa: { id: string; nome: string; cnpj: string }; contexto: ContextoLocal; base: BaseLocal; pode: boolean; direitos: { importar: boolean; configurar: boolean; entregas: boolean; icms: boolean; contribuicoes: boolean }; grupo: { id: string; nome: string; cnpj: string }[]; vistaInicial?: string; geracao: GeracaoDaEstacao };
const reais = reaisExatos;
const VISTAS: Record<EtapaDoSped, [string, string][]> = {
  classificacao: [["produtos", "Produtos"], ["apoio", "Documentos sem nota"], ["decisoes", "Decisões registradas"]],
  apuracao: [["apuracao", "Apuração"], ["livro", "Livro fiscal"], ["ajustes", "Ajustes e parâmetros"]],
  fechamento: [["resumo", "Resumo"], ["documentos", "Documentos"], ["faturamento", "Faturamento"], ["pagamentos", "Pagamentos e contratos"], ["conferencias", "Conferências"]], gerar: [],
};
const semAssinatura = () => () => {};
export function EstacaoSped({ aba, empresa, contexto, base, pode, direitos, grupo, vistaInicial, geracao }: Props) {
  const hidratado = useSyncExternalStore(semAssinatura, () => true, () => false);
  const router = useRouter(), caminho = usePathname(), params = useSearchParams();
  const vista = VISTAS[aba].some(([k]) => k === vistaInicial) ? vistaInicial! : VISTAS[aba][0]?.[0];
  const [busca, setBusca] = useState(""), [filtro, setFiltro] = useState("todos"), [cfop, setCfop] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]), [edicao, setEdicao] = useState<EdicaoSped | null>(null), [detalhe, setDetalhe] = useState<string | null>(null), [resultadoId, setResultadoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null), [ocupado, setOcupado] = useState(false), [importando, setImportando] = useState(false);
  const parar = useRef(false), [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const chaveDoAcervo = `${empresa.id}:${contexto.competencia}:${contexto.consolidado ? "raiz" : "empresa"}`;
  const [acervo, setAcervoNaTela] = useState<ResultadoDoAcervo | null>(() => acervosDaSessao.get(chaveDoAcervo) ?? null), [trazendo, setTrazendo] = useState(false);
  const setAcervo = (r: ResultadoDoAcervo) => { acervosDaSessao.set(chaveDoAcervo, r); setAcervoNaTela(r); };
  const aImportar = fila.filter(a => a.estado !== "concluido").length;
  const naFila = (id: string, mudanca: Partial<ArquivoNaFila>) => setFila(f => f.map(a => a.id === id ? { ...a, ...mudanca } : a));
  const [obrigacao, setObrigacao] = useState<Obrigacao>(params.get("obrigacao") === "contribuicoes" || !direitos.icms ? "contribuicoes" : "icms_ipi");
  const [tipoSped, setTipoSped] = useState<"0" | "1">("0"), [chaveGeracao, setChaveGeracao] = useState(() => crypto.randomUUID());
  const apuracao = obrigacao === "icms_ipi" ? base.icms : base.contribuicoes;
  const perfil = base.perfis.find(p => p.companyId === empresa.id);
  const abrirPerfil = () => setEdicao({ tipo: "perfil", dados: { ...perfil, empresaId: empresa.id } });
  // O cadastro que o agente exige para o ICMS/IPI (06/11/2026): com falta, o pedido nem vai para a fila.
  const faltasDoArquivo = obrigacao === "icms_ipi" ? geracao.faltas : [];
  // O andamento das gerações pela fila do Connect (06/11/2026): relido enquanto há uma aberta.
  const vivas = useGeracoes(geracao, { empresa: empresa.id, competencia: contexto.competencia }, aba === "gerar");
  const href = (mudancas: Record<string, string>) => { const q = new URLSearchParams(params); q.set("empresa", empresa.id); q.set("competencia", contexto.competencia); for (const [k, v] of Object.entries(mudancas)) q.set(k, v); return `${caminho}?${q}`; };
  const exportar = (formato: string) => `/api/fiscal/sped/local/exportar?empresa=${empresa.id}&competencia=${contexto.competencia}&aba=${aba}&obrigacao=${obrigacao}&escopo=${contexto.consolidado ? "raiz" : "empresa"}&vista=${vista ?? ""}&cfop=${params.get("cfop") ?? ""}&formato=${formato}`;
  async function executar(acao: string, dados: Record<string, unknown>, atualizar = true) {
    setErro(null);
    const r = await fetch("/api/fiscal/sped/local/acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: empresa.id, competencia: contexto.competencia, revisao: base.revisao, aba, acao, dados }) });
    const resposta = await r.json();
    if (!r.ok) throw Object.assign(new Error(resposta.error ?? "Não foi possível concluir a ação."), { status: r.status });
    if (atualizar) { setMensagem(resposta.mensagem ?? "Operação concluída."); router.refresh(); }
    return resposta;
  }
  async function acao(operacao: string, dados: Record<string, unknown>) { setOcupado(true); try { await executar(operacao, dados); if (operacao === "gerar") setChaveGeracao(crypto.randomUUID()); } catch(e) { setErro(e instanceof Error ? e.message : "Falha na operação."); } finally { setOcupado(false); } }
  async function processar(ids: string[]) {
    for (const id of ids) {
      let estado = "pendente";
      while (!parar.current && ["pendente", "processando"].includes(estado)) {
        const r = await executar("processar", { id }, false); estado = r.estado;
        setMensagem(`Importação: ${r.cursor ?? 0} de ${r.total ?? "?"} registro(s).`);
        if (estado === "processando") break; // Outro executor tem a lease. A retomada é explícita.
      }
    }
    router.refresh();
  }
  async function importar() {
    const arquivos = fila.filter(a => a.estado !== "concluido"); if (!arquivos.length) return;
    setImportando(true); parar.current = false; setErro(null);
    try {
      // Os que já entraram ficam na fila como enviados e não sobem de novo.
      for (const item of arquivos) {
        if (parar.current) break;
        setMensagem(`Enviando ${item.file.name}…`);
        naFila(item.id, { estado: "enviando", progresso: 0, erro: undefined });
        const f = new FormData(); f.set("empresa", empresa.id); f.set("aba", aba); f.set("arquivo", item.file);
        const r = await uploadComProgresso("/api/fiscal/sped/local/importar", f, progresso => naFila(item.id, { progresso }));
        try {
          if (!r.ok) throw new Error(r.erro);
          await processar((r.body as { ids: string[] }).ids); naFila(item.id, { estado: "concluido", progresso: 100 });
        } catch(e) { naFila(item.id, { estado: "erro", erro: e instanceof Error ? e.message : "Falha na importação." }); throw e; }
      }
      setMensagem(parar.current ? "Importação pausada. Os registros concluídos foram preservados." : "Importação concluída. Confira os resultados por arquivo.");
    } catch(e) { setErro(e instanceof Error ? e.message : "Falha na importação."); } finally { setImportando(false); router.refresh(); }
  }
  /**
   * Uma importação do acervo, lida como no envio manual. O XML que a leitura recusa (422) não
   * para a rodada: fica com o motivo nos resultados da importação, e a próxima segue.
   */
  async function lerDoAcervo(id: string, dona: string): Promise<"lido" | "recusado"> {
    let estado = "pendente";
    try {
      while (!parar.current && ["pendente", "processando"].includes(estado)) {
        estado = (await executar("processar", { id, empresa: dona }, false)).estado;
        if (estado === "processando") break; // Outro executor tem a lease.
      }
    } catch (e) { if ((e as { status?: number }).status === 422) return "recusado"; throw e; }
    return "lido";
  }
  /**
   * Trazer do acervo (10/11/2026): pede ao motor os XMLs do acervo que ainda não estão na
   * escrituração, um lote por vez, e lê cada lote na fila como um envio manual.
   */
  async function trazerDoAcervo() {
    if (importando) return;
    setImportando(true); setTrazendo(true); parar.current = false; setErro(null); setMensagem("Conferindo o acervo desta competência…");
    let depois: string | null = null, tamanho = 500, total: ResultadoDoAcervo | null = null;
    const mostrar = (mudanca: Partial<ResultadoDoAcervo>) => { if (total) { total = { ...total, ...mudanca }; setAcervo(total); } };
    const ler = async (ids: string[], dona: string) => {
      for (const id of ids) {
        if (parar.current || !total) break;
        setMensagem(`Lendo os XMLs na escrituração: ${numero(total.lidos + total.recusados + 1)} de ${numero(total.contadores.naFila + total.retomados)}…`);
        const r = await lerDoAcervo(id, dona);
        mostrar(r === "lido" ? { lidos: total.lidos + 1 } : { recusados: total.recusados + 1 });
      }
    };
    try {
      for (;;) {
        const r = await fetch("/api/fiscal/sped/local/acervo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: empresa.id, competencia: contexto.competencia, aba, escopo: contexto.consolidado ? "raiz" : "empresa", obrigacao, depois, tamanho }) });
        const corpo = await r.json().catch(() => ({})) as Partial<RespostaDoAcervo> & { error?: string };
        if (!r.ok || !corpo.resumo) throw new Error(corpo.error ?? "Não foi possível trazer do acervo.");
        if (!total) {
          const retomados = (corpo.retomar ?? []).reduce((s, g) => s + g.ids.length, 0);
          total = { resumo: corpo.resumo, contadores: { naFila: 0, semXml: 0, naoEncontrados: 0, grandesDemais: 0, cteFora: 0 }, pedidos: 0, retomados, lidos: 0, recusados: 0, restantes: corpo.resumo.aPedir, pausado: false, erro: null, em: new Date().toISOString() };
          setAcervo(total);
          // O que uma rodada anterior deixou na fila é lido antes de pedir mais ao motor.
          for (const g of corpo.retomar ?? []) await ler(g.ids, g.empresa);
        }
        if (!corpo.lote || parar.current) { mostrar({ restantes: corpo.restantes ?? 0 }); break; }
        depois = corpo.depois ?? null; tamanho = corpo.tamanho ?? tamanho;
        const c = corpo.lote.contadores;
        mostrar({ pedidos: total.pedidos + corpo.lote.pedidos, contadores: { naFila: total.contadores.naFila + c.naFila, semXml: total.contadores.semXml + c.semXml, naoEncontrados: total.contadores.naoEncontrados + c.naoEncontrados, grandesDemais: total.contadores.grandesDemais + c.grandesDemais, cteFora: total.contadores.cteFora + c.cteFora }, restantes: corpo.restantes ?? 0 });
        await ler(corpo.lote.ids, corpo.lote.empresa);
        if (parar.current || !corpo.restantes) break;
        setMensagem(`Pedindo ao motor os XMLs: ${numero(total.pedidos)} de ${numero(total.resumo.aPedir)} documento(s)…`);
      }
      mostrar({ pausado: parar.current });
      setMensagem(null);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : "Não foi possível trazer do acervo.";
      // Com a rodada começada, o erro fica no painel: o refresh do fim remonta a tela e levaria o aviso solto.
      setMensagem(null);
      if (total) mostrar({ erro: motivo }); else setErro(motivo);
    } finally { setImportando(false); setTrazendo(false); router.refresh(); }
  }
  const botaoDoAcervo = (variant: "primary" | "secondary") => <div className="flex flex-wrap items-center gap-2">
    <Button size="sm" variant={variant} disabled={importando} loading={trazendo} loadingLabel="Trazendo do acervo…" onClick={() => void trazerDoAcervo()} title={contexto.consolidado ? "Pede ao motor os XMLs do acervo da matriz e das filiais do grupo, nesta competência" : "Pede ao motor os XMLs do acervo desta empresa, nesta competência"}><ArchiveRestore size={14} /> Trazer do acervo</Button>
    {trazendo && <Button size="sm" variant="ghost" onClick={() => { parar.current = true; }}>Pausar após o documento atual</Button>}
  </div>;
  function classificar(produtos: ProdutoFiscal[]) {
    const p = produtos[0];
    setEdicao({ tipo: "classificar", chaves: produtos.map(p => p.chave), produto: produtos.length === 1 ? p : undefined, dados: produtos.length === 1 ? { ...(p.classificacao ?? { tipoItem: p.tipoItem, definicao: p.cfop?.slice(1) ?? "", creditoPisCofins: "", observacao: "" }), credito: p.creditoDecidido } : { tipoItem: "__manter__", creditoPisCofins: "__manter__", definicao: "", observacao: "" } });
  }
  function editarTributacao(doc: DocumentoEscriturado, item: ItemFiscal) {
    const decisao = base.decisoes.find(d => d.tipo === "tributacao" && d.chave === `${doc.cnpjEmpresa}|${doc.competencia}|${doc.id}|${item.ordem}`)?.dados;
    const dados: Record<string, unknown> = { documentoId: doc.id, ordem: item.ordem, obrigacao };
    for (const tributo of ["icms", "ipi", "pis", "cofins"] as const) {
      const valores = (decisao?.[tributo] ?? item[tributo]) as Record<string, unknown>;
      for (const [k, v] of Object.entries(valores)) dados[`${tributo}.${k}`] = v;
    }
    setDetalhe(null); setEdicao({ tipo: "tributacao", dados });
  }
  const produtos = base.produtos.filter(p => `${p.descricao} ${p.codigo} ${p.fornecedor} ${p.ncm}`.toLowerCase().includes(busca.toLowerCase()) && (!cfop || p.cfop?.includes(cfop)) && (filtro === "todos" || filtro === "pendentes" && !p.decidido || filtro === "decididos" && p.decidido || filtro === "simples" && p.simples));
  const documentos = base.documentos.filter(d => `${d.numero} ${d.emitente} ${d.nomeEmitente} ${d.identidade}`.toLowerCase().includes(busca.toLowerCase()));
  const apoio = base.apoios.filter(a => `${a.nome} ${a.documento} ${a.identidade}`.toLowerCase().includes(busca.toLowerCase()));
  const daObrigacao = vivas.geracoes.filter(g => g.obrigacao === obrigacao);
  const ultima = daObrigacao[0], aberta = daObrigacao.find(g => g.aberta);
  const documento = base.documentos.find(d => d.id === detalhe);
  return <div data-testid="sped-estacao" data-hidratado={hidratado} className="space-y-5 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-helper text-fg-secondary">{empresa.nome} · {formatCnpj(empresa.cnpj)} · revisão {base.revisao}</p>
      <div className="flex flex-wrap gap-2">
        {direitos.configurar && <Button variant="ghost" size="sm" title="Obrigações da empresa; o resto vem do cadastro" onClick={abrirPerfil}><Settings2 size={14} /> Editar perfil fiscal</Button>}
        {aba !== "gerar" && <><Button variant="secondary" size="sm" href={exportar("xlsx")} download title="Baixa a visão aberta desta competência numa planilha Excel"><Download size={14} /> Exportar em Excel</Button><Button variant="ghost" size="sm" href={exportar("csv")} download title="Baixa a visão aberta desta competência num arquivo CSV"><Download size={14} /> Exportar em CSV</Button></>}
      </div>
    </div>
    {!!perfil?.faltando.length && <Aviso tom="atencao">Complete no <a className="underline" href={`/empresas/${empresa.id}`}>cadastro da empresa</a>: {perfil.faltando.join(", ")}. Você já pode importar e conferir os documentos.</Aviso>}
    {!perfil?.obrigacoes.length && <Aviso tom="atencao">Escolha no perfil fiscal as obrigações da empresa. Você já pode importar e conferir os documentos.</Aviso>}
    {base.acervo.length > 0 && <Aviso tom="atencao"><div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="min-w-0 flex-1 basis-80">Há {numero(base.acervo.length)} documento(s) no acervo do Connect ainda sem itens nesta escrituração. Eles aparecem no Fechamento e não entram nos valores apurados até a importação dos itens.{aba === "gerar" && direitos.importar && <> <a className="underline" href={hrefDoSped("fechamento", { empresa: empresa.id, competencia: contexto.competencia }, { escopo: contexto.consolidado ? "raiz" : null })}>Trazer do acervo no Fechamento</a>.</>}</span>
      {aba !== "gerar" && direitos.importar && botaoDoAcervo("secondary")}
    </div></Aviso>}
    {acervo && <PainelDoAcervo resultado={acervo} trazendo={trazendo} />}
    {/* A escolha da abrangência fica junto da empresa e do período, no topo (AbrangenciaLocalSped). */}
    {(aba === "fechamento" || aba === "apuracao") && contexto.consolidado && <p className="text-ui text-fg-secondary">Somando a matriz e as filiais da raiz {formatarRaiz(contexto.raiz)}: {grupo.map(e => e.nome).join(", ")}</p>}
    {aba === "gerar" && obrigacao === "contribuicoes" && contexto.consolidado && <p className="text-ui text-fg-secondary">Consolidado da raiz {contexto.raiz}: {grupo.map(e => `${e.nome} (${e.cnpj})`).join(", ")}</p>}
    {(aba === "apuracao" || aba === "gerar") && <Select aria-label="Obrigação" compact className="w-56" value={obrigacao} onChange={e => { const valor = e.target.value as Obrigacao; setObrigacao(valor); router.replace(href({ obrigacao: valor })); }}>{direitos.icms && <option value="icms_ipi">EFD ICMS/IPI</option>}{direitos.contribuicoes && <option value="contribuicoes">PIS e COFINS</option>}</Select>}
    {VISTAS[aba].length > 0 && <AbasDeLink aria-label="Visões da área" ativa={vista} abas={VISTAS[aba].map(([chave, rotulo]) => ({ chave, rotulo, icone: iconeDaAbaFiscal(chave, rotulo), href: href({ vista: chave }) }))} />}
    {mensagem && <div role="status"><Aviso tom="neutro">{mensagem}</Aviso></div>}{erro && <Aviso tom="perigo">{erro}</Aviso>}
    {aba === "classificacao" && vista === "produtos" && <>
      <FaixaDeTotais destaque={false} itens={[{ rotulo: "Produtos", valor: String(base.produtos.length) }, { rotulo: "A decidir", valor: String(base.produtos.filter(p => !p.decidido).length) }, { rotulo: "Decididos", valor: String(base.produtos.filter(p => p.decidido).length) }]} />
      {/* Busca e Filtros na mesma linha e na mesma altura (32px), como nas outras listas do app. */}
      <div className="flex flex-wrap items-center gap-2"><CampoDeBusca compact aria-label="Buscar produtos" placeholder="Produto, fornecedor, código ou NCM…" className="w-80 max-w-full flex-1 sm:flex-none" value={busca} onChange={e => setBusca(e.target.value)} /><FilterButton align="left" activeCount={(filtro !== "todos" ? 1 : 0) + (cfop ? 1 : 0)}><div className="space-y-3"><FilterButtonSection label="Situação"><Select compact aria-label="Situação dos produtos" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="pendentes">A decidir</option><option value="decididos">Decididos</option><option value="simples">Simples Nacional</option></Select></FilterButtonSection><FilterButtonSection label="CFOP"><Input compact aria-label="Filtrar CFOP" placeholder="Ex.: 1102" inputMode="numeric" value={cfop} onChange={e => setCfop(e.target.value)} /></FilterButtonSection>{(filtro !== "todos" || cfop) && <Button variant="ghost" size="xs" onClick={() => { setFiltro("todos"); setCfop(""); }}>Limpar filtros</Button>}</div></FilterButton></div>
      {pode && selecionados.length > 0 && <div className="flex items-center gap-3"><span className="text-ui">{selecionados.length} selecionado(s)</span><Button size="sm" onClick={() => classificar(base.produtos.filter(p => selecionados.includes(p.chave)))}>Classificar em lote</Button></div>}
      <Tabela chave={busca + filtro + cfop} colunas={["", "Produto", "Fornecedor", "CFOP", "Valor", "ICMS", "Situação", ""]} linhas={produtos.map(p => [<Checkbox key="s" aria-label={`Selecionar ${p.descricao}`} disabled={!pode} checked={selecionados.includes(p.chave)} onChange={e => setSelecionados(s => e.target.checked ? [...s, p.chave] : s.filter(k => k !== p.chave))} />, <span key="p">{p.descricao}<span className="block text-helper text-fg-muted">{p.codigo} · NCM {p.ncm || "não informado"}</span></span>, formatCnpj(p.fornecedor), p.cfop ?? "A decidir", reais(p.valor), reais(p.icms), p.decidido ? "Decidido" : "A decidir", <div key="a" className="flex gap-1"><Button size="xs" variant="ghost" onClick={() => setDetalhe(p.documentos[0])}>Notas</Button>{pode && <Button size="xs" variant="secondary" onClick={() => classificar([p])}>Classificar</Button>}</div>])} />
    </>}
    {aba === "classificacao" && vista === "decisoes" && <Tabela colunas={["Decisão", "Identificação", "Autor", "Data", "Valores"]} linhas={base.decisoes.filter(d => d.tipo !== "ajuste_removido").map(d => [rotulosDecisao[d.tipo] ?? "Decisão fiscal", d.chave, d.autor, d.em.slice(0, 16).replace("T", " "), <span key="v" className="text-helper">{resumoDecisao(d.dados)}</span>])} />}
    {(aba === "classificacao" && vista === "apoio" || aba === "fechamento" && vista === "pagamentos") && <>
      <div className="flex flex-wrap justify-between gap-3"><Input compact aria-label="Buscar documentos sem nota" placeholder="Pessoa, CPF/CNPJ ou documento…" value={busca} onChange={e => setBusca(e.target.value)} />{pode && <Button size="sm" onClick={() => setEdicao({ tipo: "apoio", dados: { ...novoApoio(contexto.competencia), identidade: "", documento: "", nome: "" } })}><Plus size={14} /> Novo documento</Button>}</div>
      <Tabela colunas={["Documento", "Pessoa", "Competência", "Bruto", "Líquido", "Crédito", "Conferência", ""]} linhas={apoio.map(a => [a.identidade, a.nome, a.competencia, reais(a.bruto), reais(a.liquido), a.credito === "S" ? "Sim" : a.credito === "N" ? "Não" : "A decidir", a.decisao, <div key="a" className="flex gap-1">{a.anexoId && <Button size="xs" variant="ghost" href={`/api/fiscal/sped/local/anexos/${a.anexoId}?empresa=${a.companyId}`} nativo target="_blank">PDF</Button>}{pode && a.companyId === empresa.id && <Button size="xs" variant="secondary" onClick={() => setEdicao({ tipo: "apoio", dados: dadosDoApoio(a) })}>Conferir / editar</Button>}</div>])} />
    </>}
    {aba === "apuracao" && <>
      {vista === "ajustes" ? <>
        <div className="flex flex-wrap gap-2">{pode && contexto.competencia.length === 7 && <><Button size="sm" variant="secondary" onClick={() => setEdicao({ tipo: "parametros", dados: { ...base.parametros, obrigacao } })}>Parâmetros e saldos</Button><Button size="sm" onClick={() => setEdicao({ tipo: "ajuste", dados: { obrigacao, tributo: obrigacao === "icms_ipi" ? "icms" : "pis", natureza: "credito" } })}><Plus size={14} /> Novo ajuste</Button></>}</div>
        <Tabela colunas={["Competência", "Tributo", "Código", "Descrição", "Natureza", "Valor", ""]} linhas={apuracao.ajustes.map(a => [a.competencia, a.tributo.toUpperCase(), a.codigo, a.descricao, a.natureza.replaceAll("_", " "), reais(a.valor), pode && a.companyId === empresa.id && !a.id.startsWith("apoio:") ? <div key="a" className="flex gap-1"><Button size="xs" variant="ghost" onClick={() => setEdicao({ tipo: "ajuste", dados: { ...a, ...a.camposEstaduais } })}>Editar</Button><Button size="xs" variant="danger" disabled={ocupado} onClick={() => void acao("remover_ajuste", { id: a.id })}>Remover</Button></div> : "—"])} />
        <Tabela colunas={["Referência", "Valor"]} linhas={Object.entries(base.parametros).map(([k, v]) => [k, typeof v === "boolean" ? v ? "Sim" : "Não" : k.startsWith("aliquota") ? v === null ? "Não informado" : `${v}%` : reais(v)])} />
      </> : <>
        <FaixaDeTotais destaque={false} itens={apuracao.tributos.map(t => ({ rotulo: `${t.tributo.toUpperCase()} a recolher`, valor: reais(t.recolher), detalhe: `Créditos ${reais(t.creditos)} · Débitos ${reais(t.debitos)}` }))} />
        {apuracao.pendencias.length > 0 && <BlocoRecolhivel titulo={`${apuracao.pendencias.length} conferência(s) a resolver`}><ul className="space-y-2 p-3 text-ui text-fg-secondary">{apuracao.pendencias.map(p => <li key={p}>{p}</li>)}</ul></BlocoRecolhivel>}
        {vista === "apuracao" && <Tabela colunas={["Tributo", "Débitos", "Créditos", "Saldo anterior", "A recolher", "A transportar"]} linhas={apuracao.tributos.map(t => [t.tributo.toUpperCase(), reais(t.debitos), reais(t.creditos), reais(t.saldoAnterior), reais(t.recolher), reais(t.transportar)])} />}
        {vista === "apuracao" && <Tabela colunas={["CFOP", "Sentido", "CST", "Alíquota", "Registros", "Valor", "Base", "Imposto", ""]} linhas={quadroPorCfop(apuracao.linhas).map(g => [g.cfop ?? "A decidir", g.sentido, g.cst, g.aliquota, String(g.registros), reais(g.valor), reais(g.base), reais(g.imposto), <Button key="livro" variant="ghost" size="xs" href={href({ vista: "livro", cfop: g.cfop ?? "" })}>Documentos</Button>])} />}
        {vista === "livro" && <Tabela colunas={["Nota", "Competência", "Sentido", "CFOP", "CST", "Valor", "Base", obrigacao === "icms_ipi" ? "ICMS" : "PIS", obrigacao === "icms_ipi" ? "IPI" : "COFINS", "Isentas", "Outras", ""]} linhas={apuracao.linhas.filter(l => !params.get("cfop") || l.cfop === params.get("cfop")).map(l => [l.numero, l.competencia, l.sentido, l.cfop ?? "A decidir", l.cst, reais(l.valor), reais(l.base), reais(l.imposto), reais(l.tributos[obrigacao === "icms_ipi" ? "ipi" : "cofins"] ?? null), reais(l.isentas), reais(l.outras), <Button key="d" size="xs" variant="ghost" onClick={() => setDetalhe(l.documentoId)}>Detalhes</Button>])} />}
      </>}
    </>}
    {aba === "fechamento" && <>
      {vista === "resumo" && <><FaixaDeTotais destaque={false} itens={[{ rotulo: "Documentos fiscais", valor: String(base.documentos.length + base.acervo.length) }, { rotulo: "Pagamentos a conferir", valor: String(base.fechamento.pendentes.length) }, { rotulo: "Duplicidades", valor: String(base.fechamento.duplicatas.length) }]} /><Tabela colunas={["Conferência", "Resultado", ""]} linhas={[["Documentos incompletos", String(base.documentos.filter(d => !d.completo).length + base.acervo.filter(d => d.situation !== "CANCELADA").length), <Button key="d" href={href({ vista: "documentos" })} variant="ghost" size="xs">Consultar</Button>], ["Pagamentos pendentes", String(base.fechamento.pendentes.length), <Button key="p" href={href({ vista: "pagamentos" })} variant="ghost" size="xs">Conferir</Button>], ["Contratos de aluguel a informar", String(base.fechamento.contratos.length), <Button key="c" href={href({ vista: "pagamentos" })} variant="ghost" size="xs">Consultar</Button>], ["Grupos de possíveis duplicatas", String(base.fechamento.duplicatas.length), <Button key="g" href={href({ vista: "conferencias" })} variant="ghost" size="xs">Consultar</Button>]]} /></>}
      {vista === "documentos" && <><Input compact aria-label="Buscar documentos" placeholder="Nota, nome ou chave…" value={busca} onChange={e => setBusca(e.target.value)} /><Tabela chave={busca} colunas={["Documento", "Tipo", "Competência", "Valor", "Origem", "Dados", ""]} linhas={[...documentos.map(d => [d.numero, d.tipo, d.competencia, reais(d.valor), d.fonte.toUpperCase(), d.cancelado ? "Cancelado" : d.completo ? "Com itens" : "Incompletos", <Button key="a" size="xs" variant="ghost" onClick={() => setDetalhe(d.id)}>Abrir</Button>]), ...base.acervo.filter(d => `${d.number} ${d.issuerName} ${d.dedupKey}`.toLowerCase().includes(busca.toLowerCase())).map(d => [d.number, d.type, d.competence, reais(d.amount), "Acervo Connect", d.situation === "CANCELADA" ? "Cancelado" : "Aguardando itens", <Button key="acervo" size="xs" variant="ghost" href={`/documentos-fiscais/${d.id}`}>Abrir acervo</Button>])]} /></>}
      {vista === "faturamento" && <Tabela colunas={["Grupo", "Documentos", "Valor", "Origem"]} linhas={[["Saídas fiscais escrituradas", String(base.documentos.filter(d => d.sentido === "saida" && !d.cancelado).length), reais(base.icms.totalSaidas), "Documentos locais"], ["Entradas escrituradas com nota", String(base.documentos.filter(d => d.sentido === "entrada" && !d.cancelado).length), reais(base.icms.totalEntradas), "Documentos locais"], ["Pagamentos sem nota", String(base.apoios.filter(a => a.decisao !== "rejeitado" && a.categoria !== "contrato_locacao").length), reais(base.fechamento.bruto), "Documentos de apoio"], ["Saídas menos entradas", "", reais(somar([base.icms.totalSaidas, `-${base.icms.totalEntradas}`, `-${base.fechamento.bruto}`])), "Conferência de valores"]]} />}
      {vista === "conferencias" && <><Tabela colunas={["Duplicidade potencial", "Ocorrências", "Valor bruto"]} linhas={base.fechamento.duplicatas.map(g => [g[0].nome + " · " + g[0].dataPagamento, String(g.length), reais(g[0].bruto)])} /><Aviso tom="info">Possíveis duplicatas exigem conferência. Nenhum documento é excluído automaticamente.</Aviso></>}
    </>}
    {aba === "gerar" && <>
      {geracao.motivo && <Aviso tom="atencao">{geracao.motivo}</Aviso>}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4">
        <h2 className="text-card-title font-semibold">Gerar arquivo da competência</h2>
        <p className="text-ui text-fg-secondary">O pedido congela uma revisão dos dados e entra na fila. O agente do motor gera o arquivo e devolve aqui. {obrigacao === "contribuicoes" ? "Contribuições abrange matriz e filiais da raiz." : "ICMS/IPI usa o estabelecimento selecionado."}</p>
        <Select aria-label="Tipo do arquivo" className="w-56" value={tipoSped} onChange={e => setTipoSped(e.target.value as "0" | "1")}><option value="0">Original</option><option value="1">Substituto / retificação</option></Select>
        <FaltasDoArquivo faltas={faltasDoArquivo} hrefDaEmpresa={`/empresas/${empresa.id}`} />
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!pode || !geracao.opsLigado || ocupado || contexto.competencia.length !== 7 || !!aberta || faltasDoArquivo.length > 0} loading={ocupado} loadingLabel="Pondo na fila…" onClick={() => void acao("gerar", { obrigacao, tipo: tipoSped, chave: chaveGeracao })}>Gerar SPED</Button>
          {aberta && <span className="text-helper text-fg-secondary">Já há uma geração {aberta.estado === "PENDENTE" ? "na fila" : "executando"} para esta obrigação. Acompanhe abaixo.</span>}
        </div>
        <SinalDoAgente agente={vivas.agente} />
      </div>
      {ultima && <CartaoDaGeracao geracao={ultima} agente={vivas.agente} revisaoAtual={base.revisao} pode={pode} erro={vivas.erro} cancelar={id => executar("cancelar_geracao", { id })} />}
      <BlocoRecolhivel titulo="Gerações anteriores"><div className="p-3"><Tabela colunas={["Revisão", "Arquivo", "Pedida em", "Situação", ""]} linhas={daObrigacao.slice(1).map(g => [String(g.revisao), `${ROTULO_DA_OBRIGACAO[g.obrigacao]} ${rotuloDoTipo(g.tipoSped)}`, formatInstantDateTime(new Date(g.pedidaEm)), g.rotuloDoEstado, g.arquivo ? <Button key="b" variant="ghost" size="xs" href={hrefDoGerado(g.id)} download aria-label={`Baixar ${g.arquivo.nome}`}><Download size={12} /> Baixar</Button> : "—"])} /></div></BlocoRecolhivel>
    </>}
    {aba !== "gerar" && direitos.importar && <BlocoRecolhivel titulo="Importar documentos e consultar resultados"><div className="space-y-4 p-4"><div className="space-y-2 border-b border-border-soft pb-4"><p className="text-ui text-fg-secondary">Do acervo do Connect: os documentos que o índice do motor trouxe entram aqui pelo XML guardado no motor, sem baixar arquivo{contexto.consolidado ? ", na matriz e nas filiais do grupo" : ""}. Os que já estão na escrituração ou na fila ficam de fora.</p>{botaoDoAcervo("secondary")}</div><p className="text-ui text-fg-secondary">XML, ZIP, TXT SPED, CSV ou Excel no modelo do Connect. PDFs ficam como anexos para conferência.</p><FileDropzone accept=".xml,.zip,.txt,.csv,.xlsx,.pdf" maxSizeMb={25} multiple arquivos={fila} desabilitado={importando} onAdicionar={files => setFila(f => [...f, ...files.map(file => ({ id: crypto.randomUUID(), file, progresso: 0, estado: "pendente" as const }))])} onRemover={id => setFila(f => f.filter(a => a.id !== id))} /><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void importar()} disabled={importando || aImportar === 0}><Upload size={14} /> {importando ? "Importando…" : aImportar > 1 ? `Importar ${aImportar} arquivos` : "Importar arquivo"}</Button>{importando && <Button size="sm" variant="secondary" onClick={() => { parar.current = true; }}>Pausar após o lote atual</Button>}<Button variant="ghost" size="sm" href="/api/fiscal/sped/local/modelo?formato=xlsx" download title="Planilha vazia no modelo do Connect, para preencher e importar"><Download size={14} /> Baixar modelo em Excel</Button><Button variant="ghost" size="sm" href="/api/fiscal/sped/local/modelo?formato=csv" download title="Arquivo CSV vazio no modelo do Connect, para preencher e importar"><Download size={14} /> Baixar modelo em CSV</Button></div><Tabela colunas={["Arquivo", "Estado", "Progresso", "Resultado", ""]} linhas={base.importacoes.map(i => [i.name, i.state, `${i.cursor}/${i.total || "?"}`, <Button key="r" size="xs" variant="ghost" onClick={() => setResultadoId(i.id)}>Ver resultados</Button>, ["pendente", "erro", "processando", "cancelado"].includes(i.state) ? <div key="a" className="flex gap-1"><Button size="xs" variant="secondary" disabled={importando} onClick={() => { setImportando(true); parar.current = false; void (async () => { if (i.state === "cancelado") await executar("retomar_importacao", { id: i.id }, false); await processar([i.id]); })().catch(e => setErro(String(e.message))).finally(() => setImportando(false)); }}>Retomar</Button><Button size="xs" variant="ghost" onClick={() => void acao("cancelar_importacao", { id: i.id })}>Cancelar</Button></div> : i.state === "anexo" ? <Button key="p" size="xs" variant="ghost" href={`/api/fiscal/sped/local/anexos/${i.id}?empresa=${empresa.id}`} nativo target="_blank">Abrir PDF</Button> : "—"])} /></div></BlocoRecolhivel>}
    {resultadoId && <SlideOver open title="Resultados da importação" onClose={() => setResultadoId(null)} width="max-w-2xl"><div className="p-5"><Tabela colunas={["Registro", "Situação", "Motivo"]} linhas={resultadosImportacao(base.importacoes.find(i => i.id === resultadoId)?.results)} /></div></SlideOver>}
    {edicao && <FormularioLocalSped edicao={edicao} competencia={contexto.competencia} executar={async (a, d) => { await executar(a, d); }} onClose={() => setEdicao(null)} anexos={base.importacoes.filter(i => i.state === "anexo")} />}
    {documento && <SlideOver open title={`Documento ${documento.numero}`} onClose={() => setDetalhe(null)} width="max-w-3xl"><div className="space-y-4 p-5"><p className="text-ui">{documento.nomeArquivo} · {documento.identidade}</p><p className="text-ui">Emitente {formatCnpj(documento.emitente)} · Destinatário {formatCnpj(documento.destinatario)}</p><Tabela colunas={["Item", "NCM", "CFOP original", "Valor", "ICMS", "PIS", "COFINS", ""]} linhas={documento.itens.map(i => [i.descricao, i.ncm, i.cfop, reais(i.valor), reais(i.icms.valor), reais(i.pis.valor), reais(i.cofins.valor), pode && documento.companyId === empresa.id && contexto.competencia.length === 7 ? <Button key="editar" size="xs" variant="secondary" onClick={() => editarTributacao(documento, i)}>Decisão fiscal</Button> : "—"])} /><Aviso tom="info">Os valores originais permanecem preservados. As decisões fiscais são registradas separadamente.</Aviso></div></SlideOver>}
  </div>;
}
/** O que o "Trazer do acervo" fez: os quatro números pedidos e, embaixo, só o que aconteceu de fora do comum. */
function PainelDoAcervo({ resultado: r, trazendo }: { resultado: ResultadoDoAcervo; trazendo: boolean }) {
  const situacao = trazendo ? "em andamento" : r.erro ? "interrompido" : r.pausado ? "pausado" : r.restantes > 0 ? "interrompido" : "concluído";
  // O CT-e de saída costuma não estar no motor (só o renderizado ou de frete tomado): o que pode ser CT-e não é alerta.
  const cteNaoAchados = Math.min(r.contadores.cteFora, r.contadores.naoEncontrados);
  const extras = [
    r.contadores.cteFora > 0 && `${numero(r.contadores.cteFora)} CT-e não vieram do motor, o que é esperado: o motor só guarda o CT-e já renderizado ou de frete tomado, então o CT-e de saída costuma ficar de fora`,
    r.resumo.naFila > 0 && `${numero(r.resumo.naFila)} já tinham ido para a fila antes${r.retomados > 0 ? `; ${numero(r.retomados)} que ainda não tinham sido lidos foram lidos agora` : ""}`,
    r.recusados > 0 && `${numero(r.recusados)} recusado(s) na leitura do XML: o motivo está em Importar documentos › Ver resultados`,
    r.contadores.grandesDemais > 0 && `${numero(r.contadores.grandesDemais)} com XML acima de 25 MiB, que a importação não aceita`,
    r.resumo.semIdentificador > 0 && `${numero(r.resumo.semIdentificador)} sem o identificador do motor gravado no acervo (sincronize o SPED de novo)`,
    !trazendo && r.pausado && "pausado: o que já entrou na fila foi preservado; clique em Trazer do acervo para continuar",
    !trazendo && !r.pausado && r.restantes > 0 && `faltam ${numero(r.restantes)} para pedir ao motor; clique em Trazer do acervo para continuar`,
  ].filter((t): t is string => typeof t === "string");
  return <section aria-labelledby="titulo-trazer-do-acervo" className="space-y-3 rounded-lg border border-border bg-surface p-4">
    <h2 id="titulo-trazer-do-acervo" className="text-ui font-semibold">Trazer do acervo · {situacao}<span className="font-normal text-fg-secondary"> · {formatInstantDateTime(new Date(r.em))}</span></h2>
    {r.erro && <Aviso tom="perigo">{r.erro}</Aviso>}
    <FaixaDeTotais destaque={false} className="" itens={[
      { rotulo: "Entraram na fila", valor: numero(r.contadores.naFila), detalhe: `${numero(r.lidos)} lido(s) na escrituração` },
      { rotulo: "Sem XML no motor", valor: numero(r.contadores.semXml), tom: r.contadores.semXml > 0 ? "text-warning-fg" : undefined },
      { rotulo: "Não achados no motor", valor: numero(r.contadores.naoEncontrados), tom: r.contadores.naoEncontrados > cteNaoAchados ? "text-warning-fg" : undefined, detalhe: cteNaoAchados > 0 ? `até ${numero(cteNaoAchados)} são CT-e, o esperado` : undefined },
      { rotulo: "Já na escrituração", valor: numero(r.resumo.naEscrituracao) },
    ]} />
    {extras.length > 0 && <ul className="list-disc space-y-1 pl-5 text-helper text-fg-secondary">{extras.map(t => <li key={t}>{t[0].toUpperCase() + t.slice(1)}.</li>)}</ul>}
  </section>;
}
function Tabela({ colunas, linhas, chave = "" }: { colunas: string[]; linhas: ReactNode[][]; chave?: string }) {
  const [pagina, setPagina] = useState(0);
  const atual = Math.min(pagina, Math.max(0, Math.ceil(linhas.length / 50) - 1));
  if (!linhas.length) return <div className="rounded-lg border border-border bg-surface"><EmptyState icon={<FileText />} title="Nenhum registro neste recorte" description="Confira a empresa, o período e os filtros, ou importe os documentos para começar." /></div>;
  return <div key={chave} className="space-y-2"><div className="c41-tabela overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full"><thead><tr>{colunas.map((c, i) => <th key={i} className="px-3">{c}</th>)}</tr></thead><tbody>{linhas.slice(atual * 50, atual * 50 + 50).map((l, i) => <tr key={i} className="border-b border-border-soft">{l.map((c, j) => <td key={j} className="px-3 align-top">{c}</td>)}</tr>)}</tbody></table></div><div className="flex flex-wrap justify-between items-center gap-2 text-helper text-fg-secondary"><span>{linhas.length} registro(s) · página {atual + 1} de {Math.ceil(linhas.length / 50)}</span><div className="flex gap-1"><Button variant="ghost" size="xs" disabled={atual === 0} onClick={() => setPagina(atual - 1)}>Anterior</Button><Button variant="ghost" size="xs" disabled={(atual + 1) * 50 >= linhas.length} onClick={() => setPagina(atual + 1)}>Próxima</Button></div></div></div>;
}



const rotulosDecisao: Record<string, string> = { classificacao: "Classificação de produto", credito_icms: "Crédito de ICMS", tributacao: "Tributação do item", ajuste: "Ajuste de apuração", parametros: "Parâmetros da competência", apoio: "Conferência de documento", perfil: "Perfil fiscal" };
function resumoDecisao(dados: Record<string, unknown>): string {
  if (typeof dados.descricao === "string") return dados.descricao;
  if (typeof dados.valor === "string") return reais(dados.valor);
  if (typeof dados.nome === "string") return `${dados.nome} · ${dados.decisao ?? ""}`;
  if (typeof dados.tipoItem === "string") return `Destinação ${dados.tipoItem}${dados.definicao ? ` · CFOP x${dados.definicao}` : ""}${dados.observacao ? ` · ${dados.observacao}` : ""}`;
  return "Dados fiscais registrados com rastreabilidade.";
}
function resultadosImportacao(dados: unknown): ReactNode[][] {
  return Array.isArray(dados) ? dados.filter(d => d && typeof d === "object").map(d => [String(d.registro ?? "Arquivo"), String(d.estado ?? ""), String(d.motivo ?? "")]) : [];
}
