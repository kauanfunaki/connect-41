"use client";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Plus, Search, Settings2, Upload } from "lucide-react";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SlideOver } from "@/components/ui/SlideOver";
import { formatCnpj } from "@/lib/format";
import { dadosDoApoio, FormularioLocalSped, novoApoio, type EdicaoSped } from "./FormularioLocalSped";
import { AcoesDoArquivo } from "@/components/fiscal/motor/AcoesDoArquivo";
import { AcompanhamentoDaExecucao } from "@/components/fiscal/motor/AcompanhamentoDaExecucao";
import type { ArquivoDoMotor, ExecucaoDoMotor } from "@/lib/sped/motor";
import type { BaseLocal } from "@/lib/fiscal/sped/local/servidor";
import { quadroPorCfop } from "@/lib/fiscal/sped/local/calculo";
import { reaisExatos, somar, type ContextoLocal, type Obrigacao, type ProdutoFiscal, type DocumentoEscriturado, type ItemFiscal } from "@/lib/fiscal/sped/local/dominio";
import type { EtapaDoSped } from "@/lib/fiscal/sped/etapas";

export type MotorDaEstacao = { disponivel: boolean; capaz: boolean; motivo: string | null; arquivos: ArquivoDoMotor[]; execucoes: ExecucaoDoMotor[] };
type Props = { aba: EtapaDoSped; empresa: { id: string; nome: string; cnpj: string }; contexto: ContextoLocal; base: BaseLocal; pode: boolean; direitos: { importar: boolean; configurar: boolean; entregas: boolean; icms: boolean; contribuicoes: boolean }; grupo: { id: string; nome: string; cnpj: string }[]; vistaInicial?: string; motor: MotorDaEstacao };
const reais = reaisExatos;
const VISTAS: Record<EtapaDoSped, [string, string][]> = {
  classificacao: [["produtos", "Produtos"], ["apoio", "Documentos sem nota"], ["decisoes", "Decisões registradas"]],
  apuracao: [["apuracao", "Apuração"], ["livro", "Livro fiscal"], ["ajustes", "Ajustes e parâmetros"]],
  fechamento: [["resumo", "Resumo"], ["documentos", "Documentos"], ["faturamento", "Faturamento"], ["pagamentos", "Pagamentos e contratos"], ["conferencias", "Conferências"]], gerar: [],
};
const semAssinatura = () => () => {};
export function EstacaoSped({ aba, empresa, contexto, base, pode, direitos, grupo, vistaInicial, motor }: Props) {
  const hidratado = useSyncExternalStore(semAssinatura, () => true, () => false);
  const router = useRouter(), caminho = usePathname(), params = useSearchParams();
  const vista = VISTAS[aba].some(([k]) => k === vistaInicial) ? vistaInicial! : VISTAS[aba][0]?.[0];
  const [busca, setBusca] = useState(""), [filtro, setFiltro] = useState("todos"), [cfop, setCfop] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]), [edicao, setEdicao] = useState<EdicaoSped | null>(null), [detalhe, setDetalhe] = useState<string | null>(null), [resultadoId, setResultadoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null), [erro, setErro] = useState<string | null>(null), [ocupado, setOcupado] = useState(false), [importando, setImportando] = useState(false);
  const parar = useRef(false), arquivosRef = useRef<File[]>([]);
  const [obrigacao, setObrigacao] = useState<Obrigacao>(params.get("obrigacao") === "contribuicoes" || !direitos.icms ? "contribuicoes" : "icms_ipi");
  const [tipoSped, setTipoSped] = useState<"0" | "1">("0"), [chaveGeracao, setChaveGeracao] = useState(() => crypto.randomUUID());
  const apuracao = obrigacao === "icms_ipi" ? base.icms : base.contribuicoes;
  const perfil = base.perfis.find(p => p.companyId === empresa.id);
  const href = (mudancas: Record<string, string>) => { const q = new URLSearchParams(params); q.set("empresa", empresa.id); q.set("competencia", contexto.competencia); for (const [k, v] of Object.entries(mudancas)) q.set(k, v); return `${caminho}?${q}`; };
  const exportar = (formato: string) => `/api/fiscal/sped/local/exportar?empresa=${empresa.id}&competencia=${contexto.competencia}&aba=${aba}&obrigacao=${obrigacao}&escopo=${contexto.consolidado ? "raiz" : "empresa"}&vista=${vista ?? ""}&cfop=${params.get("cfop") ?? ""}&formato=${formato}`;
  async function executar(acao: string, dados: Record<string, unknown>, atualizar = true) {
    setErro(null);
    const r = await fetch("/api/fiscal/sped/local/acao", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empresa: empresa.id, competencia: contexto.competencia, revisao: base.revisao, aba, acao, dados }) });
    const resposta = await r.json();
    if (!r.ok) throw new Error(resposta.error ?? "Não foi possível concluir a ação.");
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
    const arquivos = arquivosRef.current; if (!arquivos.length) return;
    setImportando(true); parar.current = false; setErro(null);
    try {
      for (const arquivo of Array.from(arquivos)) {
        if (parar.current) break;
        setMensagem(`Enviando ${arquivo.name}…`);
        const f = new FormData(); f.set("empresa", empresa.id); f.set("aba", aba); f.set("arquivo", arquivo);
        const r = await fetch("/api/fiscal/sped/local/importar", { method: "POST", body: f }); const d = await r.json();
        if (!r.ok) throw new Error(d.error); await processar(d.ids);
      }
      setMensagem(parar.current ? "Importação pausada. Os registros concluídos foram preservados." : "Importação concluída. Confira os resultados por arquivo.");
    } catch(e) { setErro(e instanceof Error ? e.message : "Falha na importação."); } finally { setImportando(false); router.refresh(); }
  }
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
  const arquivo = motor.arquivos.find(a => a.obrigacao === obrigacao && a.considerado) ?? motor.arquivos.find(a => a.obrigacao === obrigacao);
  const aberta = motor.execucoes.find(e => ["pendente", "executando"].includes(e.estado) && e.acao === (obrigacao === "icms_ipi" ? "sped" : "sped_contribuicoes"));
  const documento = base.documentos.find(d => d.id === detalhe);
  return <div data-testid="sped-estacao" data-hidratado={hidratado} className="space-y-5 min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-helper text-fg-secondary">{empresa.nome} · {formatCnpj(empresa.cnpj)} · revisão {base.revisao}</p>
      <div className="flex flex-wrap gap-2">
        {direitos.configurar && <Button variant="ghost" size="sm" onClick={() => setEdicao({ tipo: "perfil", dados: perfil ? { ...perfil } : { uf: "", regime: "", obrigacoes: [] } })}><Settings2 size={14} /> Perfil fiscal</Button>}
        {aba !== "gerar" && <><Button variant="secondary" size="sm" href={exportar("xlsx")} download><Download size={14} /> Excel</Button><Button variant="ghost" size="sm" href={exportar("csv")} download>CSV</Button></>}
      </div>
    </div>
    {!perfil && <Aviso tom="atencao">Complete o perfil fiscal da empresa para definir suas obrigações, regime e UF. Você já pode importar e conferir os documentos.</Aviso>}
    {base.acervo.length > 0 && <Aviso tom="atencao">Há {base.acervo.length} documento(s) no acervo do Connect ainda sem itens nesta escrituração. Eles aparecem no Fechamento e não entram nos valores apurados até a importação dos itens.</Aviso>}
    {(aba === "fechamento" || aba === "apuracao" && obrigacao === "contribuicoes") && <div className="flex flex-wrap items-center gap-3 text-ui"><Select compact aria-label="Abrangência" className="w-64" value={contexto.consolidado ? "raiz" : "empresa"} onChange={e => router.push(href({ escopo: e.target.value }))}><option value="empresa">Empresa selecionada</option><option value="raiz">Consolidado da raiz</option></Select>{contexto.consolidado && <span className="text-fg-secondary">Raiz {contexto.raiz}: {grupo.map(e => e.nome).join(", ")}</span>}</div>}
    {aba === "gerar" && obrigacao === "contribuicoes" && contexto.consolidado && <p className="text-ui text-fg-secondary">Consolidado da raiz {contexto.raiz}: {grupo.map(e => `${e.nome} (${e.cnpj})`).join(", ")}</p>}
    {(aba === "apuracao" || aba === "gerar") && <Select aria-label="Obrigação" compact className="w-56" value={obrigacao} onChange={e => { const valor = e.target.value as Obrigacao; setObrigacao(valor); router.replace(href({ obrigacao: valor })); }}>{direitos.icms && <option value="icms_ipi">EFD ICMS/IPI</option>}{direitos.contribuicoes && <option value="contribuicoes">PIS e COFINS</option>}</Select>}
    {VISTAS[aba].length > 0 && <AbasDeLink aria-label="Visões da área" ativa={vista} abas={VISTAS[aba].map(([chave, rotulo]) => ({ chave, rotulo, href: href({ vista: chave }) }))} />}
    {mensagem && <div role="status"><Aviso tom="neutro">{mensagem}</Aviso></div>}{erro && <Aviso tom="perigo">{erro}</Aviso>}
    {aba === "classificacao" && vista === "produtos" && <>
      <FaixaDeTotais destaque={false} itens={[{ rotulo: "Produtos", valor: String(base.produtos.length) }, { rotulo: "A decidir", valor: String(base.produtos.filter(p => !p.decidido).length) }, { rotulo: "Decididos", valor: String(base.produtos.filter(p => p.decidido).length) }]} />
      <div className="flex flex-wrap gap-3"><Input compact aria-label="Buscar produtos" placeholder="Produto, fornecedor, código ou NCM…" className="w-80 max-w-full" icon={<Search />} value={busca} onChange={e => setBusca(e.target.value)} /><BlocoRecolhivel titulo="Filtros"><div className="flex flex-wrap gap-2 p-2"><Select compact aria-label="Situação dos produtos" value={filtro} onChange={e => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="pendentes">A decidir</option><option value="decididos">Decididos</option><option value="simples">Simples Nacional</option></Select><Input compact aria-label="Filtrar CFOP" placeholder="CFOP" value={cfop} onChange={e => setCfop(e.target.value)} /></div></BlocoRecolhivel></div>
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
      {motor.motivo && <Aviso tom="atencao">{motor.motivo}</Aviso>}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4"><h2 className="text-card-title font-semibold">Gerar arquivo da competência</h2><p className="text-ui text-fg-secondary">O pedido envia uma revisão imutável dos dados ao motor. {obrigacao === "contribuicoes" ? "Contribuições abrange matriz e filiais da raiz." : "ICMS/IPI usa o estabelecimento selecionado."}</p><Select aria-label="Tipo do arquivo" className="w-56" value={tipoSped} onChange={e => setTipoSped(e.target.value as "0" | "1")}><option value="0">Original</option><option value="1">Substituto / retificação</option></Select><Button disabled={!pode || !motor.disponivel || !motor.capaz || ocupado || contexto.competencia.length !== 7 || !!aberta} loading={ocupado} loadingLabel="Enviando revisão…" onClick={() => void acao("gerar", { obrigacao, tipo: tipoSped, chave: chaveGeracao })}>Gerar SPED</Button></div>
      {aberta && <AcompanhamentoDaExecucao raiz={contexto.raiz} inicial={aberta} logInicial="" truncadoInicial={false} />}
      {arquivo && <div className="rounded-lg border border-border bg-surface p-5 space-y-3"><h2 className="text-card-title">Arquivo vigente · versão {arquivo.versao}</h2><p className="text-ui">{arquivo.nome_arquivo}</p><p className="text-helper text-fg-secondary">Validação: {arquivo.validacao.estado} · Entrega: {arquivo.entrega.estado}</p>{arquivo.revisao_connect !== undefined && arquivo.revisao_connect !== base.revisao && <Aviso tom="atencao">Há alterações no Connect posteriores à revisão usada neste arquivo.</Aviso>}<AcoesDoArquivo raiz={contexto.raiz} id={arquivo.id} hrefDownload={`/api/fiscal/sped/arquivos/${arquivo.id}/download?raiz=${contexto.raiz}`} obrigacao={arquivo.obrigacao} validando={arquivo.validacao.estado === "validando"} entregue={arquivo.entrega.estado === "registrada"} permiteRegerar={false} permiteEntregas={direitos.entregas && motor.disponivel} /></div>}
      <BlocoRecolhivel titulo="Revisões e versões anteriores"><div className="space-y-4 p-3"><Tabela colunas={["Revisão", "Obrigação", "Criada em", "Execução"]} linhas={base.revisoes.map(r => [String(r.revision), r.obligation, r.createdAt.slice(0, 16).replace("T", " "), r.remoteExecutionId ? `#${r.remoteExecutionId}` : "Envio pendente"])} /><Tabela colunas={["Versão", "Arquivo", "Validação", ""]} linhas={motor.arquivos.filter(a => a.obrigacao === obrigacao && a.id !== arquivo?.id).map(a => [String(a.versao), a.nome_arquivo, a.validacao.estado, <Button key="b" variant="ghost" size="xs" href={`/api/fiscal/sped/arquivos/${a.id}/download?raiz=${contexto.raiz}`} download>Baixar</Button>])} /></div></BlocoRecolhivel>
    </>}
    {aba !== "gerar" && direitos.importar && <BlocoRecolhivel titulo="Importar documentos e consultar resultados"><div className="space-y-4 p-4"><p className="text-ui text-fg-secondary">XML, ZIP, TXT SPED, CSV ou Excel no modelo do Connect. PDFs ficam como anexos para conferência. Até 25 MiB por arquivo.</p><Input onChange={e => { arquivosRef.current = Array.from(e.target.files ?? []); }} type="file" multiple aria-label="Arquivos para importar" accept=".xml,.zip,.txt,.csv,.xlsx,.pdf" /><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void importar()} disabled={importando}><Upload size={14} /> {importando ? "Importando…" : "Importar no Connect"}</Button>{importando && <Button size="sm" variant="secondary" onClick={() => { parar.current = true; }}>Pausar após o lote atual</Button>}<Button variant="ghost" size="sm" href="/api/fiscal/sped/local/modelo?formato=xlsx" download>Modelo Excel</Button><Button variant="ghost" size="sm" href="/api/fiscal/sped/local/modelo?formato=csv" download>Modelo CSV</Button></div><Tabela colunas={["Arquivo", "Estado", "Progresso", "Resultado", ""]} linhas={base.importacoes.map(i => [i.name, i.state, `${i.cursor}/${i.total || "?"}`, <Button key="r" size="xs" variant="ghost" onClick={() => setResultadoId(i.id)}>Ver resultados</Button>, ["pendente", "erro", "processando", "cancelado"].includes(i.state) ? <div key="a" className="flex gap-1"><Button size="xs" variant="secondary" disabled={importando} onClick={() => { setImportando(true); parar.current = false; void (async () => { if (i.state === "cancelado") await executar("retomar_importacao", { id: i.id }, false); await processar([i.id]); })().catch(e => setErro(String(e.message))).finally(() => setImportando(false)); }}>Retomar</Button><Button size="xs" variant="ghost" onClick={() => void acao("cancelar_importacao", { id: i.id })}>Cancelar</Button></div> : i.state === "anexo" ? <Button key="p" size="xs" variant="ghost" href={`/api/fiscal/sped/local/anexos/${i.id}?empresa=${empresa.id}`} nativo target="_blank">Abrir PDF</Button> : "—"])} /></div></BlocoRecolhivel>}
    {resultadoId && <SlideOver open title="Resultados da importação" onClose={() => setResultadoId(null)} width="max-w-2xl"><div className="p-5"><Tabela colunas={["Registro", "Situação", "Motivo"]} linhas={resultadosImportacao(base.importacoes.find(i => i.id === resultadoId)?.results)} /></div></SlideOver>}
    {edicao && <FormularioLocalSped edicao={edicao} competencia={contexto.competencia} executar={async (a, d) => { await executar(a, d); }} onClose={() => setEdicao(null)} anexos={base.importacoes.filter(i => i.state === "anexo")} />}
    {documento && <SlideOver open title={`Documento ${documento.numero}`} onClose={() => setDetalhe(null)} width="max-w-3xl"><div className="space-y-4 p-5"><p className="text-ui">{documento.nomeArquivo} · {documento.identidade}</p><p className="text-ui">Emitente {formatCnpj(documento.emitente)} · Destinatário {formatCnpj(documento.destinatario)}</p><Tabela colunas={["Item", "NCM", "CFOP original", "Valor", "ICMS", "PIS", "COFINS", ""]} linhas={documento.itens.map(i => [i.descricao, i.ncm, i.cfop, reais(i.valor), reais(i.icms.valor), reais(i.pis.valor), reais(i.cofins.valor), pode && documento.companyId === empresa.id && contexto.competencia.length === 7 ? <Button key="editar" size="xs" variant="secondary" onClick={() => editarTributacao(documento, i)}>Decisão fiscal</Button> : "—"])} /><Aviso tom="info">Os valores originais permanecem preservados. As decisões fiscais são registradas separadamente.</Aviso></div></SlideOver>}
  </div>;
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

