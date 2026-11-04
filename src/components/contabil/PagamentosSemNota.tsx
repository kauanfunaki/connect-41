"use client";
// A etapa Pagamentos sem nota (03/11/2026), o passo 5 do painel do motor:
// lançados e pendências, documentos lidos para conferir, o envio dos PDFs e
// da planilha do BPO, e as regras por categoria e por nome.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Selo } from "@/components/ui/Selo";
import { SlideOver } from "@/components/ui/SlideOver";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { EditorDeRegra, CampoConta } from "./EditorDeRegra";
import { TabelaContabil } from "./TabelaContabil";
import { moeda } from "@/lib/financeiro/formato";
import { formatCnpj, formatInstantDateTime } from "@/lib/format";
import type { PainelDosPagamentos, DocumentoLido } from "@/lib/contabil/pagamentosServidor";
import { CATEGORIAS, CATEGORIAS_COM_MODELO, TIPOS_DE_PAGAMENTO, rotuloDaCategoria, tipoDaCategoria, type PendenciaDoPagamento } from "@/lib/contabil/pagamentos";
import { TIPOS_DE_ENVIO, type TipoDeEnvio } from "@/lib/contabil/envioDePagamentos";
import type { Regra } from "@/lib/contabil/lancamentos";
import {
  corrigirPagamento, decidirPagamento, preencherPagina, removerContaPorNome, removerDocumentoDePagamento, salvarContaPorNome, salvarRegraDaCategoria,
  type ResultadoDosPagamentos,
} from "@/app/(app)/contabil/sped/pagamentos-actions";

const FALTA: Record<PendenciaDoPagamento["falta"], string> = { conta_credito: "Conta de crédito", codigo_debito: "Débito da categoria", retencao: "Retenção do RPA", competencia: "Competência" };
const SITUACAO: Record<string, [string, "sucesso" | "atencao" | "perigo" | "neutro"]> = {
  ok: ["Lido", "sucesso"], conferir: ["Conferir", "atencao"], via: ["Segunda via", "neutro"], invalido: ["Sem leitura", "perigo"], descartado: ["Descartado", "neutro"],
};
const documentoFormatado = (d: string) => (d.length === 14 ? formatCnpj(d) : d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : d);
const dataBr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const tipo = (categoria: string) => { const t = tipoDaCategoria(categoria); return t.documento ? `${t.assunto} · ${t.documento}` : t.assunto; };

type Props = { painel: PainelDosPagamentos; empresaId: string; mes: string; secao: string; podeAgir: boolean; permiteExcluir: boolean; daMatriz: string | null };

export function PagamentosSemNota({ painel: p, empresaId, mes, secao, podeAgir, permiteExcluir, daMatriz }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const { dialog, requestConfirm } = useConfirm();
  const [regra, setRegra] = useState<Partial<Regra> | null>(null);
  const [nome, setNome] = useState<{ nome: string; conta: string } | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [correcao, setCorrecao] = useState<DocumentoLido | null>(null);
  const [preencher, setPreencher] = useState<{ arquivoId: string; arquivo: string; pagina: string } | null>(null);
  const resultado = (r: ResultadoDosPagamentos) => { if (r.ok) { toast.success(r.mensagem); router.refresh(); } else toast.error(r.erro); };
  const agir = (fn: () => Promise<ResultadoDosPagamentos>) => iniciar(async () => resultado(await fn()));
  const baixar = (formato: string) => "/api/contabil/pagamentos?" + new URLSearchParams({ empresa: empresaId, mes, formato });
  const abrir = (arquivoId: string, pagina = 0) => "/api/contabil/pagamentos/documento?" + new URLSearchParams({ empresa: empresaId, id: arquivoId }) + (pagina ? "#page=" + pagina : "");

  function resolver(x: PendenciaDoPagamento) {
    if (x.falta === "codigo_debito") return setCategoria(x.categoria);
    if (x.falta !== "conta_credito") return;
    // Com CPF/CNPJ a conta vai para a regra do fornecedor no de-para (etapa 3); sem, para o nome.
    if (x.temDocumento) return setRegra({ cnpjFornecedor: x.chave, cfop: "", nomeFornecedor: x.rotulo, contaCredito: x.sugestao?.reduzido ?? "" });
    setNome({ nome: x.rotulo, conta: x.sugestao?.reduzido ?? "" });
  }

  return <div className="space-y-4 min-w-0">
    {daMatriz && <p className="text-helper text-fg-secondary">Os pagamentos sem nota são da matriz, {daMatriz}, e lançados nela.</p>}
    {!p.planoCarregado && <Aviso tom="info">Carregue o plano de contas em De-para › Plano e contas: sem ele não há crédito pelo nome do fornecedor nem sugestão.</Aviso>}

    {secao === "pagamentos" && <>
      <dl className="grid grid-cols-2 xl:grid-cols-4 gap-4 border-y border-border py-4">{[
        ["Documentos lançados", String(p.documentosLancados), moeda(p.centavosLancados)],
        ["Documentos pendentes", String(p.documentosPendentes), moeda(p.centavosPendentes)],
        ["Cadastros faltando", String(p.pendencias.length), ""],
        ["Para conferir", String(p.conferir.filter((c) => !c.decisao).length), "em Documentos lidos"],
      ].map(([rotulo, v, sub]) => <div key={rotulo}><dt className="text-helper text-fg-secondary">{rotulo}</dt><dd className="mt-1 text-xl tabular-nums font-semibold">{v}</dd>{sub && <dd className="text-helper text-fg-muted tabular-nums">{sub}</dd>}</div>)}</dl>
      <div className="flex flex-wrap gap-2 items-center">
        {p.lancamentos.length && p.codigoFilial ? <>
          <Button size="sm" href={baixar("xlsx")} download>Planilha da Domínio</Button>
          <Button size="sm" variant="secondary" href={baixar("txt")} download>TXT</Button>
        </> : <Button size="sm" disabled>Planilha da Domínio</Button>}
        <Button size="sm" variant="secondary" href={baixar("lancamentos")} download>CSV dos lançamentos</Button>
        <Button size="sm" variant="secondary" href={baixar("pendencias")} download>CSV das pendências</Button>
      </div>
      {!p.codigoFilial && !!p.lancamentos.length && <Aviso tom="atencao">A matriz não tem o código da filial na Domínio (De-para › Plano e contas). Sem ele a planilha não diz onde lançar.</Aviso>}
      <h3 className="text-card-title font-semibold">Cadastros faltando</h3>
      <p className="text-helper text-fg-muted">O maior valor primeiro. Cada cadastro resolve todos os pagamentos da linha.</p>
      <TabelaContabil local pesquisar vazio="Nada faltando: todos os pagamentos do mês viraram lançamento." colunas={["Tipo", "Quem", "Falta", "Docs", "Valor", "Por que está fora", ""]} linhas={p.pendencias.map((x) => ({
        id: x.falta + "|" + x.chave,
        celulas: [
          <span key="t" className="block max-w-40">{x.categorias.map(tipo).join(" / ")}</span>,
          <span key="q" className="block max-w-56"><span className="block font-medium">{x.rotulo}</span><span className="block text-helper text-fg-muted">{x.temDocumento ? documentoFormatado(x.chave) : x.falta === "conta_credito" ? "Sem CPF/CNPJ" : x.chave}</span></span>,
          FALTA[x.falta], String(x.documentos), moeda(x.centavos),
          <span key="m" className="block min-w-64 max-w-md text-helper">{x.motivo}{x.homonimos.length > 1 && podeAgir && <span className="mt-1 flex flex-wrap gap-1">{x.homonimos.map((h) => <Button key={h.reduzido} size="xs" variant="secondary" onClick={() => setNome({ nome: x.rotulo, conta: h.reduzido })}>{h.reduzido} · {h.nome}</Button>)}</span>}
            {x.exemplos.length > 0 && <span className="mt-1 block text-fg-muted">{x.exemplos.map((e, i) => <span key={i} className="block">{e.arquivoId ? <a className="underline" href={abrir(e.arquivoId, e.pagina)} target="_blank" rel="noreferrer">{e.fonte}</a> : e.fonte}</span>)}</span>}</span>,
          podeAgir && (x.falta === "conta_credito" || x.falta === "codigo_debito") && <Button key="r" size="xs" variant="secondary" onClick={() => resolver(x)}>Definir regra</Button>,
        ],
      }))} />
      <h3 className="text-card-title font-semibold">Lançamentos</h3>
      <TabelaContabil local pesquisar vazio="Nenhum pagamento sem nota lançado no mês." colunas={["Data", "Tipo", "Débito", "Crédito", "Valor", "Histórico", "Origem do documento"]} linhas={p.lancamentos.map((l, i) => ({
        id: String(i),
        celulas: [dataBr(l.data), tipo(l.categoria), <span key="d" title={l.debitoNome}>{l.debito}</span>,
          <span key="c" title={l.creditoNome}>{l.credito}{l.origemDoCredito === "nome igual no plano de contas" && <Selo tom="atencao">Conferir</Selo>}<span className="block text-helper text-fg-muted">{l.origemDoCredito}</span></span>,
          moeda(l.centavos), <span key="h" className="block min-w-48 max-w-96 break-words">{l.codigoHistorico && l.codigoHistorico + " · "}{l.historico}</span>,
          l.arquivoId ? <a key="o" className="underline text-helper" href={abrir(l.arquivoId, l.pagina)} target="_blank" rel="noreferrer">{l.fonte}</a> : <span key="o" className="text-helper">{l.fonte}</span>],
      }))} />
    </>}

    {secao === "documentos-lidos" && <>
      <p className="text-label text-fg-secondary">O que precisa de gente: leitura que não fechou, documento sem texto, possível duplicata e o que já foi decidido. O que a leitura deu como certo entra direto.</p>
      <p className="text-helper text-fg-muted">{Object.entries(p.situacoes).map(([s, n]) => `${SITUACAO[s]?.[0] ?? s}: ${n}`).join(" · ") || "Nenhum documento lido neste mês."}</p>
      <TabelaContabil local pesquisar vazio="Nada para conferir neste mês." colunas={["Documento", "Quem", "Valor", "Data / competência", "Situação", ""]} linhas={p.conferir.map((c) => ({
        id: c.id,
        celulas: [
          <span key="d" className="block max-w-56"><a className="underline" href={abrir(c.arquivoId, c.pagina)} target="_blank" rel="noreferrer">{c.arquivo}</a><span className="block text-helper text-fg-muted">{c.pagina ? `p.${c.pagina}` : "arquivo inteiro"} · {c.tipo}{c.mesmoDocumentoEm > 0 && ` · mesma chave em mais ${c.mesmoDocumentoEm}`}</span></span>,
          <span key="q" className="block max-w-56"><span className="block">{c.nome || "Sem nome"}</span><span className="block text-helper text-fg-muted">{documentoFormatado(c.documento) || "Sem CPF/CNPJ"}</span></span>,
          c.centavos === null ? "—" : moeda(c.centavos),
          <span key="dt">{dataBr(c.dataPagamento)}<span className="block text-helper text-fg-muted">{c.competencia || "sem competência"}</span></span>,
          <span key="s" className="block max-w-64"><Selo tom={SITUACAO[c.decisao === "aceito" ? "ok" : c.decisao || c.situacao]?.[1] ?? "neutro"}>{c.decisao === "aceito" ? "Aceito" : c.decisao === "descartado" ? "Descartado" : SITUACAO[c.situacao]?.[0] ?? c.situacao}</Selo>{c.corrigido && <Selo>Corrigido</Selo>}<span className="block text-helper text-fg-muted">{c.motivoDecisao || c.observacao}</span></span>,
          podeAgir && <span key="a" className="flex flex-wrap gap-1">
            {c.situacao === "invalido" && !c.decisao ? <Button size="xs" variant="secondary" onClick={() => setPreencher({ arquivoId: c.arquivoId, arquivo: c.arquivo, pagina: "1" })}>Preencher à mão</Button> : <Button size="xs" variant="secondary" onClick={() => setCorrecao(c)}>Corrigir</Button>}
            {c.decisao !== "aceito" && c.situacao !== "invalido" && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => agir(() => decidirPagamento({ empresa: empresaId, id: c.id, decisao: "aceito" }))}>Aceitar</Button>}
            {c.decisao !== "descartado" && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => agir(() => decidirPagamento({ empresa: empresaId, id: c.id, decisao: "descartado", motivo: c.mesmoDocumentoEm ? "duplicata" : "" }))}>Descartar</Button>}
            {c.decisao && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => agir(() => decidirPagamento({ empresa: empresaId, id: c.id, decisao: "" }))}>Desfazer</Button>}
          </span>,
        ],
      }))} />
    </>}

    {secao === "enviar-pagamentos" && <>
      {podeAgir ? <Envio empresaId={empresaId} /> : <Aviso tom="info">Seu perfil só consulta. O envio de documentos exige permissão para agir no Contábil.</Aviso>}
      <h3 className="text-card-title font-semibold">Documentos enviados</h3>
      <TabelaContabil local pesquisar vazio="Nenhum documento enviado ainda." colunas={["Arquivo", "Tipo", "Páginas", "Linhas lidas", "Enviado em", ""]} linhas={p.arquivos.map((a) => ({
        id: a.id,
        celulas: [<a key="n" className="underline" href={abrir(a.id)} target="_blank" rel="noreferrer">{a.nome}</a>, rotuloDoEnvio(a.tipo, a.categoria) + (a.pasta ? ` · ${a.pasta}` : ""),
          a.paginas ? <span key="p">{a.paginas}{a.semTexto > 0 && <Selo tom="atencao">{a.semTexto} sem texto</Selo>}</span> : "—", String(a.linhas), formatInstantDateTime(new Date(a.enviadoEm)),
          <span key="x" className="flex flex-wrap gap-1">{podeAgir && a.semTexto > 0 && <Button size="xs" variant="secondary" onClick={() => setPreencher({ arquivoId: a.id, arquivo: a.nome, pagina: "1" })}>Preencher página</Button>}
            {permiteExcluir && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => requestConfirm({ title: "Remover o documento?", description: "Saem também os pagamentos lidos dele e as correções feitas neles.", confirmLabel: "Remover", destructive: true }, async () => { const r = await removerDocumentoDePagamento({ empresa: empresaId, id: a.id }); if (!r.ok) throw new Error(r.erro); resultado(r); })}>Remover</Button>}</span>],
      }))} />
    </>}

    {secao === "regras-pagamentos" && <>
      <h3 className="text-card-title font-semibold">Regras por categoria</h3>
      <p className="text-helper text-fg-muted">O débito de cada categoria e, se houver, o crédito padrão. Motorista, aluguel de veículo, aluguel de imóvel e RPA seguem os lançamentos-modelo de Plano e contas, que vencem esta regra.</p>
      <TabelaContabil colunas={["Categoria", "Tipo", "Débito", "Crédito padrão", "Observação", ""]} linhas={CATEGORIAS.map(([c, rotulo]) => {
        const r = p.categorias.find((x) => x.categoria === c);
        const modelo = (CATEGORIAS_COM_MODELO as readonly string[]).includes(c);
        return { id: c, celulas: [rotulo, tipo(c), modelo ? <Selo key="m">Lançamento-modelo</Selo> : r?.codigoDebito || "—", r?.contaCredito || (modelo ? "" : "conta do fornecedor"), r?.observacao ?? "", podeAgir && <Button key="e" size="xs" variant="secondary" onClick={() => setCategoria(c)}>Editar</Button>] };
      })} />
      <h3 className="text-card-title font-semibold">Contas confirmadas para fornecedor sem CPF/CNPJ</h3>
      <TabelaContabil local pesquisar vazio="Nenhuma conta confirmada por nome." colunas={["Nome", "Conta de crédito", ""]} linhas={p.nomes.map((n) => ({ id: n.id, celulas: [n.nome, <span key="c">{n.contaCredito}<span className="block text-helper text-fg-muted">{n.contaNome || "fora do plano carregado"}</span></span>, <span key="a" className="flex gap-1">{podeAgir && <Button size="xs" variant="secondary" onClick={() => setNome({ nome: n.nome, conta: n.contaCredito })}>Editar</Button>}{permiteExcluir && <Button size="xs" variant="ghost" disabled={pendente} onClick={() => agir(() => removerContaPorNome({ empresa: empresaId, id: n.id }))}>Remover</Button>}</span>] }))} />
    </>}

    {regra && <EditorDeRegra empresaId={empresaId} mes={mes} inicial={regra} contas={p.contasDoPlano} notas={[]} fechar={() => setRegra(null)} />}
    {nome && <ContaPorNome empresaId={empresaId} inicial={nome} contas={p.contasDoPlano} fechar={() => setNome(null)} />}
    {categoria && <RegraDaCategoria empresaId={empresaId} categoria={categoria} atual={p.categorias.find((x) => x.categoria === categoria)} contas={p.contasDoPlano} fechar={() => setCategoria(null)} />}
    {correcao && <Correcao empresaId={empresaId} linha={correcao} fechar={() => setCorrecao(null)} />}
    {preencher && <Preenchimento empresaId={empresaId} mes={mes} inicial={preencher} fechar={() => setPreencher(null)} />}
    {dialog}
  </div>;
}

function rotuloDoEnvio(tipoDoArquivo: string, categoria: string): string {
  const achado = Object.values(TIPOS_DE_ENVIO).find((t) => t.tipo === tipoDoArquivo && t.categoria === categoria) ?? Object.values(TIPOS_DE_ENVIO).find((t) => t.tipo === tipoDoArquivo);
  return achado?.rotulo ?? tipoDoArquivo;
}

/** Um formulário em painel lateral que grava e recarrega a tela. */
function useGravar(fechar: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState("");
  const gravar = (fn: () => Promise<ResultadoDosPagamentos>) => iniciar(async () => { const r = await fn(); if (!r.ok) { setErro(r.erro); return; } toast.success(r.mensagem); router.refresh(); fechar(); });
  return { pendente, erro, gravar };
}

function ContaPorNome({ empresaId, inicial, contas, fechar }: { empresaId: string; inicial: { nome: string; conta: string }; contas: PainelDosPagamentos["contasDoPlano"]; fechar: () => void }) {
  const [conta, setConta] = useState(inicial.conta);
  const { pendente, erro, gravar } = useGravar(fechar);
  return <SlideOver open onClose={fechar} title="Conta do fornecedor sem CPF/CNPJ" width="max-w-xl"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); gravar(() => salvarContaPorNome({ empresa: empresaId, nome: inicial.nome, contaCredito: conta })); }}>
    <p className="text-label">{inicial.nome}</p>
    <p className="text-helper text-fg-muted">A conta vale para todo pagamento com este nome (sem acento, pontuação e LTDA/S.A. no fim) que vier sem CPF/CNPJ.</p>
    <CampoConta nome="Conta de crédito" valor={conta} mudar={setConta} contas={contas} />
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <Button type="submit" size="sm" loading={pendente}>Usar esta conta</Button>
  </form></SlideOver>;
}

function RegraDaCategoria({ empresaId, categoria, atual, contas, fechar }: { empresaId: string; categoria: string; atual?: PainelDosPagamentos["categorias"][number]; contas: PainelDosPagamentos["contasDoPlano"]; fechar: () => void }) {
  const [debito, setDebito] = useState(atual?.codigoDebito ?? "");
  const [credito, setCredito] = useState(atual?.contaCredito ?? "");
  const [observacao, setObservacao] = useState(atual?.observacao ?? "");
  const { pendente, erro, gravar } = useGravar(fechar);
  const modelo = (CATEGORIAS_COM_MODELO as readonly string[]).includes(categoria);
  return <SlideOver open onClose={fechar} title={"Regra: " + rotuloDaCategoria(categoria)} width="max-w-xl"><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); gravar(() => salvarRegraDaCategoria({ empresa: empresaId, categoria, codigoDebito: debito, contaCredito: credito, observacao })); }}>
    {modelo && <Aviso tom="info">Esta categoria segue o lançamento-modelo de Plano e contas, que vence esta regra. Ela só vale se o modelo for apagado lá.</Aviso>}
    <CampoConta nome="Débito" valor={debito} mudar={setDebito} contas={contas} />
    <CampoConta nome="Crédito padrão (opcional)" valor={credito} mudar={setCredito} contas={contas} />
    <p className="text-helper text-fg-muted">O crédito padrão só vale quando o fornecedor não tem conta pelo CPF/CNPJ, pelo nome ou no plano.</p>
    <label className="grid gap-1 text-label">Observação<Input value={observacao} maxLength={500} onChange={(e) => setObservacao(e.target.value)} /></label>
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <Button type="submit" size="sm" loading={pendente}>Salvar regra</Button>
  </form></SlideOver>;
}

function Correcao({ empresaId, linha, fechar }: { empresaId: string; linha: DocumentoLido; fechar: () => void }) {
  const [v, setV] = useState({ nome: "", documento: "", valor: "", competencia: "", dataPagamento: "", tipo: "", categoria: "" });
  const { pendente, erro, gravar } = useGravar(fechar);
  const campo = (chave: keyof typeof v, rotulo: string, atual: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="grid gap-1 text-label">{rotulo}<Input value={v[chave]} placeholder={atual || "—"} onChange={(e) => setV((x) => ({ ...x, [chave]: e.target.value }))} {...extra} /></label>;
  return <SlideOver open onClose={fechar} title="Corrigir a leitura" width="max-w-xl"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); gravar(() => corrigirPagamento({ empresa: empresaId, id: linha.id, ...v })); }}>
    <p className="text-helper text-fg-muted">{linha.arquivo}{linha.pagina ? ` · p.${linha.pagina}` : ""}. Em branco, vale o que a leitura achou (mostrado no campo). A leitura original não se perde.</p>
    {campo("nome", "Nome", linha.nome, { maxLength: 200 })}
    {campo("documento", "CPF/CNPJ", linha.documento, { inputMode: "numeric" })}
    {campo("valor", "Valor", linha.centavos === null ? "" : (linha.centavos / 100).toFixed(2).replace(".", ","), { inputMode: "decimal" })}
    {campo("competencia", "Competência (AAAA-MM)", linha.competencia, { maxLength: 7 })}
    {campo("dataPagamento", "Data do pagamento (AAAA-MM-DD)", linha.dataPagamento, { maxLength: 10 })}
    <label className="grid gap-1 text-label">Tipo do documento<Select value={v.tipo} onChange={(e) => setV((x) => ({ ...x, tipo: e.target.value }))}><option value="">Como foi lido ({linha.tipo})</option>{TIPOS_DE_PAGAMENTO.map((t) => <option key={t} value={t}>{t}</option>)}</Select></label>
    <label className="grid gap-1 text-label">Categoria<Select value={v.categoria} onChange={(e) => setV((x) => ({ ...x, categoria: e.target.value }))}><option value="">Derivada do tipo</option>{CATEGORIAS.map(([c, r]) => <option key={c} value={c}>{r}</option>)}</Select></label>
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <Button type="submit" size="sm" loading={pendente}>Gravar correção</Button>
  </form></SlideOver>;
}

function Preenchimento({ empresaId, mes, inicial, fechar }: { empresaId: string; mes: string; inicial: { arquivoId: string; arquivo: string; pagina: string }; fechar: () => void }) {
  const [v, setV] = useState({ pagina: inicial.pagina, nome: "", documento: "", numero: "", valor: "", competencia: mes, dataPagamento: "" });
  const { pendente, erro, gravar } = useGravar(fechar);
  const campo = (chave: keyof typeof v, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label className="grid gap-1 text-label">{rotulo}<Input value={v[chave]} onChange={(e) => setV((x) => ({ ...x, [chave]: e.target.value }))} {...extra} /></label>;
  return <SlideOver open onClose={fechar} title="Preencher à mão" width="max-w-xl"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); gravar(() => preencherPagina({ empresa: empresaId, arquivoId: inicial.arquivoId, ...v })); }}>
    <Aviso tom="info">O Connect não lê PDF de imagem. Abra o documento, confira a página e digite os valores: o pagamento entra aceito, com o seu nome.</Aviso>
    <p className="text-helper"><a className="underline" href={"/api/contabil/pagamentos/documento?" + new URLSearchParams({ empresa: empresaId, id: inicial.arquivoId }) + "#page=" + (Number(v.pagina) || 1)} target="_blank" rel="noreferrer">Abrir {inicial.arquivo}</a></p>
    {campo("pagina", "Página", { inputMode: "numeric", required: true })}
    {campo("nome", "Nome de quem recebeu", { required: true, maxLength: 200 })}
    {campo("documento", "CPF/CNPJ", { inputMode: "numeric" })}
    {campo("numero", "Número do recibo ou contrato", { maxLength: 30 })}
    {campo("valor", "Valor", { inputMode: "decimal", required: true })}
    {campo("competencia", "Competência (AAAA-MM)", { maxLength: 7, required: true })}
    {campo("dataPagamento", "Data do pagamento (AAAA-MM-DD)", { maxLength: 10 })}
    {erro && <Aviso tom="perigo">{erro}</Aviso>}
    <Button type="submit" size="sm" loading={pendente}>Gravar pagamento</Button>
  </form></SlideOver>;
}

type ResultadoDoEnvio = { nome: string; ok: boolean; mensagem: string };

/** Um arquivo por pedido, em sequência: cada um mostra o próprio resultado, e um recusado não derruba os outros. */
function Envio({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [envio, setEnvio] = useState<TipoDeEnvio>("rpa");
  const [pasta, setPasta] = useState("");
  const [substituir, setSubstituir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDoEnvio[]>([]);
  const arquivo = useRef<HTMLInputElement>(null);
  const planilha = envio === "planilha_bpo";

  async function enviar(lista: FileList | null) {
    const arquivos = [...(lista ?? [])];
    if (!arquivos.length) return;
    setEnviando(true);
    setResultados([]);
    for (const f of arquivos) {
      const dados = new FormData();
      dados.set("empresa", empresaId); dados.set("envio", envio); dados.set("pasta", pasta); dados.set("substituir", String(substituir)); dados.set("arquivo", f);
      let r: ResultadoDoEnvio;
      try {
        const resposta = await fetch("/api/contabil/pagamentos/enviar", { method: "POST", body: dados });
        const corpo = await resposta.json().catch(() => ({})) as { ok?: boolean; mensagem?: string; erro?: string };
        r = { nome: f.name, ok: !!corpo.ok, mensagem: corpo.mensagem ?? corpo.erro ?? (resposta.status === 413 ? "Arquivo grande demais para um envio." : "Falha no envio.") };
      } catch {
        r = { nome: f.name, ok: false, mensagem: "Falha de rede no envio." };
      }
      setResultados((x) => [...x, r]);
    }
    setEnviando(false);
    if (arquivo.current) arquivo.current.value = "";
    router.refresh();
  }

  return <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
    <p className="text-label text-fg-secondary">Envie os PDFs de um tipo de cada vez. O Connect lê o texto de cada página; o que não fechar, ou for imagem, aparece em Documentos lidos para conferir ou preencher à mão.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-label">Tipo do documento<Select value={envio} onChange={(e) => setEnvio(e.target.value as TipoDeEnvio)}>{Object.entries(TIPOS_DE_ENVIO).map(([k, t]) => <option key={k} value={k}>{t.rotulo}</option>)}</Select></label>
      {!planilha && <label className="grid gap-1 text-label">Pasta (opcional)<Input value={pasta} maxLength={255} placeholder="Ex.: 05.2025 - RPA" onChange={(e) => setPasta(e.target.value)} /><span className="text-helper text-fg-muted">Dá a competência quando o documento não traz data.</span></label>}
    </div>
    {planilha && <Checkbox label="Substituir a planilha já enviada com o mesmo nome" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />}
    {envio === "fatura_pdf" && <p className="text-helper text-fg-muted">O PDF da fatura não vira lançamento: ele liga às faturas da planilha do BPO pelo número da nota no nome do arquivo.</p>}
    <input ref={arquivo} type="file" multiple={!planilha} accept={planilha ? ".xlsx" : ".pdf"} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => enviar(e.target.files)} />
    <Button size="sm" loading={enviando} onClick={() => arquivo.current?.click()}><Upload size={14} aria-hidden /> {planilha ? "Escolher a planilha (.xlsx)" : "Escolher os PDFs"}</Button>
    {resultados.length > 0 && <ul className="space-y-1 text-helper" aria-live="polite">{resultados.map((r, i) => <li key={i} className={r.ok ? "text-fg" : "text-danger"}>{r.ok ? "✓ " : "✗ "}{r.ok ? r.mensagem : `${r.nome}: ${r.mensagem}`}</li>)}</ul>}
  </div>;
}
