import { Suspense } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Selo } from "@/components/ui/Selo";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { BlocoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import type { TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefComParams, hrefDoMotor } from "@/lib/fiscal/motor/url";
import { contagemDoMotor, data, dataHora, percentualDoMotor, reaisDoMotor } from "@/lib/fiscal/motor/formato";
import { arquivoDaCompetencia, carregarApuracao, carregarDcipDime, carregarDemonstrativo, carregarSaldos } from "@/lib/fiscal/motor/telas/icmsIpi";
import type { Params } from "@/lib/fiscal/motor/telas/comum";
import type { ArquivoDoMotor } from "@/lib/sped/motor";
import type { GrupoCfop, LinhaCfop, QuadroDoDemonstrativo, VerbaDoDemonstrativo } from "@/lib/sped/telasDoMotor";
import { CarregandoLeituraPesada, ErroDaLeitura, EscolhaUmEstabelecimento } from "./LeituraDoMotor";

const CAMINHO = "/fiscal/icms-ipi";
const GRUPOS: { chave: GrupoCfop; rotulo: string }[] = [
  { chave: "saidas_cte", rotulo: "Saídas · CT-e" }, { chave: "saidas_nfe", rotulo: "Saídas · NF-e" },
  { chave: "entradas", rotulo: "Entradas · NF-e" }, { chave: "entradas_cte", rotulo: "Entradas · CT-e" },
];
const din = (v: string | null) => <span className="tabular-nums">{reaisDoMotor(v)}</span>;

/** O arquivo da competência e as outras versões, comum a Apuração e Demonstrativo. */
async function ComArquivo({ tela, params, aba, children }: { tela: TelaDoMotor; params: Params; aba: string; children: (arquivo: ArquivoDoMotor) => React.ReactNode }) {
  const { contexto, estabelecimento } = tela;
  if (!contexto) return null;
  if (!estabelecimento) return <EscolhaUmEstabelecimento porQue="A apuração do ICMS é por estabelecimento: escolha um no filtro acima." />;
  const escolha = await arquivoDaCompetencia(tela, params);
  if (escolha.erro !== null) return <ErroDaLeitura falha={escolha} hrefDeNovo={hrefComParams(CAMINHO, params)} />;
  const { versoes, escolhido } = escolha.dados;
  if (!escolhido) return <EmptyState title="Nenhum SPED gerado" description={`Não há EFD ICMS/IPI gerado de ${estabelecimento.companyNome} em ${contexto.competencia}.`} action={tela.modulos.includes("fiscal_operacao") ? <Button href={hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" })}>Gerar em Executar</Button> : undefined} />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 text-ui text-fg-secondary">
      <span>Arquivo:</span>
      {versoes.map((v) => v.id === escolhido.id
        ? <Selo key={v.id} tom="marca">v{v.versao}{v.considerado ? " · vigente" : ""}</Selo>
        : <Button key={v.id} size="xs" variant="secondary" href={hrefComParams(CAMINHO, params, { aba, arquivo: v.id, grupo: null, cfop: null, cst: null, aliquota: null })} scroll={false}>v{v.versao}{v.considerado ? " · vigente" : ""}</Button>)}
      <span className="text-helper text-fg-muted">{escolhido.nome_arquivo} · gerado {dataHora(escolhido.gerado_em)}</span>
    </div>
    {children(escolhido)}
  </div>;
}

function TabelaCfop({ grupo, linhas, params }: { grupo: GrupoCfop; linhas: LinhaCfop[]; params: Params }) {
  const aberto = params.grupo === grupo ? { cfop: params.cfop, cst: params.cst ?? "", aliquota: params.aliquota ?? "" } : null;
  return <TabelaFiscal vazio="Nenhuma operação neste grupo." descricaoVazio="" colunas={["CFOP", "CST", "Alíquota", "Documentos", "Valor da operação", "Base de cálculo", "ICMS", ""]} linhas={linhas.map((l, i) => {
    const este = aberto && aberto.cfop === l.cfop && aberto.cst === l.cst && aberto.aliquota === (l.aliquota ?? "");
    return { id: `${l.cfop}-${l.cst}-${l.aliquota}-${i}`, celulas: [
      l.cfop, l.cst || "—", percentualDoMotor(l.aliquota), contagemDoMotor(l.qtd), din(l.valor_operacao), din(l.valor_bc), din(l.valor_icms),
      este ? <Selo key="a" tom="marca">Aberto abaixo</Selo> : <Button key="a" size="xs" variant="secondary" href={hrefComParams(CAMINHO, params, { grupo, cfop: l.cfop, cst: l.cst || null, aliquota: l.aliquota })} scroll={false}>Ver documentos</Button>,
    ] };
  })} />;
}

/** A parte pesada da Apuração: lê o arquivo inteiro no motor. Só roda com a aba aberta. */
async function ApuracaoDoArquivo({ tela, arquivo, params }: { tela: TelaDoMotor; arquivo: ArquivoDoMotor; params: Params }) {
  const d = await carregarApuracao(tela, arquivo, params);
  if (!d) return null;
  const deNovo = hrefComParams(CAMINHO, params);
  if (d.apuracao.erro !== null) return <ErroDaLeitura falha={d.apuracao} hrefDeNovo={deNovo} />;
  const a = d.apuracao.dados;
  const e110 = Object.entries(a.e110);
  const hrefAjustes = hrefComParams(CAMINHO, params, { aba: "ajustes", arquivo: null, grupo: null, cfop: null, cst: null, aliquota: null });
  return <div className="space-y-5">
    {a.tem_divergencia ? <Aviso tom="atencao">O arquivo tem divergência nas conferências da apuração. Confira as regras marcadas abaixo.</Aviso> : <Aviso tom="sucesso">As conferências da apuração batem.</Aviso>}
    {a.ajustes_depois_da_geracao.length > 0 && <Aviso tom="atencao"><span className="flex flex-wrap items-center justify-between gap-3"><span>{a.ajustes_depois_da_geracao.length} ajuste(s) mudaram depois desta geração ({a.ajustes_depois_da_geracao.map((i) => `#${i}`).join(", ")}). Regere o arquivo para incluí-los.</span><Button size="sm" variant="secondary" href={hrefAjustes}>Ver ajustes</Button></span></Aviso>}
    {a.divergencia_banco && <Aviso tom="atencao">O saldo gravado no banco ({reaisDoMotor(a.divergencia_banco.banco)}) difere do arquivo ({reaisDoMotor(a.divergencia_banco.arquivo)}){a.divergencia_banco.origem ? ` · origem ${a.divergencia_banco.origem}` : ""}.</Aviso>}

    <div className="grid gap-5 lg:grid-cols-2">
      <BlocoFiscal titulo="E110 · apuração do ICMS" descricao="Com os nomes de campo do registro.">
        <TabelaFiscal vazio="Sem E110 no arquivo." descricaoVazio="" colunas={["Campo", "Valor"]} linhas={e110.map(([k, v]) => ({ id: k, celulas: [k, din(v)] }))} />
      </BlocoFiscal>
      <BlocoFiscal titulo="Conferências" descricao={a.saldo_banco ? `Saldo no banco: anterior ${reaisDoMotor(a.saldo_banco.saldo_credor_ant)}, a transportar ${reaisDoMotor(a.saldo_banco.saldo_a_transportar)} · ${a.saldo_banco.origem || "—"} · ${dataHora(a.saldo_banco.atualizado_em)}` : "Sem saldo gravado no banco para esta competência."}>
        <TabelaFiscal vazio="Sem conferências." descricaoVazio="" colunas={["Regra", "Esperado", "No arquivo", "Situação"]} linhas={a.conferencias.map((c, i) => ({ id: `${i}`, celulas: [<span key="r" className="block max-w-64 break-words">{c.regra}</span>, din(c.esperado), din(c.obtido), <Selo key="s" tom={c.bate ? "sucesso" : "perigo"}>{c.bate ? "Bate" : "Diverge"}</Selo>] }))} />
      </BlocoFiscal>
    </div>

    {a.ajustes_arquivo.length > 0 && <BlocoFiscal titulo="Ajustes no arquivo (E111)" descricao="Os que saíram nesta geração. Os gravados agora ficam na aba Ajustes.">
      <TabelaFiscal colunas={["Código", "Descrição", "Valor"]} linhas={a.ajustes_arquivo.map((x, i) => ({ id: `${x.codigo}-${i}`, celulas: [x.codigo, <span key="d" className="block max-w-96 break-words">{x.descricao}</span>, din(x.valor)] }))} />
    </BlocoFiscal>}

    {GRUPOS.map((g) => <BlocoFiscal key={g.chave} titulo={`CFOP · ${g.rotulo}`} descricao="Por valor da operação, do maior para o menor.">
      <div className="space-y-4">
        <TabelaCfop grupo={g.chave} linhas={a.cfop[g.chave]} params={params} />
        {d.cfop?.grupo === g.chave && d.documentos && <section aria-label="Documentos do CFOP" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-label font-semibold text-fg">Documentos do CFOP {d.cfop.cfop}{d.cfop.cst ? ` · CST ${d.cfop.cst}` : ""}{d.cfop.aliquota ? ` · ${percentualDoMotor(d.cfop.aliquota)}` : ""}</h3>
            <Button size="xs" variant="ghost" href={hrefComParams(CAMINHO, params, { grupo: null, cfop: null, cst: null, aliquota: null })} scroll={false}>Fechar</Button>
          </div>
          {d.documentos.erro !== null ? <ErroDaLeitura falha={d.documentos} hrefDeNovo={deNovo} /> : <>
            <p className="text-ui text-fg-secondary">{contagemDoMotor(d.documentos.dados.total)} documento(s) · soma {reaisDoMotor(d.documentos.dados.soma)}{d.documentos.dados.truncado ? " · mostrando os primeiros 2000" : ""}</p>
            <TabelaFiscal vazio="Nenhum documento." descricaoVazio="" colunas={["Registro", "Número", "Participante", "Data", "Valor do documento", "Valor da operação", "Base", "ICMS"]} linhas={d.documentos.dados.documentos.map((x, i) => ({ id: `${x.chave ?? x.numero}-${i}`, celulas: [
              x.registro || "—", <span key="n" title={x.chave ?? undefined}>{x.numero || "—"}</span>, <span key="p" className="block max-w-56 break-words">{x.participante || "—"}</span>, data(x.data), din(x.valor_doc), din(x.valor_operacao), din(x.valor_bc), din(x.valor_icms),
            ] }))} />
          </>}
        </section>}
      </div>
    </BlocoFiscal>)}
  </div>;
}

async function SaldosDoEstabelecimento({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const saldos = await carregarSaldos(tela);
  return <BlocoFiscal titulo="Cadeia do saldo credor" descricao="Por competência, do banco do motor.">
    {saldos.erro !== null ? <ErroDaLeitura falha={saldos} hrefDeNovo={hrefComParams(CAMINHO, params)} />
      : <TabelaFiscal vazio="Sem saldos gravados." descricaoVazio="" colunas={["Competência", "Saldo anterior", "Débitos", "Créditos", "Saldo apurado", "A transportar", "Origem", "Atualizado em"]} linhas={saldos.dados.map((s) => ({ id: s.competencia, celulas: [
        tela.contexto?.competencia === s.competencia ? <strong key="c">{s.competencia}</strong> : s.competencia, din(s.saldo_credor_ant), din(s.debitos), din(s.creditos), din(s.saldo_apurado), din(s.saldo_a_transportar), s.origem || "—", dataHora(s.atualizado_em),
      ] }))} />}
  </BlocoFiscal>;
}

/** Aba Apuração (§11.2.1, 11.2.2, 11.2.4). */
export function ApuracaoIcmsMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const chave = JSON.stringify([params.arquivo, params.grupo, params.cfop, params.cst, params.aliquota, params.estab, params.competencia, params.raiz]);
  return <div className="space-y-5">
    <ComArquivo tela={tela} params={params} aba="apuracao">
      {(arquivo) => <Suspense key={chave} fallback={<CarregandoLeituraPesada oQue={params.cfop ? "a apuração e os documentos do CFOP" : "a apuração do arquivo"} />}>
        <ApuracaoDoArquivo tela={tela} arquivo={arquivo} params={params} />
      </Suspense>}
    </ComArquivo>
    {tela.estabelecimento && <SaldosDoEstabelecimento tela={tela} params={params} />}
  </div>;
}

function TabelaDeQuadros({ quadros, total }: { quadros: QuadroDoDemonstrativo[]; total: QuadroDoDemonstrativo }) {
  const linha = (q: QuadroDoDemonstrativo, rotulo?: string) => [rotulo ? <strong key="c">{rotulo}</strong> : q.cfop || "—", din(q.valor_contabil), din(q.base_calculo), percentualDoMotor(q.aliquota), din(q.imposto), din(q.isentas), din(q.outras)];
  return <TabelaFiscal vazio="Sem operações." descricaoVazio="" colunas={["CFOP", "Valor contábil", "Base de cálculo", "Alíquota", "Imposto", "Isentas", "Outras"]} linhas={[...quadros.map((q, i) => ({ id: `${q.cfop}-${i}`, celulas: linha(q) })), ...(quadros.length ? [{ id: "total", celulas: linha(total, "Total") }] : [])]} />;
}

function Verbas({ titulo, verbas }: { titulo: string; verbas: VerbaDoDemonstrativo[] }) {
  return <section aria-label={titulo}>
    <h3 className="mb-2 text-label font-semibold text-fg">{titulo}</h3>
    <TabelaFiscal vazio="Nada lançado." descricaoVazio="" colunas={["Descrição", "Detalhe", "Valor"]} linhas={verbas.map((v, i) => ({ id: `${i}`, celulas: [v.total ? <strong key="d">{v.descricao}</strong> : v.descricao, v.detalhe || "—", v.total ? <strong key="v">{reaisDoMotor(v.valor)}</strong> : din(v.valor)] }))} />
  </section>;
}

async function DemonstrativoDoArquivo({ tela, arquivo, params }: { tela: TelaDoMotor; arquivo: ArquivoDoMotor; params: Params }) {
  const d = await carregarDemonstrativo(tela, arquivo);
  if (d.erro !== null) return <ErroDaLeitura falha={d} hrefDeNovo={hrefComParams(CAMINHO, params)} />;
  const x = d.dados;
  return <div className="space-y-5">
    <BlocoFiscal titulo={`Demonstrativo do ICMS · ${x.competencia}`} descricao={`${x.empresa || x.cnpj} · ${x.nome}`}>
      <div className="space-y-5">
        <section aria-label="Saídas"><h3 className="mb-2 text-label font-semibold text-fg">Saídas</h3><TabelaDeQuadros quadros={x.saidas} total={x.total_saidas} /></section>
        <section aria-label="Entradas"><h3 className="mb-2 text-label font-semibold text-fg">Entradas</h3><TabelaDeQuadros quadros={x.entradas} total={x.total_entradas} /></section>
        <div className="grid gap-5 lg:grid-cols-3"><Verbas titulo="Débitos" verbas={x.debitos} /><Verbas titulo="Créditos" verbas={x.creditos} /><Verbas titulo="Apuração" verbas={x.apuracao} /></div>
      </div>
    </BlocoFiscal>
  </div>;
}

/** Aba Demonstrativo (§11.2.3): pesada, com o mesmo cache da apuração no motor. */
export function DemonstrativoIcmsMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const chave = JSON.stringify([params.arquivo, params.estab, params.competencia, params.raiz]);
  return <ComArquivo tela={tela} params={params} aba="demonstrativo">
    {(arquivo) => <Suspense key={chave} fallback={<CarregandoLeituraPesada oQue="o demonstrativo do arquivo" />}><DemonstrativoDoArquivo tela={tela} arquivo={arquivo} params={params} /></Suspense>}
  </ComArquivo>;
}

/** Aba DCIP e DIME (§11.2.5 e 11.2.6). Gravar continua nos ajustes (`/decisoes/ajuste_apuracao`). */
export async function DcipDimeMotor({ tela, params }: { tela: TelaDoMotor; params: Params }) {
  const { contexto, estabelecimento } = tela;
  if (!contexto) return null;
  if (!estabelecimento) return <EscolhaUmEstabelecimento porQue="DCIP e DIME são por estabelecimento de Santa Catarina: escolha um no filtro acima." />;
  const d = await carregarDcipDime(tela);
  if (!d) return null;
  const deNovo = hrefComParams(CAMINHO, params);
  const hrefAjustes = hrefComParams(CAMINHO, params, { aba: "ajustes" });
  const codigosSc = new Map((d.tabelas.dados?.codigos_sc ?? []).map((c) => [c.codigo, c.descricao]));
  return <div className="space-y-5">
    {d.dcip.erro !== null ? <ErroDaLeitura falha={d.dcip} hrefDeNovo={deNovo} /> : (() => {
      const x = d.dcip.dados;
      const q46 = new Set(x.resumo.quadro_46_ids);
      const q12 = new Set(x.resumo.quadro_12_ids);
      const sem = new Set(x.resumo.sem_item_ids);
      return <BlocoFiscal titulo={`DCIP e DIME · ${x.competencia}`} descricao={`${estabelecimento.companyNome} · total ${reaisDoMotor(x.resumo.total)} · créditos da DCIP ${reaisDoMotor(x.resumo.creditos_dcip)}`} acao={<Button size="sm" variant="secondary" href={hrefAjustes}>Editar nos Ajustes</Button>}>
        <div className="space-y-3">
          {sem.size > 0 && <Aviso tom="atencao">{sem.size} ajuste(s) sem item da DIME: {[...sem].map((i) => `#${i}`).join(", ")}.</Aviso>}
          <TabelaFiscal vazio="Nenhum ajuste na competência." descricaoVazio="Os ajustes são gravados na aba Ajustes." colunas={["Ajuste", "Código", "Natureza", "Subtipo DCIP", "Valor", "Na DIME"]} linhas={x.ajustes.map((a) => ({ id: String(a.id), celulas: [
            <span key="i">#{a.id}<span className="block max-w-56 break-words text-helper text-fg-muted">{a.descricao}</span></span>,
            <span key="c" title={codigosSc.get(a.codigo)}>{a.codigo || "—"}</span>, a.natureza || "—", a.subtipo_dcip ?? "—", din(a.valor),
            <span key="q" className="flex flex-wrap justify-center gap-1">{q46.has(a.id) && <Selo tom="marca">Quadro 46</Selo>}{q12.has(a.id) && <Selo tom="marca">Quadro 12</Selo>}{sem.has(a.id) && <Selo tom="atencao">Sem item</Selo>}{!q46.has(a.id) && !q12.has(a.id) && !sem.has(a.id) && "—"}</span>,
          ] }))} />
        </div>
      </BlocoFiscal>;
    })()}
    {d.tabelas.erro !== null ? <ErroDaLeitura falha={d.tabelas} hrefDeNovo={deNovo} /> : <BlocoRecolhivel titulo="Tabelas de códigos do ICMS" abertoInicial={false}>
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Naturezas"><h3 className="mb-2 text-label font-semibold text-fg">Naturezas</h3><TabelaFiscal colunas={["Natureza", "Rótulo", "Efeito"]} linhas={Object.entries(d.tabelas.dados.naturezas).map(([k, v]) => ({ id: k, celulas: [k, v.rotulo, v.efeito] }))} /></section>
        <section aria-label="Códigos de SC"><h3 className="mb-2 text-label font-semibold text-fg">Códigos de SC</h3><TabelaFiscal vazio="Sem códigos." descricaoVazio="" colunas={["Código", "Descrição"]} linhas={d.tabelas.dados.codigos_sc.map((c, i) => ({ id: `${c.codigo}-${i}`, celulas: [c.codigo, c.descricao] }))} /></section>
        <section aria-label="Itens do quadro 04"><h3 className="mb-2 text-label font-semibold text-fg">Itens do quadro 04</h3><TabelaFiscal vazio="Sem itens." descricaoVazio="" colunas={["Item", "Descrição"]} linhas={d.tabelas.dados.itens_quadro_04.map((c, i) => ({ id: `${c.item}-${i}`, celulas: [c.item, c.descricao] }))} /></section>
        <section aria-label="Itens do quadro 05"><h3 className="mb-2 text-label font-semibold text-fg">Itens do quadro 05</h3><TabelaFiscal vazio="Sem itens." descricaoVazio="" colunas={["Item", "Descrição"]} linhas={d.tabelas.dados.itens_quadro_05.map((c, i) => ({ id: `${c.item}-${i}`, celulas: [c.item, c.descricao] }))} /></section>
        <section aria-label="Origens do quadro 46"><h3 className="mb-2 text-label font-semibold text-fg">Origens do quadro 46</h3><TabelaFiscal vazio="Sem origens." descricaoVazio="" colunas={["Código", "Descrição"]} linhas={d.tabelas.dados.origens_quadro_46.map((c, i) => ({ id: `${c.codigo}-${i}`, celulas: [c.codigo, c.descricao] }))} /></section>
        <section aria-label="Códigos conhecidos"><h3 className="mb-2 text-label font-semibold text-fg">Códigos de ajuste conhecidos</h3><TabelaFiscal vazio="Sem códigos." descricaoVazio="" colunas={["Código", "Descrição"]} linhas={d.tabelas.dados.codigos_conhecidos.map((c, i) => ({ id: `${c.codigo}-${i}`, celulas: [c.codigo, c.descricao] }))} /></section>
      </div>
    </BlocoRecolhivel>}
  </div>;
}
