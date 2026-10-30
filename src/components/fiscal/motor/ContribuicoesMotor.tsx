import { Suspense } from "react";
import { FileText, Receipt, Wallet } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { BlocoFiscal, MetricasFiscais, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefComParams, hrefDoMotor } from "@/lib/fiscal/motor/url";
import { contagemDoMotor, data, percentualDoMotor, reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { carregarDemonstrativoContrib, carregarFechamento, competenciasDoDemonstrativo, filtroDoDemonstrativo, type FiltroDoDemonstrativo } from "@/lib/fiscal/motor/telas/contribuicoes";
import type { Params } from "@/lib/fiscal/motor/telas/comum";
import type { LinhaDaApuracaoContrib } from "@/lib/sped/telasDoMotor";
import { BlocoLivre, CarregandoLeituraPesada, ErroDaLeitura, PaginacaoDoMotor, TabelaLivre } from "./LeituraDoMotor";
import { escritaNaTela } from "@/lib/fiscal/motor/permissoes";
import { chaveDoPagamentoDaLinha, COLUNA_ORIGINAL, CAMPOS_CORRIGIVEIS, correcaoGravada } from "@/lib/sped/escritasDoMotor";
import { AcoesDoPagamento, ApurarCte, ImportarFaturasBpo, ImportarPagamentosApoio, InformarContrato } from "./EscritasFechamento";

const CAMINHO = "/fiscal/contribuicoes";
const din = (v: string | null) => <span className="tabular-nums">{reaisDoMotor(v)}</span>;
/** As colunas de pagamento que a tela procura primeiro; o resto do `_COLS_PAGAMENTO_LEITURA` vem depois, como veio. */
const COLUNAS_DE_PAGAMENTO = ["tipo", "competencia", "nome", "documento", "data_pagamento", "valor_bruto", "valor_liquido", "falta_para_aceitar", "decisao", "decidido_por", "motivo_decisao", "mesmo_documento_em"] as const;

const originaisDa = (l: Record<string, unknown>) => Object.fromEntries(CAMPOS_CORRIGIVEIS.map((c) => [c, l[COLUNA_ORIGINAL[c]] == null ? "" : String(l[COLUNA_ORIGINAL[c]])])) as Record<(typeof CAMPOS_CORRIGIVEIS)[number], string>;

/**
 * Aba Fechamento (§11.3.3 a 11.3.7, leituras leves) com as escritas de §13.4 a
 * §13.7 para quem age no módulo: decidir e corrigir pagamento, informar
 * contrato de aluguel e apurar o CT-e dos arquivos pendentes.
 */
export async function FechamentoMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto } = tela;
  if (!contexto) return null;
  const [d, escrita] = await Promise.all([carregarFechamento(tela, params), escritaNaTela(tela.ctx, tela.motor, "fiscal_contribuicoes")]);
  if (!d) return null;
  const aqui = (m: Record<string, string | null> = {}) => hrefComParams(CAMINHO, params, m);
  const acoesDoPagamento = escrita.visivel ? (l: Record<string, unknown>) => {
    const chave = chaveDoPagamentoDaLinha(l);
    return chave ? <AcoesDoPagamento raiz={contexto.raiz} chave={chave} decisao={typeof l.decisao === "string" ? l.decisao : ""} falta={typeof l.falta_para_aceitar === "string" && l.falta_para_aceitar ? l.falta_para_aceitar : null} correcao={correcaoGravada(l)} originais={originaisDa(l)} permissao={escrita} /> : "—";
  } : undefined;
  const comps = d.competencias.dados ?? [];
  const anos = [...new Set(comps.map((c) => c.slice(0, 4)))];
  const filtros: CampoDeFiltro[] = [{ chave: "periodo", rotulo: "Período", vazioLabel: `Competência do recorte (${contexto.competencia})`, sempreVisivel: true, opcoes: [...anos.map((a) => ({ value: a, label: `Ano de ${a}` })), ...comps.map((c) => ({ value: c, label: c }))] }];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ui text-fg-secondary">Fechamento de <strong className="text-fg">{d.periodo.length === 4 ? `todo o ano de ${d.periodo}` : d.periodo}</strong>. Valor nulo é “não levantado”, não zero.</p>
      <FiltrosDaTela campos={filtros} />
    </div>
    {d.competencias.erro !== null && <ErroDaLeitura falha={d.competencias} hrefDeNovo={aqui()} />}
    {escrita.visivel && escrita.motivo && <Aviso tom="neutro">{escrita.motivo}</Aviso>}

    {d.blocos.erro !== null ? <ErroDaLeitura falha={d.blocos} hrefDeNovo={aqui()} /> : (() => {
      const b = d.blocos.dados;
      return <>
        <MetricasFiscais itens={[
          { rotulo: "Fiscais · entrada", valor: reaisDoMotor(b.totais.fiscais_entrada), icone: <FileText /> },
          { rotulo: "Fiscais · saída", valor: reaisDoMotor(b.totais.fiscais_saida), icone: <FileText />, detalhe: b.totais.sem_valor ? `${contagemDoMotor(b.totais.sem_valor)} documento(s) sem valor` : undefined },
          { rotulo: "Apoio · bruto", valor: reaisDoMotor(b.totais.apoio_bruto), icone: <Receipt />, detalhe: `${contagemDoMotor(b.totais.apoio_documentos)} documento(s)` },
          { rotulo: "Apoio · líquido", valor: reaisDoMotor(b.totais.apoio_liquido), icone: <Wallet />, detalhe: b.totais.fora ? `${contagemDoMotor(b.totais.fora)} fora do fechamento` : undefined },
        ]} />
        <BlocoFiscal titulo="Documentos fiscais" descricao="Do índice de documentos e, no CT-e de saída, da contagem do último SPED gerado.">
          <TabelaFiscal vazio="Nenhum documento fiscal no período." descricaoVazio="" colunas={["Documento", "Sentido", "Documentos", "Valor", "Sem valor", "Origem"]} linhas={b.fiscais.map((f, i) => ({ id: `${f.tipo}-${f.sentido}-${i}`, celulas: [
            f.rotulo, f.sentido === "entrada" ? "Entrada" : f.sentido === "saida" ? "Saída" : f.sentido || "—", contagemDoMotor(f.documentos), din(f.valor), contagemDoMotor(f.sem_valor), <span key="o" className="block max-w-64 break-words text-helper">{f.origem || "—"}</span>,
          ] }))} />
        </BlocoFiscal>
        <BlocoFiscal titulo="Documentos de apoio" descricao={`Contratos, recibos e RPA do período.${escrita.visivel ? " Os PDF e a planilha de faturas do BPO importados aqui entram na conferência dos pagamentos abaixo." : ""}`}>
          {escrita.visivel && <div className="mb-4 space-y-2">
            <BlocoRecolhivel titulo="Importar pagamentos de apoio (PDF, até 25 MB por envio)" abertoInicial={false}><div><ImportarPagamentosApoio raiz={contexto.raiz} permissao={escrita} /></div></BlocoRecolhivel>
            <BlocoRecolhivel titulo="Importar a planilha de faturas do BPO (.xlsx e comprovantes, até 25 MB)" abertoInicial={false}><div><ImportarFaturasBpo raiz={contexto.raiz} permissao={escrita} /></div></BlocoRecolhivel>
          </div>}
          <TabelaFiscal vazio="Nenhum documento de apoio." descricaoVazio="" colunas={["Tipo", "Documentos", "Pessoas", "Bruto", "Líquido", "Vias", "A conferir", "Inválidos", "Sem valor"]} linhas={b.apoio.map((a, i) => ({ id: `${a.tipo}-${i}`, celulas: [
            <span key="t">{a.rotulo}{a.cadastro && <span className="block text-helper text-fg-muted">cadastro</span>}</span>, contagemDoMotor(a.documentos), contagemDoMotor(a.pessoas), din(a.valor_bruto), din(a.valor_liquido), contagemDoMotor(a.vias),
            a.conferir ? <Selo key="c" tom="atencao">{contagemDoMotor(a.conferir)}</Selo> : contagemDoMotor(a.conferir), contagemDoMotor(a.invalidos), contagemDoMotor(a.sem_valor),
          ] }))} />
        </BlocoFiscal>
      </>;
    })()}

    <BlocoFiscal titulo="Faturamento" descricao="Saídas contra entradas. O CT-e entra só com o valor já apurado no motor.">
      {d.faturamento.erro !== null ? <ErroDaLeitura falha={d.faturamento} hrefDeNovo={aqui()} /> : (() => {
        const f = d.faturamento.dados;
        const aApurar = f.linhas.filter((l) => l.apurar);
        return <div className="space-y-3">
          {aApurar.length > 0 && <Aviso tom="atencao">Falta apurar o CT-e destes arquivos: {aApurar.flatMap((l) => l.pendentes).map((id) => `#${id}`).join(", ") || aApurar.map((l) => l.rotulo).join(", ")}. Até lá, o valor fica como “não levantado”.{escrita.visivel ? "" : " Apure no painel do motor."}</Aviso>}
          <ApurarCte raiz={contexto.raiz} ids={[...new Set(aApurar.flatMap((l) => l.pendentes))]} tela="contribuicoes" permissao={escrita} />
          <TabelaFiscal vazio="Sem linhas de faturamento." descricaoVazio="" colunas={["Grupo", "Documentos", "Valor", "Origem"]} linhas={f.linhas.map((l, i) => ({ id: `${l.grupo}-${i}`, celulas: [l.rotulo, contagemDoMotor(l.documentos), din(l.valor), <span key="o" className="text-helper">{l.origem || "—"}</span>] }))} />
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{([
            ["Saídas", reaisDoMotor(f.totais.saidas)], ["Entradas com nota", reaisDoMotor(f.totais.entradas_com_nota)], ["Entradas sem nota", reaisDoMotor(f.totais.entradas_sem_nota)],
            ["Entradas", reaisDoMotor(f.totais.entradas)], ["Saídas − entradas", reaisDoMotor(f.totais.saidas_menos_entradas)], ["Linhas incompletas", contagemDoMotor(f.totais.incompletas)],
          ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-helper text-fg-secondary">{k}</dt><dd className="mt-1 text-ui font-medium text-fg tabular-nums">{v}</dd></div>)}</dl>
        </div>;
      })()}
    </BlocoFiscal>

    <BlocoFiscal titulo="Conferência dos pagamentos" descricao={`${d.filaInteira ? "A fila inteira, de todas as competências" : `Período ${d.periodo}`}.${escrita.visivel ? " Aceitar pede o que a coluna “Falta para aceitar” indica; aceitar deixa o SPED de Contribuições do período defasado." : ""}`} acao={<span className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" href={aqui({ fila: d.filaInteira ? null : "toda" })} scroll={false}>{d.filaInteira ? "Só do período" : "Ver a fila inteira"}</Button>
      <Button size="sm" variant="ghost" href={aqui({ sem_credito: d.semCredito ? null : "1" })} scroll={false}>{d.semCredito ? "Esconder os sem crédito" : "Incluir os sem crédito"}</Button>
    </span>}>
      {d.conferencia.erro !== null ? <ErroDaLeitura falha={d.conferencia} hrefDeNovo={aqui()} /> : (() => {
        const c = d.conferencia.dados;
        return <div className="space-y-3">
          {c.conferir_truncado && <Aviso tom="atencao">A fila passou de 2000 linhas: mostrando as primeiras. Restrinja o período.</Aviso>}
          {c.ocultos.linhas > 0 && <Aviso tom="neutro">{contagemDoMotor(c.ocultos.linhas)} linha(s) ocultas ({reaisDoMotor(c.ocultos.valor)}): {Object.entries(c.ocultos.motivos).map(([m, n]) => `${m} (${contagemDoMotor(n)})`).join("; ")}.</Aviso>}
          <TabelaLivre linhas={c.conferir as Record<string, unknown>[]} candidatas={COLUNAS_DE_PAGAMENTO} vazio="Nenhum pagamento a conferir." acoes={acoesDoPagamento} />
        </div>;
      })()}
    </BlocoFiscal>

    <BlocoFiscal titulo="Duplicatas" descricao={d.conferencia.dados ? `${contagemDoMotor(d.conferencia.dados.duplicatas_resumo.grupos)} grupo(s) · ${contagemDoMotor(d.conferencia.dados.duplicatas_resumo.ocorrencias)} ocorrência(s) · excedente ${reaisDoMotor(d.conferencia.dados.duplicatas_resumo.valor_excedente)}` : "Pagamentos de apoio repetidos, do maior excedente para o menor."}>
      {d.duplicatas.erro !== null ? <ErroDaLeitura falha={d.duplicatas} hrefDeNovo={aqui()} /> : <div className="space-y-3">
        <TabelaFiscal vazio="Nenhuma duplicata no período." descricaoVazio="" colunas={["Pessoa", "Tipo", "Competência", "Pagamento", "Valor bruto", "Ocorrências", "Excedente"]} linhas={d.duplicatas.dados.itens.map((g, i) => ({ id: `${g.chave_negocio}-${i}`, celulas: [
          <span key="n">{g.nome || "—"}<span className="block text-helper text-fg-muted">{g.documento}</span></span>, g.tipo || "—", g.competencia || "—", data(g.data_pagamento), din(g.valor_bruto), contagemDoMotor(g.ocorrencias), din(g.valor_excedente),
        ] }))} />
        <PaginacaoDoMotor temCursor={!!d.cursorDuplicatas} proximo={d.duplicatas.dados.proximo_cursor} hrefInicio={aqui({ c_dup: null })} hrefProxima={(cur) => aqui({ c_dup: cur })} />
      </div>}
    </BlocoFiscal>

    <BlocoRecolhivel titulo="Aluguéis de imóveis pendentes" abertoInicial={false}>
      <div className="space-y-4">
        {d.alugueis.erro !== null ? <ErroDaLeitura falha={d.alugueis} hrefDeNovo={aqui()} /> : <>
          <TabelaLivre linhas={d.alugueis.dados.grupos} vazio="Nenhum aluguel pendente." acoes={escrita.visivel ? (g) => typeof g.fornecedor === "string" && g.fornecedor ? <InformarContrato raiz={contexto.raiz} fornecedor={g.fornecedor} permissao={escrita} /> : "—" : undefined} />
          {d.alugueis.dados.ressalvas.length > 0 && <section aria-label="Aprovações com ressalva"><h4 className="mb-2 text-label font-semibold text-fg">Aprovações com ressalva</h4><TabelaLivre linhas={d.alugueis.dados.ressalvas} /></section>}
          {!escrita.visivel && <p className="text-helper text-fg-muted">Informar contrato continua no painel do motor.</p>}
        </>}
      </div>
    </BlocoRecolhivel>
  </div>;
}

/** Um valor do quadro de créditos pelo `formato` do motor. */
function valorDoCredito(formato: string, v: string | null) {
  if (formato === "valor") return din(v);
  if (formato === "aliquota") return percentualDoMotor(v);
  return v ?? "—";
}

function ApuracaoDoAno({ titulo, linhas, competencias }: { titulo: string; linhas: LinhaDaApuracaoContrib[]; competencias: string[] }) {
  return <section aria-label={titulo}>
    <h3 className="mb-2 text-label font-semibold text-fg">{titulo}</h3>
    <TabelaFiscal vazio="Sem apuração." descricaoVazio="" colunas={["Linha", ...competencias, "Soma do ano"]} linhas={linhas.map((l, i) => ({ id: `${l.rotulo}-${i}`, celulas: [
      l.total ? <strong key="r">{l.rotulo}</strong> : l.rotulo, ...competencias.map((c) => din(l.valores[c] ?? null)), din(l.soma_ano),
    ] }))} />
  </section>;
}

async function DemonstrativoPesado({ tela, filtro, params }: { tela: TelaDoMotor; filtro: FiltroDoDemonstrativo; params: Params }) {
  const d = await carregarDemonstrativoContrib(tela, filtro);
  if (d.erro !== null) return <ErroDaLeitura falha={d} hrefDeNovo={hrefComParams(CAMINHO, params)} />;
  const x = d.dados;
  const competencias = x.meses.map((m) => m.competencia);
  const divergentes = x.cadeia.filter((c) => !c.bate);
  return <div className="space-y-5">
    {x.avisos.length > 0 && <Aviso tom="atencao"><ul className="list-disc pl-5">{x.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></Aviso>}
    {x.faltando.length > 0 && <Aviso tom="neutro">Sem SPED gerado: {x.faltando.join(", ")}.</Aviso>}
    <BlocoFiscal titulo="Meses" descricao={`Alíquotas: PIS ${percentualDoMotor(x.aliq_pis)} · COFINS ${percentualDoMotor(x.aliq_cofins)}`}>
      <TabelaFiscal vazio="Sem meses." descricaoVazio="" colunas={["Competência", "Arquivo", "Linhas"]} linhas={x.meses.map((m) => ({ id: m.competencia, celulas: [m.competencia, m.arquivo ? `#${m.arquivo.arquivo_id}` : <Selo key="s" tom="atencao">Sem arquivo</Selo>, contagemDoMotor(m.arquivo?.qtd_linhas ?? null)] }))} />
    </BlocoFiscal>
    <BlocoFiscal titulo="Conferência da cadeia" descricao={divergentes.length ? `${divergentes.length} elo(s) não batem com a competência anterior.` : "Cada competência parte do que a anterior deixou."}>
      <TabelaFiscal vazio="Sem cadeia." descricaoVazio="" colunas={["Competência", "Imposto", "Entrou", "Apurado", "Descontado", "Saiu", "Esperado da anterior", "Situação"]} linhas={x.cadeia.map((c, i) => ({ id: `${c.competencia}-${c.imposto}-${i}`, celulas: [
        c.competencia, c.imposto.toUpperCase() || "—", din(c.entrou), din(c.apurado), din(c.descontado), din(c.saiu), din(c.esperado_da_anterior), <Selo key="b" tom={c.bate ? "sucesso" : "perigo"}>{c.bate ? "Bate" : "Não bate"}</Selo>,
      ] }))} />
    </BlocoFiscal>
    <BlocoFiscal titulo="Apuração" descricao="Na ordem das linhas do bloco M.">
      <div className="space-y-5"><ApuracaoDoAno titulo="PIS" linhas={x.apuracao.pis} competencias={competencias} /><ApuracaoDoAno titulo="COFINS" linhas={x.apuracao.cofins} competencias={competencias} /></div>
    </BlocoFiscal>
    <BlocoFiscal titulo={`Relatório de ${x.relatorio === "saidas" ? "saídas" : "entradas"}`} descricao={`Ordenado por ${x.ordenar || "cst"}. Colunas com os nomes do motor.`}>
      <div className="space-y-4">
        <TabelaLivre linhas={x.linhas} vazio="Sem linhas no relatório." />
        {x.total !== null && <section aria-label="Total"><h4 className="mb-2 text-label font-semibold text-fg">Total</h4><BlocoLivre valor={x.total} /></section>}
      </div>
    </BlocoFiscal>
    <BlocoRecolhivel titulo="Créditos, por CFOP e estabelecimentos" abertoInicial={false}>
      <div className="space-y-4">
        <section aria-label="Créditos" className="space-y-4"><h4 className="text-label font-semibold text-fg">Créditos</h4>
          {x.creditos.length === 0 ? <p className="text-ui text-fg-muted">Sem créditos.</p> : x.creditos.map((c, i) => <div key={`${c.cod_cred}-${i}`}>
            <p className="mb-2 text-ui text-fg-secondary">Código {c.cod_cred || "—"} · origem {c.ind_cred_ori || "—"}</p>
            <TabelaFiscal colunas={["Linha", ...competencias.flatMap((m) => [`PIS ${m}`, `COFINS ${m}`])]} linhas={c.linhas.map((l, j) => ({ id: `${l.chave}-${j}`, celulas: [
              l.total ? <strong key="r">{l.rotulo}</strong> : l.rotulo,
              ...competencias.flatMap((m) => (["pis", "cofins"] as const).map((imp) => valorDoCredito(l.formato, l.valores[imp]?.[m] ?? null))),
            ] }))} />
          </div>)}
        </section>
        <section aria-label="Por CFOP"><h4 className="mb-2 text-label font-semibold text-fg">Por CFOP</h4><BlocoLivre valor={x.por_cfop} /></section>
        <section aria-label="Estabelecimentos"><h4 className="mb-2 text-label font-semibold text-fg">Estabelecimentos</h4><BlocoLivre valor={x.estabelecimentos} /></section>
      </div>
    </BlocoRecolhivel>
  </div>;
}

/** Aba Demonstrativo (§11.3.1 e 11.3.2): a lista é leve; o demonstrativo, pesado. */
export async function DemonstrativoContribMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto } = tela;
  if (!contexto) return null;
  const disponiveis = await competenciasDoDemonstrativo(tela);
  if (disponiveis.erro !== null) return <ErroDaLeitura falha={disponiveis} hrefDeNovo={hrefComParams(CAMINHO, params)} />;
  const filtro = filtroDoDemonstrativo(params, tela, disponiveis.dados);
  if (!filtro) return <EmptyState title="Nenhum SPED de Contribuições gerado" description="O demonstrativo lê os arquivos gerados pelo motor." action={tela.modulos.includes("fiscal_operacao") ? <Button href={hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" })}>Gerar em Executar</Button> : undefined} />;
  const campos: CampoDeFiltro[] = [
    { chave: "visao", rotulo: "Visão", vazioLabel: "Competência", sempreVisivel: true, opcoes: [{ value: "ano", label: "Ano inteiro" }] },
    { chave: "ano", rotulo: "Ano", vazioLabel: `Ano da competência (${contexto.competencia.slice(0, 4)})`, opcoes: disponiveis.dados.anos.map((a) => ({ value: a, label: a })) },
    { chave: "relatorio", rotulo: "Relatório", vazioLabel: "Entradas", sempreVisivel: true, opcoes: [{ value: "saidas", label: "Saídas" }] },
    { chave: "ordenar", rotulo: "Ordenar por", vazioLabel: "CST", opcoes: [{ value: "cfop", label: "CFOP" }, { value: "valor", label: "Valor" }] },
    { chave: "filial", rotulo: "Filial", vazioLabel: "Todas", opcoes: tela.mapa.visiveis.map((e) => ({ value: String(e.id), label: `${e.companyNome} · ${e.uf}` })) },
  ];
  const chave = JSON.stringify(filtro) + contexto.raiz;
  return <div className="space-y-5">
    <CascoDaTabela contagem={filtro.competencia ? `Competência ${filtro.competencia}` : `Ano de ${filtro.ano}`} filtros={<FiltrosDaTela naBarra campos={campos} />}>
      <p className="px-5 py-3 text-helper text-fg-secondary">{filtro.competencia ? "Para ver a conferência do ano, escolha a visão “Ano inteiro”." : `Competências com arquivo: ${disponiveis.dados.competencias.filter((c) => c.startsWith(filtro.ano ?? "")).join(", ") || "nenhuma"}.`}</p>
    </CascoDaTabela>
    <Suspense key={chave} fallback={<CarregandoLeituraPesada oQue={filtro.ano ? `os arquivos de ${filtro.ano}` : "o arquivo da competência"} />}>
      <DemonstrativoPesado tela={tela} filtro={filtro} params={params} />
    </Suspense>
  </div>;
}

