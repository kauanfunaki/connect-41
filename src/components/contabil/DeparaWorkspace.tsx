"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Selo } from "@/components/ui/Selo";
import { SlideOver } from "@/components/ui/SlideOver";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { ConfiguracaoDoContabil } from "./ConfiguracaoDoContabil";
import { EditorDeRegra, CampoConta } from "./EditorDeRegra";
import { ImportacaoDeRegras } from "./ImportacaoDeRegras";
import { FiltrosContabeis, TabelaContabil } from "./TabelaContabil";
import { moeda } from "@/lib/financeiro/formato";
import { formatCnpj } from "@/lib/format";
import type { PainelDoContabil } from "@/lib/contabil/servidor";
import { TIPOS_DA_ENTRADA, ROTULO_DA_ORIGEM, type Regra } from "@/lib/contabil/lancamentos";
import { filtrarLancamentos, type FiltrosContabeis as Filtros } from "@/lib/contabil/navegacao";
import { sugestaoEmLote } from "@/lib/contabil/sugestoesEmLote";
import { removerRegra, deixarDeFora, reativarRegra, salvarCfopConta, confirmarSugestoes, type ResultadoDoContabil } from "@/app/(app)/contabil/sped/actions";

const TIPOS = TIPOS_DA_ENTRADA.map((t) => [t, t] as const);
const SITUACOES = [["pronta", "Prontas"], ["pendente", "Pendentes"], ["fora", "Fora dos lançamentos"]] as const;
type Edicao = Partial<Regra> & { id?: string };
export function DeparaWorkspace({ painel: p, empresaId, mes, secao, filtros: f, podeAgir, permiteExcluir, daMatriz }: { painel: PainelDoContabil; empresaId: string; mes: string; secao: string; filtros: Filtros; podeAgir: boolean; permiteExcluir: boolean; daMatriz: string | null }) {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [importando, setImportando] = useState(false);
  const [cfops, setCfops] = useState(false);
  const [revisao, setRevisao] = useState(false);
  const [pendente, iniciar] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const { dialog, requestConfirm } = useConfirm();
  const q = (f.q ?? "").trim().toLowerCase();
  const contem = (...valores: string[]) => !q || valores.some((v) => v.toLowerCase().includes(q));
  const resultado = (r: ResultadoDoContabil) => { if (r.ok) { toast.success(r.mensagem); router.refresh(); } else toast.error(r.erro); };
  const agir = (fn: () => Promise<ResultadoDoContabil>) => iniciar(async () => resultado(await fn()));
  const csv = (conteudo: string) => "/api/contabil/regras?" + new URLSearchParams({ empresa: empresaId, mes, conteudo });
  const exportar = (tipo: string, formato: string) => "/api/contabil/lancamentos?" + new URLSearchParams({ empresa: empresaId, mes, tipo, formato, q: f.q ?? "", cfop: f.cfop ?? "", origem: f.origem ?? "", imobilizado: f.imobilizado ?? "" });
  const regras = p.regras.filter((r) => contem(r.nomeFornecedor, r.cnpjFornecedor, r.cfop, r.contaDebito, r.contaCredito, r.historico));
  const entradas = p.entradas.filter((e) => contem(e.nome, e.cnpj, e.numero) && (!f.tipo || e.tipo === f.tipo) && (!f.cfop || e.cfops.includes(f.cfop)) && (!f.situacao || p.situacoes[e.chave] === f.situacao));
  const pendencias = p.pendencias.filter((e) => contem(e.nomeFornecedor, e.cnpjFornecedor, e.cfop) && (!f.tipo || e.tipos.includes(f.tipo as typeof TIPOS_DA_ENTRADA[number])) && (!f.cfop || e.cfop === f.cfop));
  const lancamentos = filtrarLancamentos(p.lancamentos, f);
  const porCfop = [...new Set(p.entradas.flatMap((e) => e.cfops))].sort().map((v) => [v, v] as const);
  const nova = <Button size="sm" onClick={() => setEdicao({})}>Nova regra</Button>;
  const fornecedor = (nome: string, cnpj: string) => <span className="block max-w-64"><span className="block font-medium text-fg">{nome || "Fornecedor sem nome"}</span><span className="block text-helper text-fg-muted">{cnpj.length === 14 ? formatCnpj(cnpj) : cnpj || "Sem CPF/CNPJ"}</span></span>;
  return <div className="space-y-4 min-w-0">
    {daMatriz && <p className="text-helper text-fg-secondary">Regras, plano e contas compartilhados com a matriz: {daMatriz}.</p>}
    {secao === "visao" && <>
      <p className="text-label text-fg-secondary">Resumo das entradas e dos lançamentos da empresa no período.</p>
      <dl className="grid grid-cols-2 xl:grid-cols-4 gap-4 border-y border-border py-4">{[["Notas de entrada", String(p.conferencia.entradas)], ["Prontas", String(p.conferencia.lancadas)], ["Pendentes", String(p.conferencia.pendentes)], ["Fora dos lançamentos", String(p.conferencia.fora)]].map(([nome, v]) => <div key={nome}><dt className="text-helper text-fg-secondary">{nome}</dt><dd className="mt-1 text-xl tabular-nums font-semibold">{v}</dd></div>)}</dl>
      <div className="grid gap-4 sm:grid-cols-2 text-label"><div><p className="text-fg-secondary">Valor das entradas</p><p className="font-semibold tabular-nums mt-1">{moeda(p.conferencia.centavos)}</p></div><div><p className="text-fg-secondary">De-para e plano</p><p className="mt-1">{p.regras.length} regras · {p.configuracao.contasNoPlano} contas</p></div></div>
      {!p.entradas.length && <Aviso tom="info">Este mês ainda não tem notas de entrada. Você pode cadastrar regras e configurar o plano de contas.</Aviso>}
      {!p.configuracao.contasNoPlano && <Aviso tom="info">Carregue o plano em Plano e contas para consultar descrições e receber sugestões.</Aviso>}
      {!!p.conferencia.semCfop && <Aviso tom="atencao">{p.conferencia.semCfop} nota(s) sem CFOP no acervo. Para elas são usadas as regras gerais do fornecedor; a identificação de imobilizado depende do CFOP.</Aviso>}
    </>}
    {secao === "entradas" && <>
      <FiltrosContabeis filtros={[{ chave: "tipo", nome: "Documento", opcoes: TIPOS }, { chave: "cfop", nome: "CFOP", opcoes: porCfop }, { chave: "situacao", nome: "Situação", opcoes: SITUACOES }]} />
      <TabelaContabil colunas={["Documento", "Fornecedor", "CFOP", "Data", "Valor", "Situação", ""]} linhas={entradas.map((e) => ({ id: e.chave, celulas: [e.tipo + " " + e.numero, fornecedor(e.nome, e.cnpj), e.cfops.join(", ") || "Sem CFOP", e.data.split("-").reverse().join("/"), moeda(e.centavos), <Selo key="s" tom={p.situacoes[e.chave] === "pronta" ? "sucesso" : p.situacoes[e.chave] === "pendente" ? "atencao" : "neutro"}>{e.cancelada ? "Cancelada" : e.centavos === 0 ? "Valor zero" : SITUACOES.find(([id]) => id === p.situacoes[e.chave])?.[1]}</Selo>, <Button key="abrir" size="xs" variant="link" href={"/documentos-fiscais/" + e.documentoId}>Abrir nota</Button>] }))} />
    </>}
    {secao === "pendencias" && <>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" href={csv("pendencias")} download>Baixar pendências</Button>{podeAgir && <><Button size="sm" variant="secondary" onClick={() => setImportando(true)}>Importar preenchidas</Button><Button size="sm" variant="secondary" onClick={() => setRevisao(true)}>Revisar sugestões em lote</Button></>}</div>
      <FiltrosContabeis filtros={[{ chave: "tipo", nome: "Documento", opcoes: TIPOS }, { chave: "cfop", nome: "CFOP", opcoes: porCfop }]} />
      <TabelaContabil vazio="Nenhuma pendência neste filtro." colunas={["Fornecedor", "CFOP", "Notas", "Valor", "Sugestão de crédito", ""]} linhas={pendencias.map((e) => ({ id: e.cnpjFornecedor + "|" + e.cfop, celulas: [fornecedor(e.nomeFornecedor, e.cnpjFornecedor), e.cfop || "Sem CFOP", String(e.qtd), moeda(e.centavos), e.sugestao ? e.sugestao.reduzido + " · " + e.sugestao.nome : "Sem sugestão", podeAgir && <Button key="editar" size="xs" variant="secondary" onClick={() => setEdicao({ ...(p.regras.find((r) => r.cnpjFornecedor === e.cnpjFornecedor && r.cfop === e.cfop) ?? {}), cnpjFornecedor: e.cnpjFornecedor, cfop: e.cfop, nomeFornecedor: e.nomeFornecedor, contaDebito: p.cfopContas.find((c) => c.cfop === e.cfop)?.contaDebito ?? "", contaCredito: e.sugestao?.reduzido ?? "" })}>Notas e regra</Button>] }))} />
    </>}
    {secao === "regras" && <>
      <div className="flex flex-wrap gap-2">{podeAgir && nova}<Button size="sm" variant="secondary" href={csv("regras")} download>Exportar regras</Button>{podeAgir && <Button size="sm" variant="secondary" onClick={() => setImportando(true)}>Importar regras</Button>}<Button size="sm" variant="secondary" onClick={() => setCfops(true)}>Débito por CFOP</Button></div>
      <FiltrosContabeis />
      <TabelaContabil colunas={["Fornecedor", "CFOP", "Débito / crédito", "Histórico", "Situação", "Ações"]} linhas={regras.map((r) => ({ id: r.id, celulas: [fornecedor(r.nomeFornecedor, r.cnpjFornecedor), r.cfop || "Todos", <span key="contas" title={r.debitoNome + " / " + r.creditoNome}>{r.contaDebito || "Modelo"} / {r.contaCredito || "—"}</span>, <span key="hist" className="block max-w-60 break-words">{r.codigoHistorico && r.codigoHistorico + " · "}{r.historico || "Padrão"}</span>, <span key="situacao">{r.desconsiderar ? <Selo>Fora</Selo> : r.foraDoPlano ? <Selo tom="atencao">Conta fora do plano</Selo> : <Selo>Ativa</Selo>}</span>, podeAgir && <span key="acoes" className="flex flex-wrap gap-1"><Button size="xs" variant="secondary" disabled={pendente} onClick={() => setEdicao(r)}>Editar</Button><Button size="xs" variant="ghost" disabled={pendente} onClick={() => agir(() => r.desconsiderar ? reativarRegra({ empresa: empresaId, id: r.id }) : deixarDeFora({ empresa: empresaId, cnpjFornecedor: r.cnpjFornecedor, cfop: r.cfop, nomeFornecedor: r.nomeFornecedor }))}>{r.desconsiderar ? "Reativar" : "Deixar de fora"}</Button>{permiteExcluir && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => requestConfirm({ title: "Remover regra?", description: "As notas voltam a ser avaliadas sem esta regra.", confirmLabel: "Remover", destructive: true }, async () => { const x = await removerRegra({ empresa: empresaId, id: r.id }); if (!x.ok) throw new Error(x.erro); resultado(x); })}>Remover</Button>}</span>] }))} />
    </>}
    {secao === "lancamentos" && <>
      <FiltrosContabeis filtros={[{ chave: "tipo", nome: "Documento", opcoes: TIPOS }, { chave: "cfop", nome: "CFOP", opcoes: porCfop }, { chave: "origem", nome: "Origem da conta", opcoes: Object.entries(ROTULO_DA_ORIGEM) }, { chave: "imobilizado", nome: "Imobilizado", opcoes: [["1", "Somente imobilizado"]] }]} />
      <div className="flex flex-wrap gap-3 items-center"><p className="text-label font-medium">{lancamentos.length} lançamento(s) · {moeda(lancamentos.reduce((s, l) => s + l.centavos, 0))}</p>{TIPOS_DA_ENTRADA.filter((t) => (!f.tipo || t === f.tipo) && lancamentos.some((l) => l.tipo === t)).map((t) => <span key={t} className="flex gap-1 items-center text-helper text-fg-secondary">{t}<Button size="xs" variant="secondary" href={exportar(t === "NF-e" ? "nfe" : t === "CT-e" ? "cte" : "nfse", "xlsx")} download>Planilha</Button><Button size="xs" variant="ghost" href={exportar(t === "NF-e" ? "nfe" : t === "CT-e" ? "cte" : "nfse", "txt")} download>TXT</Button></span>)}</div>
      <p className="text-helper text-fg-muted">Cada arquivo leva todos os lançamentos do tipo e dos filtros aplicados, em todas as páginas.</p>
      <TabelaContabil colunas={["Data", "Nota", "Fornecedor", "Débito", "Crédito", "Valor", "Histórico"]} linhas={lancamentos.map((l) => ({ id: l.chave, celulas: [l.data.split("-").reverse().join("/"), l.tipo + " " + l.numero, fornecedor(l.nomeFornecedor, l.cnpjFornecedor), <span key="d" title={l.debitoNome}>{l.debito}{l.imobilizado && <Selo>Imobilizado</Selo>}</span>, <span key="c" title={l.creditoNome}>{l.credito}{l.origemDoCredito.startsWith("plano") && <Selo tom="atencao">Conferir</Selo>}</span>, moeda(l.centavos), <span key="h" className="block min-w-48 max-w-96 break-words">{l.historico}</span>] }))} />
    </>}
    {secao === "configuracao" && <>
      <ConfiguracaoDoContabil empresaId={empresaId} configuracao={p.configuracao} podeAgir={podeAgir} daMatriz={null} />
      <h3 className="text-card-title font-semibold">Consultar plano de contas</h3><FiltrosContabeis />
      <TabelaContabil colunas={["Reduzido", "Classificação", "Nome", "Tipo"]} linhas={p.contas.filter((c) => contem(c.reduzido, c.classificacao, c.nome)).map((c) => ({ id: c.reduzido, celulas: [c.reduzido, c.classificacao, c.nome, c.analitica ? "Analítica" : "Sintética"] }))} />
    </>}
    {edicao && <EditorDeRegra empresaId={empresaId} mes={mes} inicial={edicao} contas={p.contas} notas={p.entradas} fechar={() => setEdicao(null)} />}
    {importando && <ImportacaoDeRegras empresaId={empresaId} fechar={() => setImportando(false)} />}
    {cfops && <CfopContas painel={p} empresaId={empresaId} podeAgir={podeAgir} permiteExcluir={permiteExcluir} fechar={() => setCfops(false)} />}
    {revisao && <RevisaoDeSugestoes painel={p} empresaId={empresaId} mes={mes} fechar={() => setRevisao(false)} />}
    {dialog}
  </div>;
}

function CfopContas({ painel, empresaId, podeAgir, permiteExcluir, fechar }: { painel: PainelDoContabil; empresaId: string; podeAgir: boolean; permiteExcluir: boolean; fechar: () => void }) {
  const [cfop, setCfop] = useState("");
  const [contaDebito, setConta] = useState("");
  const [observacao, setObs] = useState("");
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const router = useRouter();
  const toast = useToast();
  const salvar = (c: { cfop: string; contaDebito: string; observacao: string }, remover = false) => iniciar(async () => {
    const r = await salvarCfopConta({ empresa: empresaId, ...c, remover });
    if (!r.ok) { setErro(r.erro); return; } setErro(""); toast.success(r.mensagem); router.refresh();
  });
  return <SlideOver open onClose={fechar} title="Sugestão de débito por CFOP" width="max-w-2xl"><div className="space-y-4"><p className="text-label text-fg-secondary">Preenche o débito ao cadastrar uma regra. O lançamento exige a confirmação da regra de fornecedor.</p>
    {podeAgir && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvar({ cfop, contaDebito, observacao }); }}><label className="grid gap-1 text-label">CFOP<Input value={cfop} maxLength={4} onChange={(e) => setCfop(e.target.value.replace(/\D/g, ""))} /></label><CampoConta nome="Conta de débito" valor={contaDebito} mudar={setConta} contas={painel.contas} /><label className="grid gap-1 text-label">Observação<Input value={observacao} maxLength={500} onChange={(e) => setObs(e.target.value)} /></label><Button type="submit" size="sm" loading={pendente}>Salvar CFOP</Button></form>}
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <TabelaContabil local pesquisar colunas={["CFOP", "Débito", "Observação", ""]} linhas={painel.cfopContas.map((c) => ({ id: c.id, celulas: [c.cfop, c.contaDebito, c.observacao, podeAgir && <span key="acoes" className="flex gap-1"><Button size="xs" variant="secondary" onClick={() => { setCfop(c.cfop); setConta(c.contaDebito); setObs(c.observacao); }}>Editar</Button>{permiteExcluir && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => salvar(c, true)}>Remover</Button>}</span>] }))} />
  </div></SlideOver>;
}

function RevisaoDeSugestoes({ painel: p, empresaId, mes, fechar }: { painel: PainelDoContabil; empresaId: string; mes: string; fechar: () => void }) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const router = useRouter(); const toast = useToast();
  const candidatas = p.pendencias.filter((x) => sugestaoEmLote(x, p.cfopContas, p.configuracao.modelos) !== null);
  return <SlideOver open onClose={fechar} title="Revisar sugestões" width="max-w-3xl"><div className="space-y-4"><Aviso tom="info">Confira fornecedor, débito e crédito antes de selecionar. Nomes semelhantes podem pertencer a fornecedores diferentes.</Aviso>
    <TabelaContabil local pesquisar colunas={["Selecionar", "Fornecedor / CFOP", "Débito", "Crédito sugerido", "Semelhança"]} linhas={candidatas.map((x) => { const chave = x.cnpjFornecedor + "|" + x.cfop; return { id: chave, celulas: [<Checkbox key="s" aria-label={"Confirmar sugestão de " + x.nomeFornecedor + " CFOP " + x.cfop} checked={selecionadas.includes(chave)} onChange={(e) => setSelecionadas((s) => e.target.checked ? [...s, chave] : s.filter((k) => k !== chave))} />, x.nomeFornecedor + " / " + (x.cfop || "Sem CFOP"), sugestaoEmLote(x, p.cfopContas, p.configuracao.modelos)!.rotuloDebito, x.sugestao!.reduzido + " · " + x.sugestao!.nome, Math.round(x.sugestao!.semelhanca * 100) + "%"] }; })} />
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <Button disabled={!selecionadas.length || selecionadas.length > 500} loading={pendente} onClick={() => iniciar(async () => { const r = await confirmarSugestoes({ empresa: empresaId, mes, selecionadas: selecionadas.map((s) => { const [cnpj, cfop] = s.split("|"); const pendencia = candidatas.find((p) => p.cnpjFornecedor === cnpj && p.cfop === cfop)!; const atual = sugestaoEmLote(pendencia, p.cfopContas, p.configuracao.modelos)!; return { cnpj, cfop, credito: atual.credito, referenciaDebito: atual.referenciaDebito }; }) }); if (!r.ok) { setErro(r.erro); return; } toast.success(r.mensagem); router.refresh(); fechar(); })}>Confirmar {selecionadas.length} sugestão(ões)</Button>
  </div></SlideOver>;
}
