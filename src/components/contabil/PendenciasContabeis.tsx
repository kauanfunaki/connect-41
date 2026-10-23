"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Accordion } from "@/components/ui/Accordion";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { pendenciasAgrupadas, rotuloTipo } from "@/lib/contabil/regras";
import type { ConfiguracaoContabil, ContextoContabil, Linha, PedidoContabil, PendenciaContabil, PreviaCsv, RegrasContabeis } from "@/lib/contabil/types";
import { Campo, comandar, consultar, Mensagem, moeda, texto } from "./compartilhados";
import { ListaDados } from "./ContabilSped";

type Edicao = { operacao: string; titulo: string; valores: Linha };
export function PendenciasContabeis({ contexto, pedido, config, onAlterou }: { contexto: ContextoContabil; pedido: PedidoContabil; config: ConfiguracaoContabil; onAlterou: () => void }) {
  const search = useSearchParams(); const router = useRouter();
  const [regras, setRegras] = useState<RegrasContabeis | null>(null); const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [consultaDocs, setConsultaDocs] = useState<{ id: string; linhas: Linha[] } | null>(null);
  const [erro, setErro] = useState(""); const [mensagem, setMensagem] = useState(""); const [ocupado, setOcupado] = useState(false);
  const [csv, setCsv] = useState(""); const [previa, setPrevia] = useState<PreviaCsv | null>(null);
  const [confirmarSugestoes, setConfirmarSugestoes] = useState(false);
  const [excluir, setExcluir] = useState<{ operacao: string; dados: Linha } | null>(null);
  const [pagina, setPagina] = useState(1);
    const chave = useRef<{ assinatura: string; valor: string } | null>(null);
  const todas = useMemo(() => pendenciasAgrupadas(pedido.secoes), [pedido.secoes]);
  const busca = search.get("busca") ?? ""; const tipo = search.get("tipo") ?? "";
  const visao = search.get("visao") ?? "pendencias"; const selecionada = todas.find(p => p.id === search.get("detalhe"));
  const documentos = selecionada && consultaDocs?.id === selecionada.id ? consultaDocs.linhas : null;
  const carregandoDocs = !!selecionada && selecionada.tipo === "entradas" && documentos === null;
  const podeGravar = config.escrita && config.permissoes.agir;
  const filtradas = todas.filter(p => (!tipo || p.tipo === tipo) && (p.nome + " " + p.cnpj_fornecedor + " " + p.cfop + " " + p.motivo).toLowerCase().includes(busca.toLowerCase()));
  function url(dados: Record<string, string | null>) {
    const p = new URLSearchParams(search.toString()); for (const [k, v] of Object.entries(dados)) { if (v) p.set(k, v); else p.delete(k); }
    router.replace("/contabil/sped?" + p, { scroll: false }); setPagina(1);
  }
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
  async function executar(operacao: string, dados: Linha, altera = true) {
    setErro(""); setOcupado(true);
    const assinatura = JSON.stringify({ operacao, dados, contexto });
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, valor: crypto.randomUUID() };
    try {
      const r = await comandar<PreviaCsv>(operacao, contexto, dados, chave.current.valor);
      chave.current = null;
      if (altera) { setMensagem("Alteração salva. Atualize a conferência antes de gerar."); setEdicao(null); onAlterou(); await carregarRegras(); }
      return r;
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setOcupado(false); }
  }
  function editar(p: PendenciaContabil) {
    if (p.tipo === "apoio" && !["codigo_debito", "conta_credito"].includes(p.falta ?? "")) { setErro("Esta pendência exige revisar o documento ou a competência na origem: " + p.motivo); return; }
    if (p.tipo === "apoio") {
      const porCategoria = p.falta === "categoria" || p.falta === "debito" || p.falta === "codigo_debito";
      setEdicao({ operacao: porCategoria ? "categoria" : p.cnpj_fornecedor ? "credito-apoio" : "nome", titulo: "Definir contas — " + p.nome,
        valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, nome: p.nome, categoria: p.categoria ?? "", conta_credito: "", conta_debito: "", codigo_debito: "", cfop: p.cfop } });
    } else {
      const regraCfop = regras?.cfop.find(r => r.cfop === p.cfop);
      setEdicao({ operacao: "regra", titulo: "Definir contas — " + p.nome, valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, cfop: p.cfop, conta_debito: regraCfop?.conta_debito ?? "", conta_credito: "", sugestao: p.sugestao } });
    }
  }
  return <section className="space-y-4" aria-labelledby="titulo-pendencias">
    <h2 id="titulo-pendencias" className="text-section-title font-semibold">Resolva o que falta</h2>
    <p className="text-label text-fg-secondary">Veja os documentos antes de definir as contas. As regras salvas serão reutilizadas nas próximas consultas.</p>
    {!podeGravar && <Mensagem>{config.permissoes.agir ? "A consulta está disponível. Configure o token de escrita contábil para salvar regras e importar preenchimentos." : "Seu acesso permite consultar e exportar. Alterações exigem permissão de ação no setor."}</Mensagem>}
    {erro && <Mensagem erro>{erro}</Mensagem>}{mensagem && <Mensagem>{mensagem}</Mensagem>}
    <div className="flex flex-wrap gap-2">
      <Button variant={visao === "pendencias" ? "primary" : "secondary"} onClick={() => url({ visao: "pendencias" })}>Pendências ({todas.length})</Button>
      <Button variant={visao === "regras" ? "primary" : "secondary"} onClick={() => url({ visao: "regras" })}>Regras cadastradas</Button>
      {contexto.periodo.length === 7 && <Button variant="secondary" disabled={!podeGravar || ocupado || !regras?.cfop.length} onClick={() => setConfirmarSugestoes(true)}>Aplicar sugestões do período</Button>}
      <Button variant={visao === "importar" ? "primary" : "secondary"} onClick={() => url({ visao: "importar" })}>Preencher por CSV</Button>
    </div>
    {visao === "pendencias" && <>
      <div className="flex flex-wrap gap-3"><div className="flex-1 min-w-48"><Input aria-label="Buscar fornecedor, documento ou motivo" placeholder="Buscar fornecedor, documento ou motivo" value={busca} onChange={e => url({ busca: e.target.value })} /></div><Select aria-label="Tipo de pendência" className="w-full sm:max-w-60" value={tipo} onChange={e => url({ tipo: e.target.value })}><option value="">Todos os tipos</option>{contexto.tipos.map(t => <option key={t} value={t}>{rotuloTipo(t)}</option>)}</Select></div>
      {!filtradas.length && <Mensagem>{todas.length ? "Nenhuma pendência corresponde à busca." : "Nenhuma pendência nos dados consultados. Você pode revisar os arquivos."}</Mensagem>}
      <div className="space-y-2">{filtradas.slice((pagina - 1) * 30, pagina * 30).map(p => <article key={p.id} className="rounded-lg border border-border bg-surface p-4 text-label">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{p.nome || p.cnpj_fornecedor || p.categoria}</h3><p className="text-fg-secondary">{p.cnpj_fornecedor} {p.cfop && "· CFOP " + p.cfop} · {rotuloTipo(p.tipo)}</p></div><p>{p.qtd} documentos · {moeda(p.valor)}</p></div>
        <p className="mt-2">{p.motivo}</p>
        {p.sugestao && <p className="text-fg-secondary mt-1">Há uma sugestão de conta para conferir. Ela só será aplicada após sua confirmação.</p>}
        <div className="flex flex-wrap gap-2 mt-3"><Button variant="secondary" onClick={() => url({ detalhe: p.id })}>Ver documentos</Button><Button variant="secondary" disabled={!podeGravar} onClick={() => editar(p)}>Definir contas</Button>{p.tipo === "entradas" && <Button variant="ghost" disabled={!podeGravar} onClick={() => setEdicao({ operacao: "desconsiderar", titulo: "Desconsiderar lançamento", valores: { cnpj_fornecedor: p.cnpj_fornecedor, nome_fornecedor: p.nome, cfop: p.cfop, escopo: "fornecedor", motivo: "" } })}>Desconsiderar</Button>}</div>
      </article>)}</div>
      <div className="flex justify-between text-label"><Button variant="ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span>Página {pagina} de {Math.max(1, Math.ceil(filtradas.length / 30))}</span><Button variant="ghost" disabled={pagina * 30 >= filtradas.length} onClick={() => setPagina(p => p + 1)}>Próxima</Button></div>
    </>}
    {visao === "regras" && regras && <div className="space-y-4">
      <div className="flex flex-wrap gap-2">{[["regra", "Nova regra de fornecedor"], ["cfop", "Conta por CFOP"], ["categoria", "Conta por categoria"], ["nome", "Conta por nome"]].map(([operacao, titulo]) => <Button key={operacao} variant="secondary" disabled={!podeGravar} onClick={() => setEdicao({ operacao, titulo, valores: {} })}>{titulo}</Button>)}</div>
      {(["fornecedor", "cfop", "categoria", "nome"] as const).map(grupo => { const linhas = regras[grupo]; return <Accordion key={grupo} className="rounded-lg border border-border p-4" titulo={<> {({ fornecedor: "Fornecedores e desconsiderações", cfop: "Contas por CFOP", categoria: "Contas por categoria", nome: "Contas por nome" })[grupo]} ({linhas.length}) </>}><TabelaRegras linhas={linhas} podeGravar={podeGravar} podeExcluir={config.permissoes.excluir && config.escrita} onEditar={l => setEdicao({ operacao: ({ fornecedor: "regra", cfop: "cfop", categoria: "categoria", nome: "nome" })[grupo], titulo: "Editar regra", valores: l })} onRemover={l => setExcluir({ operacao: grupo === "fornecedor" ? "remover-regra" : grupo === "cfop" ? "remover-cfop" : grupo === "categoria" ? "remover-categoria" : "remover-nome", dados: grupo === "fornecedor" ? { registro_id: l.id } : grupo === "cfop" ? { cfop: l.cfop } : grupo === "categoria" ? { categoria: l.categoria } : { chave_nome: l.chave_nome } })} onReconsiderar={l => executar("reconsiderar", { cnpj_fornecedor: l.cnpj_fornecedor, cfop: l.cfop })} /></Accordion>; })}
    </div>}
    {visao === "importar" && <div className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <h3 className="font-semibold">Baixe, preencha e devolva o mesmo arquivo</h3><p className="text-label">1. Baixe as pendências. 2. Preencha as contas no CSV. 3. Importe e confira a prévia antes de salvar. Reenviar uma correção atualiza a regra existente.</p>
      <Button variant="secondary" disabled={ocupado} onClick={() => executar("gerar", { referencia: pedido.id, formato: "pendencias", aceitar_parcial: true }, false).then(r => { if (r && "id" in r) { const q = new URLSearchParams(search.toString()); q.set("geracao", String(r.id)); q.set("etapa", "4"); router.push("/contabil/sped?" + q); } })}>Baixar pendências</Button>
      <Campo nome="CSV preenchido (até 3 MB)"><input type="file" accept=".csv,text/csv" disabled={!podeGravar} onChange={async e => { setPrevia(null); const f = e.target.files?.[0]; if (!f) return; if (f.size > 3 * 1024 * 1024) { setErro("O CSV deve ter até 3 MB."); return; } setCsv(await f.text()); }} /></Campo>
      <Button disabled={!podeGravar || !csv || ocupado} onClick={() => executar("previa-csv", { csv }, false).then(r => { if (r) setPrevia(r); })}>Conferir preenchimento</Button>
      {previa && <><Mensagem>{previa.inclusoes} novas regras · {previa.atualizacoes} atualizações · {previa.ignoradas} linhas ignoradas.</Mensagem>{previa.erros.map(e => <p key={e} className="text-label text-danger">{e}</p>)}<ListaDados linhas={previa.amostra} /><Button disabled={ocupado || !podeGravar || !!previa.erros.length} onClick={() => executar("importar-csv", { csv, hash: previa.hash }).then(r => { if (r) { setPrevia(null); setCsv(""); } })}>Confirmar importação</Button></>}
    </div>}
    <SlideOver open={!!selecionada} onClose={() => url({ detalhe: null })} title={selecionada?.nome || "Documentos"} width="max-w-2xl" fundo="leve">
      {selecionada && <><p className="text-label">{selecionada.qtd} documentos · {moeda(selecionada.valor)} · {selecionada.competencias.join(", ")}</p><p className="text-label my-3">{selecionada.motivo}</p>{carregandoDocs ? <p role="status">Consultando os documentos…</p> : documentos ? <ListaDados linhas={documentos} /> : <p className="text-label">Consulte os exemplos e a origem nos detalhes dos pagamentos, na etapa Conferir dados.</p>}{selecionada.sugestao && <Accordion titulo={<> Conferir sugestão de conta </>}><ListaDados linhas={[selecionada.sugestao]} /></Accordion>}<Button disabled={!podeGravar} onClick={() => { editar(selecionada); url({ detalhe: null }); }}>Definir contas</Button></>}
    </SlideOver>
    <SlideOver open={!!edicao} onClose={() => setEdicao(null)} title={edicao?.titulo} width="max-w-2xl" fundo="leve">{edicao && <FormRegra key={JSON.stringify(edicao)} edicao={edicao} categorias={regras?.categorias ?? []} contexto={contexto} ocupado={ocupado} onSalvar={d => executar(edicao.operacao, d)} erro={erro} />}</SlideOver>
    <ConfirmDialog open={confirmarSugestoes} pending={ocupado} error={erro || null} title="Aplicar sugestões conferidas?" description="Serão usadas somente contas de crédito de nome idêntico ao fornecedor e as contas de débito que você já cadastrou por CFOP. Sugestões por semelhança continuam para revisão individual." confirmLabel="Aplicar sugestões" onCancel={() => setConfirmarSugestoes(false)} onConfirm={() => { if (regras) void executar("sugestoes", { contas_debito: JSON.stringify(Object.fromEntries(regras.cfop.map(r => [texto(r.cfop), texto(r.conta_debito)]))), semelhanca_minima: 1 }).then(r => { if (r) setConfirmarSugestoes(false); }); }} />
    <ConfirmDialog destructive pending={ocupado} error={erro || null} open={!!excluir} title="Remover regra?" description="Os documentos que dependem desta regra poderão voltar a ficar pendentes. Os arquivos já gerados permanecem no histórico." confirmLabel="Remover regra" onCancel={() => setExcluir(null)} onConfirm={() => { if (excluir) void executar(excluir.operacao, excluir.dados).then(r => { if (r) setExcluir(null); }); }} />
  </section>;
}
function TabelaRegras({ linhas, podeGravar, podeExcluir, onEditar, onRemover, onReconsiderar }: { linhas: Linha[]; podeGravar: boolean; podeExcluir: boolean; onEditar: (l: Linha) => void; onRemover: (l: Linha) => void; onReconsiderar: (l: Linha) => void }) {
  const [busca, setBusca] = useState(""); const [pagina, setPagina] = useState(1);
  const filtradas = linhas.filter(l => Object.values(l).some(v => texto(v).toLowerCase().includes(busca.toLowerCase())));
  return <div className="mt-4 space-y-3"><Input aria-label="Buscar regra" placeholder="Buscar fornecedor, CFOP, nome ou conta" value={busca} onChange={e => { setBusca(e.target.value); setPagina(1); }} />{filtradas.slice((pagina - 1) * 20, pagina * 20).map((l, i) => <div key={i} className="border-b border-border py-3 text-label"><strong>{texto(l.nome_fornecedor || l.nome || l.descricao || l.categoria || l.cfop)}</strong><p>{texto(l.cnpj_fornecedor)} {texto(l.cfop)} · Débito: {texto(l.conta_debito || l.codigo_debito)} · Crédito: {texto(l.conta_credito)} {l.desconsiderar ? "· Desconsiderada: " + texto(l.motivo_desconsiderar) : ""}</p><div className="flex flex-wrap gap-2 mt-2"><Button variant="ghost" disabled={!podeGravar} onClick={() => onEditar(l)}>Editar</Button>{l.desconsiderar ? <Button variant="ghost" disabled={!podeGravar} onClick={() => onReconsiderar(l)}>Reconsiderar</Button> : null}{<Button variant="danger" disabled={!podeExcluir} onClick={() => onRemover(l)}>Remover</Button>}</div></div>)}<div className="flex justify-between text-label"><Button variant="ghost" disabled={pagina === 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button><span>{filtradas.length} regras · Página {pagina}</span><Button variant="ghost" disabled={pagina * 20 >= filtradas.length} onClick={() => setPagina(p => p + 1)}>Próxima</Button></div></div>;
}
function FormRegra({ edicao, categorias, contexto, ocupado, onSalvar, erro }: { edicao: Edicao; categorias: { categoria: string; rotulo: string }[]; contexto: ContextoContabil; ocupado: boolean; onSalvar: (d: Linha) => void; erro: string }) {
  const [usarSugestao, setUsarSugestao] = useState(false);
  const sugestao = edicao.valores.sugestao as Linha | undefined;
  const [contas, setContas] = useState<Linha[]>([]); const [buscaConta, setBuscaConta] = useState("");
  useEffect(() => { if (!buscaConta) return; const c = new AbortController(); const t = setTimeout(() => consultar<{ contas: Linha[] }>("contas", { cnpj: contexto.cnpj, busca: buscaConta }, c.signal).then(r => setContas(r.contas)).catch(() => {}), 350); return () => { clearTimeout(t); c.abort(); }; }, [buscaConta, contexto.cnpj]);
  const campos = edicao.operacao === "credito-apoio" ? [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["nome_fornecedor", "Nome do fornecedor"], ["conta_credito", "Conta de crédito"]] : edicao.operacao === "desconsiderar" ? [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["cfop", "CFOP"], ["motivo", "Motivo"]] : edicao.operacao === "cfop" ? [["cfop", "CFOP"], ["conta_debito", "Conta de débito"]] : edicao.operacao === "categoria" ? [["categoria", "Categoria"], ["descricao", "Descrição"], ["codigo_debito", "Conta de débito"], ["conta_credito", "Conta de crédito (opcional)"]] : edicao.operacao === "nome" ? [["nome", "Nome do fornecedor"], ["conta_credito", "Conta de crédito"]] : [["cnpj_fornecedor", "CNPJ/CPF do fornecedor"], ["nome_fornecedor", "Nome do fornecedor"], ["cfop", "CFOP (vazio = padrão do fornecedor)"], ["conta_debito", "Conta de débito"], ["conta_credito", "Conta de crédito"]];
  return <form onSubmit={e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget).entries()); for (const c of ["conta_debito","conta_credito","codigo_debito"]) if (typeof d[c] === "string") d[c] = d[c].split(" — ")[0]; onSalvar(d); }} className="space-y-4">
    <Mensagem>{edicao.operacao === "desconsiderar" ? "A desconsideração continuará valendo nas próximas consultas. Você poderá reconsiderar pela lista de regras." : "Esta regra será reutilizada nos documentos que correspondam ao fornecedor, CFOP, categoria ou nome informado, inclusive em outros períodos. Sugestões precisam ser conferidas antes de salvar."}</Mensagem>
    {erro && <Mensagem erro>{erro}</Mensagem>}
    {sugestao && <Mensagem>Sugestão para conferir: {texto(sugestao.nome)} · {texto(sugestao.codigo_reduzido || sugestao.classificacao)}.<Button variant="link" onClick={() => setUsarSugestao(true)}>Usar esta sugestão no formulário</Button></Mensagem>}
    {campos.map(([chave, nome]) => <Campo nome={nome} key={chave}>{chave === "categoria" ? <Select name={chave} defaultValue={texto(edicao.valores[chave])} required><option value="">Escolha a categoria</option>{categorias.map(c => <option key={c.categoria} value={c.categoria}>{c.rotulo}</option>)}</Select> : chave.includes("conta") || chave === "codigo_debito" ? <CampoComSugestoes key={chave + String(usarSugestao)} name={chave} defaultValue={usarSugestao && chave === "conta_credito" ? texto(sugestao?.codigo_reduzido || sugestao?.classificacao) : texto(edicao.valores[chave])} sugestoes={contas.map(c => texto(c.codigo_reduzido || c.classificacao) + " — " + texto(c.nome))} onChange={e => setBuscaConta(e.target.value)} required={edicao.operacao !== "categoria"} /> : <Input name={chave} defaultValue={texto(edicao.valores[chave])} required={["categoria", "motivo"].includes(chave)} />}</Campo>)}
    {edicao.operacao === "desconsiderar" && <Campo nome="Aplicar a"><Select className="w-full" name="escopo" defaultValue="fornecedor"><option value="fornecedor">Somente este fornecedor e CFOP</option><option value="cfop">Todos os fornecedores deste CFOP</option></Select></Campo>}
    {edicao.operacao === "regra" && <Accordion titulo={<> Opções adicionais </>}><p className="text-label text-warning my-3">Data e valor preenchidos substituem os valores de todos os documentos abrangidos por esta regra. Deixe vazios para manter cada documento.</p><div className="space-y-3">{[["codigo_historico", "Código do histórico"], ["historico", "Complemento do histórico"], ["data_lancamento", "Data do lançamento"], ["valor", "Valor"], ["inicia_lote", "Inicia lote (S/N)"], ["codigo_filial", "Código matriz/filial"], ["centro_custo_debito", "Centro de custo débito"], ["centro_custo_credito", "Centro de custo crédito"], ["observacao", "Observação"]].map(([c, n]) => <Campo key={c} nome={n}>{c === "data_lancamento" ? <CampoData name={c} defaultValue={texto(edicao.valores[c])} /> : <Input name={c} defaultValue={texto(edicao.valores[c])} />}</Campo>)}</div></Accordion>}
    <Button type="submit" disabled={ocupado}>{ocupado ? "Salvando…" : edicao.operacao === "desconsiderar" ? "Confirmar desconsideração" : "Salvar regra"}</Button>
  </form>;
}
