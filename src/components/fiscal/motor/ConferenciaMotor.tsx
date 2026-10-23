import { Calculator, Scale, TrendingDown, TrendingUp } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { BlocoFiscal, MetricasFiscais, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefComParams } from "@/lib/fiscal/motor/url";
import { data, dataHora, percentualDoMotor, reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { numeroDoMotor, seloDoConfronto } from "@/lib/fiscal/previa/doMotor";
import { carregarConfronto, carregarPrevia } from "@/lib/fiscal/motor/telas/conferencia";
import type { Params } from "@/lib/fiscal/motor/telas/comum";
import { BlocoLivre, ErroDaLeitura, PaginacaoDoMotor } from "./LeituraDoMotor";
import { escritaNaTela } from "@/lib/fiscal/motor/permissoes";
import { LINHAS_SIMULAVEIS, pendenciasDaPrevia, ROTULO_DA_LINHA_SIMULAVEL } from "@/lib/sped/escritasDoMotor";
import { ApurarCte } from "./EscritasFechamento";
import { ApurarCombustivel, DecidirDocumento, EnviarPlanilhaDoBpo, EnviarRelatorioOmie, SimularLinha } from "./EscritasConferencia";

const CAMINHO = "/fiscal/conferencia";
const din = (v: string | null) => <span className="tabular-nums">{reaisDoMotor(v)}</span>;
const ROTULO_PADRAO: Record<string, string> = { sem_nota: "Sem nota", achado: "Nota achada", com_nota: "Com nota", possivel_duplicidade: "Possível duplicidade" };

/**
 * Aba Prévia financeira (§11.4.2 e 11.4.3). Total parcial nunca aparece como
 * fechado. Para quem age no módulo, as escritas de §13.7 a §13.9: apurar o
 * CT-e dos arquivos pendentes, o combustível das filiais e simular linhas.
 */
export async function PreviaFinanceiraMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto } = tela;
  if (!contexto) return null;
  const [d, escrita] = await Promise.all([carregarPrevia(tela), escritaNaTela(tela.ctx, tela.motor, "fiscal_conferencia")]);
  if (!d) return null;
  const aqui = hrefComParams(CAMINHO, params);
  if (d.previa.erro !== null) return <ErroDaLeitura falha={d.previa} hrefDeNovo={aqui} />;
  const p = d.previa.dados;
  const pend = pendenciasDaPrevia(p);
  const comPendencia = tela.mapa.visiveis.filter((e) => pend.combustivel.includes(e.cnpj));
  // Sem pendência, reapurar todas as filiais ativas que a pessoa vê (é idempotente).
  const filiais = (comPendencia.length ? comPendencia : tela.mapa.visiveis.filter((e) => e.ativo)).map((e) => ({ id: e.id, rotulo: `${e.companyNome} · ${e.uf}` }));
  const linhasSimulaveis = LINHAS_SIMULAVEIS.map((k) => ({ chave: k, rotulo: p.linhas.find((l) => l.chave === k)?.rotulo ?? ROTULO_DA_LINHA_SIMULAVEL[k] }));
  const aPagar = numeroDoMotor(p.totais.a_pagar);
  const credor = aPagar !== null && aPagar < 0;
  return <div className="space-y-5">
    {p.totais.parcial && <Aviso tom="atencao">Prévia parcial: o total ainda não fecha. Falta levantar {p.totais.pendentes.join(", ") || "parte das bases"}.</Aviso>}
    {escrita.visivel && <BlocoFiscal titulo="Levantar o que falta" descricao={`CT-e: ${pend.cte.length ? `${pend.cte.length} SPED(s) gerado(s) sem apuração` : "nenhum SPED gerado pendente de apuração"}. Combustível: ${comPendencia.length ? `${comPendencia.length} filial(is) sem apuração` : "reapura as filiais ativas"}. São leituras pesadas no motor, uma por vez.`}>
      <div className="space-y-4">
        {pend.cte.length > 0 && <ApurarCte raiz={contexto.raiz} ids={pend.cte} tela="conferencia" permissao={escrita} />}
        <ApurarCombustivel raiz={contexto.raiz} competencia={p.competencia} filiais={filiais} permissao={escrita} />
      </div>
    </BlocoFiscal>}
    <MetricasFiscais itens={[
      { rotulo: "Base do faturamento", valor: reaisDoMotor(p.totais.base_faturamento), icone: <TrendingUp /> },
      { rotulo: "Base das entradas", valor: reaisDoMotor(p.totais.base_entradas), icone: <TrendingDown /> },
      { rotulo: "Débito · crédito", valor: `${reaisDoMotor(p.totais.debito)} · ${reaisDoMotor(p.totais.credito)}`, icone: <Scale /> },
      { rotulo: p.totais.parcial ? "A pagar (parcial)" : credor ? "Saldo credor" : "A pagar", valor: reaisDoMotor(credor && p.totais.a_pagar ? p.totais.a_pagar.replace(/^-/, "") : p.totais.a_pagar), icone: <Calculator />, tom: p.totais.parcial ? "text-fg-muted" : credor ? "text-success-fg" : undefined, detalhe: p.totais.parcial ? "não é o total fechado" : undefined },
    ]} />
    <BlocoFiscal titulo={`Prévia de ${p.competencia}`} descricao={`PIS+COFINS: cheia ${percentualDoMotor(p.aliquotas.cheia)} · presumida ${percentualDoMotor(p.aliquotas.presumida)}${p.contratos_para_zerar !== null ? ` · contratos para zerar ${reaisDoMotor(p.contratos_para_zerar)}` : ""}`}>
      <TabelaFiscal vazio="Sem linhas na prévia." descricaoVazio="" colunas={["Linha", "Grupo", "Alíquota", "Base", "Imposto", "Fonte"]} linhas={p.linhas.map((l) => ({ id: l.chave, celulas: [
        <span key="r">{l.rotulo}<span className="mt-1 flex flex-wrap justify-center gap-1">{l.simulada && <Selo tom="marca">Simulada</Selo>}{l.pendente && <Selo tom="atencao">Pendente</Selo>}</span></span>,
        l.grupo === "faturamento" ? "Faturamento" : l.grupo === "entrada" ? "Entrada" : l.grupo, percentualDoMotor(l.aliquota), din(l.base), din(l.imposto), <span key="f" className="block max-w-56 break-words text-helper">{l.fonte || "—"}</span>,
      ] }))} />
    </BlocoFiscal>
    <BlocoRecolhivel titulo="Prestadores de NFS-e tomada (MEI e normal)" abertoInicial={false}>
      <div>{d.prestadores.erro !== null ? <ErroDaLeitura falha={d.prestadores} hrefDeNovo={aqui} /> : <div className="grid gap-5 lg:grid-cols-2">
        {([["MEI", d.prestadores.dados.mei, d.prestadores.dados.prestadores_mei], ["Normal", d.prestadores.dados.normal, d.prestadores.dados.prestadores_normal]] as const).map(([lado, total, lista]) => <section key={lado} aria-label={lado}>
          <h4 className="mb-2 text-label font-semibold text-fg">{lado} · {reaisDoMotor(total)}</h4>
          <TabelaFiscal vazio="Nenhum prestador." descricaoVazio="" colunas={["Prestador", "Documentos", "Valor", "Classificação"]} linhas={lista.map((x, i) => ({ id: `${x.cnpj}-${i}`, celulas: [
            <span key="n" className="block max-w-56 break-words">{x.nome || "—"}<span className="block text-helper text-fg-muted">{x.cnpj}</span></span>, String(x.documentos ?? "—"), din(x.valor), x.por_cadastro ? "Pelo cadastro" : "Pelo documento",
          ] }))} />
        </section>)}
      </div>}</div>
    </BlocoRecolhivel>
    {([["Simulações", p.simulacoes], ["CT-e quebrado", p.cte], ["Combustível", p.combustivel], ["Resumo do confronto", p.confronto], ["Resumo da conferência de documentos", p.conferencia]] as const).map(([titulo, valor]) =>
      <BlocoRecolhivel key={titulo} titulo={titulo} abertoInicial={false}><div><BlocoLivre valor={valor} /></div></BlocoRecolhivel>)}
    {escrita.visivel ? <BlocoFiscal titulo="Simular uma linha" descricao="O valor digitado entra na prévia como simulado. Apagar a simulação volta a linha a “não levantado”, que não é zero.">
      <SimularLinha raiz={contexto.raiz} competencia={p.competencia} linhas={linhasSimulaveis} gravadas={pend.simulacoes} permissao={escrita} />
    </BlocoFiscal> : <p className="text-helper text-fg-muted">Simular linhas continua no painel do motor.</p>}
  </div>;
}

/** Aba Confronto de documentos (§11.4.4 e 11.4.5): pagamentos contra notas e, à parte, o relatório do Omie. */
export async function ConfrontoMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto } = tela;
  if (!contexto) return null;
  const [d, escrita] = await Promise.all([carregarConfronto(tela, params), escritaNaTela(tela.ctx, tela.motor, "fiscal_conferencia")]);
  if (!d) return null;
  const aqui = (m: Record<string, string | null> = {}) => hrefComParams(CAMINHO, params, m);
  const rotulos = d.confronto.dados?.rotulos ?? null;
  const filtrosConfronto: CampoDeFiltro[] = [{ chave: "situacao", rotulo: "Situação", vazioLabel: rotulos?.sem_nota ?? "Sem nota", sempreVisivel: true, opcoes: [
    { value: "todas", label: "Todas" },
    ...["achado", "com_nota", "possivel_duplicidade"].map((s) => ({ value: s, label: rotulos?.[s] ?? ROTULO_PADRAO[s] })),
  ] }];
  const rotulosDoc = d.documentos.dados?.rotulos ?? null;
  const filtrosDocumentos: CampoDeFiltro[] = [
    { chave: "situacao_doc", rotulo: "Situação", vazioLabel: "Todas", opcoes: Object.entries(rotulosDoc ?? {}).map(([value, label]) => ({ value, label })) },
    { chave: "pendentes", rotulo: "Decisão", vazioLabel: "Todas", opcoes: [{ value: "1", label: "Só sem decisão" }] },
  ];
  return <div className="space-y-5">
    <BlocoFiscal titulo="Pagamentos contra notas" descricao={`Planilha de pagamentos de ${contexto.competencia}, do maior valor para o menor.${escrita.visivel ? "" : " Subir a planilha continua no painel do motor."}`}>
      {escrita.visivel && <div className="mb-4"><BlocoRecolhivel titulo="Enviar a planilha do BPO (.xlsx, até 20 MB)" abertoInicial={false}><div><EnviarPlanilhaDoBpo raiz={contexto.raiz} competencia={contexto.competencia} permissao={escrita} /></div></BlocoRecolhivel></div>}
      {d.confronto.erro !== null ? <ErroDaLeitura falha={d.confronto} hrefDeNovo={aqui()} /> : <div className="space-y-3">
        {d.confronto.dados.resumo !== null && <BlocoRecolhivel titulo="Resumo do confronto" abertoInicial={false}><div><BlocoLivre valor={d.confronto.dados.resumo} /></div></BlocoRecolhivel>}
        <CascoDaTabela contagem={`${d.confronto.dados.itens.length} pagamento(s) nesta página`} filtros={<FiltrosDaTela naBarra campos={filtrosConfronto} />}>
          <TabelaFiscal vazio="Nenhum pagamento nesta situação." descricaoVazio="Troque a situação no filtro." colunas={["Fornecedor", "Documento", "Nota", "Pagamento", "Valor", "Categoria", "Situação", "Evidência", "Planilha"]} linhas={d.confronto.dados.itens.map((c) => {
            const selo = seloDoConfronto(c.situacao, rotulos);
            return { id: String(c.id), celulas: [
              <span key="f" className="block max-w-56 break-words">{c.fornecedor || "—"}</span>, c.documento || "—", c.numero_nota ?? "—", data(c.data_pagamento), din(c.valor), c.categoria || "—",
              <Selo key="s" tom={selo.tom}>{selo.rotulo}</Selo>,
              c.evidencia ? <span key="e" className="block max-w-56 break-words text-helper">{c.evidencia}</span> : "—",
              <span key="p" className="text-helper">{c.planilha || "—"}{c.posicao ? ` · linha ${c.posicao}` : ""}</span>,
            ] };
          })} />
        </CascoDaTabela>
        <PaginacaoDoMotor temCursor={!!d.cursorConfronto} proximo={d.confronto.dados.proximo_cursor} hrefInicio={aqui({ c_conf: null })} hrefProxima={(c) => aqui({ c_conf: c })} />
      </div>}
    </BlocoFiscal>

    <BlocoFiscal titulo="Conferência do relatório do Omie" descricao={`Sem decisão primeiro, depois a pior situação e o maior valor.${escrita.visivel ? "" : " Subir o relatório e decidir continuam no painel do motor."}`}>
      {escrita.visivel && <div className="mb-4"><BlocoRecolhivel titulo="Enviar o relatório do Omie (CSV, até 20 MB)" abertoInicial={false}><div><EnviarRelatorioOmie raiz={contexto.raiz} competencia={contexto.competencia} permissao={escrita} /></div></BlocoRecolhivel></div>}
      {d.documentos.erro !== null ? <ErroDaLeitura falha={d.documentos} hrefDeNovo={aqui()} /> : <div className="space-y-3">
        {d.documentos.dados.resumo !== null && <BlocoRecolhivel titulo="Resumo da conferência" abertoInicial={false}><div><BlocoLivre valor={d.documentos.dados.resumo} /></div></BlocoRecolhivel>}
        {!escrita.visivel && d.documentos.dados.decisoes.length > 0 && <p className="text-helper text-fg-muted">Decisões possíveis no painel: {d.documentos.dados.decisoes.join(", ")}.</p>}
        <CascoDaTabela contagem={`${d.documentos.dados.itens.length} documento(s) nesta página`} filtros={<FiltrosDaTela naBarra campos={filtrosDocumentos} />}>
          <TabelaFiscal vazio="Nenhum documento neste filtro." descricaoVazio="" colunas={["Número", "Fornecedor", "Data", "Valor", "Valor da nota", "Situação", "Nota achada", "Decisão", "Origem", ...(escrita.visivel ? ["Ação"] : [])]} linhas={d.documentos.dados.itens.map((x) => ({ id: String(x.id), celulas: [
            x.numero || "—", <span key="f" className="block max-w-56 break-words">{x.fornecedor || "—"}</span>, data(x.data_documento), din(x.valor), din(x.valor_nota),
            <Selo key="s" tom="neutro">{rotulosDoc?.[x.situacao] ?? x.situacao}</Selo>,
            x.chave ? <span key="c" className="block max-w-48 break-all text-helper" title={x.chave}>{x.nome_emit || x.cnpj_emit || x.chave}</span> : "—",
            x.decisao ? <span key="d">{x.decisao}<span className="block text-helper text-fg-muted">{x.decidido_por ?? ""} {dataHora(x.decidido_em)}</span></span> : <Selo key="d" tom="atencao">Sem decisão</Selo>,
            <span key="o" className="text-helper">{x.arquivo || "—"}{x.linha_num ? ` · linha ${x.linha_num}` : ""}</span>,
            ...(escrita.visivel ? [<DecidirDocumento key="d" raiz={contexto.raiz} id={x.id} decisao={x.decisao ?? ""} observacao={x.observacao ?? ""} chaveDaNota={x.chave ?? ""} permissao={escrita} />] : []),
          ] }))} />
        </CascoDaTabela>
        <PaginacaoDoMotor temCursor={!!d.cursorDocumentos} proximo={d.documentos.dados.proximo_cursor} hrefInicio={aqui({ c_doc: null })} hrefProxima={(c) => aqui({ c_doc: c })} />
      </div>}
    </BlocoFiscal>
  </div>;
}
