import type { ReactNode } from "react";
import { ArrowRight, CircleAlert, CircleCheck, FileText, Scale, Wallet } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { ErroDaLeitura, PaginacaoDoMotor, TabelaLivre } from "@/components/fiscal/motor/LeituraDoMotor";
import { AcoesDoPagamento, ApurarCte, InformarContrato } from "@/components/fiscal/motor/EscritasFechamento";
import { carregarFechamento } from "@/lib/fiscal/motor/telas/contribuicoes";
import { escritaNaTela } from "@/lib/fiscal/motor/permissoes";
import { contagemDoMotor, data, reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { hrefComParams } from "@/lib/fiscal/motor/url";
import { chaveDoPagamentoDaLinha, COLUNA_ORIGINAL, CAMPOS_CORRIGIVEIS, correcaoGravada } from "@/lib/sped/escritasDoMotor";
import { comoTelaDoMotor, type TelaDoSped } from "@/lib/fiscal/sped/tela";
import { mesPorExtenso } from "@/lib/fiscal/sped/formato";
import { hrefDoSped } from "@/lib/fiscal/sped/etapas";

type Params = Record<string, string | string[] | undefined>;
const CAMINHO = "/fiscal/sped/fechamento";
const COLUNAS_DE_PAGAMENTO = ["tipo", "competencia", "nome", "documento", "data_pagamento", "valor_bruto", "valor_liquido", "falta_para_aceitar", "decisao", "decidido_por", "motivo_decisao", "mesmo_documento_em"] as const;
const originaisDa = (l: Record<string, unknown>) => Object.fromEntries(CAMPOS_CORRIGIVEIS.map((c) => [c, l[COLUNA_ORIGINAL[c]] == null ? "" : String(l[COLUNA_ORIGINAL[c]])])) as Record<(typeof CAMPOS_CORRIGIVEIS)[number], string>;
const din = (v: string | null) => <span className="tabular-nums">{reaisDoMotor(v)}</span>;

/**
 * O Fechamento da competência (29/10/2026), sobre as leituras do motor que a
 * aba Fechamento do SPED Generator mostra (§11.3.3 a 11.3.7): documentos,
 * faturamento, pagamentos a conferir, duplicatas e aluguéis.
 *
 * No painel eram seis blocos abertos, um embaixo do outro. Aqui o topo diz o
 * que falta — cada pendência numa linha, verde quando resolvida — e o detalhe
 * de cada uma abre no lugar, com as mesmas ações de antes.
 */
export async function FechamentoDoSped({ tela, params }: { tela: TelaDoSped; params: Params }) {
  const estab = tela.estabelecimento!;
  const telaDoMotor = await comoTelaDoMotor(tela, estab);
  const [d, escrita] = await Promise.all([
    carregarFechamento(telaDoMotor, { ...params, periodo: tela.competencia }),
    escritaNaTela(tela.ctx, tela.motor, "fiscal_contribuicoes"),
  ]);
  if (!d) return null;
  const aqui = (m: Record<string, string | null> = {}) => hrefComParams(CAMINHO, params, m);
  const raiz = estab.raiz;

  const aApurar = d.faturamento.dados?.linhas.filter((l) => l.apurar) ?? [];
  const idsAApurar = [...new Set(aApurar.flatMap((l) => l.pendentes))];
  const aConferir = d.conferencia.dados?.conferir.length ?? null;
  const duplicatas = d.conferencia.dados?.duplicatas_resumo.grupos ?? null;
  const alugueis = d.alugueis.dados?.grupos.length ?? null;
  const acoesDoPagamento = escrita.visivel ? (l: Record<string, unknown>) => {
    const chave = chaveDoPagamentoDaLinha(l);
    return chave ? <AcoesDoPagamento raiz={raiz} chave={chave} decisao={typeof l.decisao === "string" ? l.decisao : ""} falta={typeof l.falta_para_aceitar === "string" && l.falta_para_aceitar ? l.falta_para_aceitar : null} correcao={correcaoGravada(l)} originais={originaisDa(l)} permissao={escrita} /> : "—";
  } : undefined;

  return <div className="space-y-6">
    <p className="text-ui text-fg-secondary">
      Fechamento de <strong className="text-fg">{mesPorExtenso(tela.competencia)}</strong> da base inteira (raiz {raiz}: matriz e filiais), como no motor. Valor sem número é “não levantado”, não zero.
    </p>
    {escrita.visivel && escrita.motivo && <Aviso tom="neutro">{escrita.motivo}</Aviso>}

    {d.blocos.erro !== null ? <ErroDaLeitura falha={d.blocos} hrefDeNovo={aqui()} /> : <FaixaDeTotais destaque={false} itens={[
      { rotulo: "Documentos de entrada", valor: reaisDoMotor(d.blocos.dados.totais.fiscais_entrada), icone: <FileText /> },
      { rotulo: "Documentos de saída", valor: reaisDoMotor(d.blocos.dados.totais.fiscais_saida), icone: <FileText />, detalhe: d.blocos.dados.totais.sem_valor ? `${contagemDoMotor(d.blocos.dados.totais.sem_valor)} sem valor` : undefined },
      { rotulo: "Saídas − entradas", valor: reaisDoMotor(d.faturamento.dados?.totais.saidas_menos_entradas ?? null), icone: <Scale /> },
      { rotulo: "Pagamentos sem nota", valor: reaisDoMotor(d.blocos.dados.totais.apoio_liquido), icone: <Wallet />, detalhe: `${contagemDoMotor(d.blocos.dados.totais.apoio_documentos)} documento(s)` },
    ]} />}

    <section aria-labelledby="sped-pendencias" className="space-y-3">
      <h2 id="sped-pendencias" className="text-card-title font-semibold text-fg">O que falta para fechar</h2>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        <Pendencia ok={d.faturamento.erro === null && aApurar.length === 0} titulo="CT-e apurado no faturamento"
          detalhe={d.faturamento.erro !== null ? d.faturamento.erro : aApurar.length ? `Falta apurar o CT-e de ${idsAApurar.length || aApurar.length} arquivo(s): o valor fica como “não levantado”.` : "O valor do CT-e de saída já está levantado."}
          acao={idsAApurar.length > 0 && <ApurarCte raiz={raiz} ids={idsAApurar} tela="contribuicoes" permissao={escrita} />} />
        <Pendencia ok={aConferir === 0} titulo="Pagamentos a conferir"
          detalhe={aConferir === null ? d.conferencia.erro ?? "" : aConferir ? `${contagemDoMotor(aConferir)} pagamento(s) de contrato, RPA ou recibo esperando aceite.` : "Nenhum pagamento esperando aceite."} />
        <Pendencia ok={duplicatas === 0} titulo="Duplicatas"
          detalhe={duplicatas === null ? d.conferencia.erro ?? "" : duplicatas ? `${contagemDoMotor(duplicatas)} grupo(s) de pagamento repetido · excedente ${reaisDoMotor(d.conferencia.dados?.duplicatas_resumo.valor_excedente ?? null)}.` : "Nenhum pagamento repetido."} />
        <Pendencia ok={alugueis === 0} titulo="Aluguéis de imóveis"
          detalhe={alugueis === null ? d.alugueis.erro ?? "" : alugueis ? `${contagemDoMotor(alugueis)} fornecedor(es) com contrato a informar.` : "Nenhum contrato a informar."} />
      </ul>
    </section>

    {d.conferencia.dados && (aConferir ?? 0) > 0 && <BlocoRecolhivel titulo={`Pagamentos a conferir (${contagemDoMotor(aConferir)})`} abertoInicial={false}>
      <div className="space-y-3">
        {d.conferencia.dados.conferir_truncado && <Aviso tom="atencao">A fila passou de 2000 linhas: mostrando as primeiras.</Aviso>}
        <TabelaLivre linhas={d.conferencia.dados.conferir as Record<string, unknown>[]} candidatas={COLUNAS_DE_PAGAMENTO} vazio="Nenhum pagamento a conferir." acoes={acoesDoPagamento} />
      </div>
    </BlocoRecolhivel>}

    {d.duplicatas.dados && d.duplicatas.dados.itens.length > 0 && <BlocoRecolhivel titulo={`Duplicatas (${contagemDoMotor(duplicatas)})`} abertoInicial={false}>
      <div className="space-y-3">
        <TabelaFiscal vazio="Nenhuma duplicata." descricaoVazio="" colunas={["Pessoa", "Tipo", "Competência", "Pagamento", "Valor bruto", "Ocorrências", "Excedente"]} linhas={d.duplicatas.dados.itens.map((g, i) => ({ id: `${g.chave_negocio}-${i}`, celulas: [
          <span key="n">{g.nome || "—"}<span className="block text-helper text-fg-muted">{g.documento}</span></span>, g.tipo || "—", g.competencia || "—", data(g.data_pagamento), din(g.valor_bruto), contagemDoMotor(g.ocorrencias), din(g.valor_excedente),
        ] }))} />
        <PaginacaoDoMotor temCursor={!!d.cursorDuplicatas} proximo={d.duplicatas.dados.proximo_cursor} hrefInicio={aqui({ c_dup: null })} hrefProxima={(cur) => aqui({ c_dup: cur })} />
      </div>
    </BlocoRecolhivel>}

    {d.alugueis.dados && (alugueis ?? 0) > 0 && <BlocoRecolhivel titulo={`Aluguéis de imóveis (${contagemDoMotor(alugueis)})`} abertoInicial={false}>
      <div><TabelaLivre linhas={d.alugueis.dados.grupos} vazio="Nenhum aluguel pendente." acoes={escrita.visivel ? (g) => typeof g.fornecedor === "string" && g.fornecedor ? <InformarContrato raiz={raiz} fornecedor={g.fornecedor} permissao={escrita} /> : "—" : undefined} /></div>
    </BlocoRecolhivel>}

    {d.blocos.dados && <BlocoRecolhivel titulo="Documentos do período" abertoInicial={false}>
      <div className="space-y-5">
        <TabelaFiscal vazio="Nenhum documento fiscal no período." descricaoVazio="" colunas={["Documento", "Sentido", "Documentos", "Valor", "Sem valor", "Origem"]} linhas={d.blocos.dados.fiscais.map((f, i) => ({ id: `${f.tipo}-${f.sentido}-${i}`, celulas: [
          f.rotulo, f.sentido === "entrada" ? "Entrada" : f.sentido === "saida" ? "Saída" : f.sentido || "—", contagemDoMotor(f.documentos), din(f.valor), contagemDoMotor(f.sem_valor), <span key="o" className="text-helper">{f.origem || "—"}</span>,
        ] }))} />
        <TabelaFiscal vazio="Nenhum documento de apoio." descricaoVazio="" colunas={["Pagamento sem nota", "Documentos", "Pessoas", "Bruto", "Líquido", "A conferir"]} linhas={d.blocos.dados.apoio.map((a, i) => ({ id: `${a.tipo}-${i}`, celulas: [
          a.rotulo, contagemDoMotor(a.documentos), contagemDoMotor(a.pessoas), din(a.valor_bruto), din(a.valor_liquido), contagemDoMotor(a.conferir),
        ] }))} />
      </div>
    </BlocoRecolhivel>}

    {d.faturamento.dados && <BlocoRecolhivel titulo="Faturamento" abertoInicial={false}>
      <div><TabelaFiscal vazio="Sem linhas de faturamento." descricaoVazio="" colunas={["Grupo", "Documentos", "Valor", "Origem"]} linhas={d.faturamento.dados.linhas.map((l, i) => ({ id: `${l.grupo}-${i}`, celulas: [l.rotulo, contagemDoMotor(l.documentos), din(l.valor), <span key="o" className="text-helper">{l.origem || "—"}</span>] }))} /></div>
    </BlocoRecolhivel>}

    {!escrita.visivel && <p className="text-helper text-fg-muted">Seu perfil consulta o fechamento. Decidir pagamentos e informar contratos pede acesso de ação em PIS e COFINS.</p>}
    {tela.etapas.includes("gerar") && <div className="flex justify-end border-t border-border pt-4">
      <Button href={hrefDoSped("gerar", { empresa: estab.companyId, competencia: tela.competencia })}>Seguir para Gerar SPED <ArrowRight size={15} aria-hidden /></Button>
    </div>}
  </div>;
}

function Pendencia({ ok, titulo, detalhe, acao }: { ok: boolean; titulo: string; detalhe: string; acao?: ReactNode }) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
    {ok ? <CircleCheck size={18} className="flex-shrink-0 text-success" aria-label="Resolvido" /> : <CircleAlert size={18} className="flex-shrink-0 text-warning-fg" aria-label="Pendente" />}
    <span className="min-w-0 flex-1">
      <span className="block text-ui font-semibold text-fg">{titulo}</span>
      <span className="block text-helper text-fg-secondary">{detalhe}</span>
    </span>
    {acao && <div className="basis-full pl-[30px]">{acao}</div>}
  </li>;
}
