import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { BlocoFiscal, EstadoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { errosDaValidacao, linhasDosTotais, situacaoDoArquivo } from "@/lib/fiscal/previa/doMotor";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefDoMotor, param } from "@/lib/fiscal/motor/url";
import { cnpjFormatado, data, dataHora, tamanho } from "@/lib/fiscal/motor/formato";
import { formatarNumero } from "@/lib/format";
import type { ArquivoDetalhado, RegistroDeDecisao } from "@/lib/sped/motor";
import { AcoesDoArquivo } from "./AcoesDoArquivo";
import { FocoAoAbrir } from "./FocoAoAbrir";

const FILTROS: CampoDeFiltro[] = [
  { chave: "obrigacao", rotulo: "Obrigação", opcoes: [{ value: "icms_ipi", label: "EFD ICMS/IPI" }, { value: "contribuicoes", label: "EFD Contribuições" }] },
  { chave: "vigencia", rotulo: "Vigência", vazioLabel: "Todas as versões", opcoes: [{ value: "vigente", label: "Só as vigentes" }] },
];
const OBRIGACAO = { icms_ipi: "EFD ICMS/IPI", contribuicoes: "EFD Contribuições" } as const;
const ENTREGA: Record<string, string> = { nao_registrada: "Não registrada", registrada: "Registrada", outro_arquivo: "Outro arquivo foi entregue", dominio: "Vale o arquivo da Domínio", nenhum: "Sem entrega" };
const ACAO_NO_REGISTRO: Record<string, string> = { criou: "Criou", mudou: "Mudou", apagou: "Apagou" };

/**
 * SPED gerados com o motor real: a lista do motor (`GET /arquivos`), e o
 * detalhe com totais, validação, entrega e — o que a prévia simulava com
 * "revisão" — o `defasado` do motor com as decisões gravadas depois da
 * geração (`GET /arquivos/{id}/decisoes?visao=posteriores`).
 */
export async function ArquivosMotor({ tela, params, permiteRegerar, permiteEntregas }: {
  tela: TelaDoMotor;
  params: Record<string, string | string[] | undefined>;
  permiteRegerar: boolean;
  permiteEntregas: boolean;
}) {
  const { contexto, motor, mapa } = tela;
  if (!contexto) return null;
  const porCnpj = new Map(mapa.visiveis.map((e) => [e.cnpj, e]));
  const cursor = param(params, "cursor") ?? null;
  const obrigacao = param(params, "obrigacao");
  const obrigacaoValida = obrigacao === "icms_ipi" || obrigacao === "contribuicoes" ? obrigacao : undefined;
  const vigentes = param(params, "vigencia") === "vigente";
  const lista = await doMotor(() => motor.cliente.listarArquivos(contexto.raiz, {
    competencia: contexto.competencia, obrigacao: obrigacaoValida, cnpj: tela.estabelecimento?.cnpj, apenas_considerados: vigentes, limite: 50, cursor,
  }));
  const arquivos = (lista.dados?.itens ?? []).filter((a) => porCnpj.has(a.cnpj));
  const hrefDe = (extra: Record<string, string | number | undefined>) => hrefDoMotor("/fiscal/entregas", contexto, { obrigacao: obrigacaoValida, vigencia: vigentes ? "vigente" : undefined, ...extra });
  const hrefDownload = (id: number) => `/api/fiscal/sped/arquivos/${id}/download?raiz=${contexto.raiz}`;

  const idAberto = Number(param(params, "arquivo"));
  const detalhe = Number.isSafeInteger(idAberto) && idAberto > 0 ? await doMotor(async () => {
    const a = await motor.cliente.obterArquivo(contexto.raiz, idAberto);
    if (!porCnpj.has(a.cnpj)) return null;
    const [validacao, posteriores] = await Promise.all([
      a.validacao.estado === "nao_validado" ? null : motor.cliente.obterValidacao(contexto.raiz, a.id).catch(() => null),
      a.decisao_ate === null ? null : motor.cliente.decisoesDoArquivo(contexto.raiz, a.id, { visao: "posteriores", limite: 50 }).catch(() => null),
    ]);
    return { a, erros: validacao ? errosDaValidacao(validacao) : [], achadosTotal: validacao?.achados_total ?? null, posteriores };
  }) : null;

  return <div className="space-y-5">
    {detalhe?.erro && <Aviso tom="atencao">{detalhe.erro}</Aviso>}
    {detalhe && !detalhe.erro && !detalhe.dados && <Aviso tom="atencao">Arquivo não encontrado entre as empresas que você acessa.</Aviso>}
    {detalhe?.dados && <FocoAoAbrir key={detalhe.dados.a.id} rotulo={`Detalhes do arquivo #${detalhe.dados.a.id}`}><DetalheDoArquivo {...detalhe.dados} hrefFechar={hrefDe({ cursor: cursor ?? undefined })} estabelecimento={porCnpj.get(detalhe.dados.a.cnpj)?.companyNome ?? cnpjFormatado(detalhe.dados.a.cnpj)}
      hrefExecucao={detalhe.dados.a.execucao_id && tela.modulos.includes("fiscal_operacao") ? hrefDoMotor("/fiscal/operacao", contexto, { aba: "historico", execucao: detalhe.dados.a.execucao_id }) : null}
      acoes={<AcoesDoArquivo raiz={contexto.raiz} id={detalhe.dados.a.id} hrefDownload={hrefDownload(detalhe.dados.a.id)} obrigacao={detalhe.dados.a.obrigacao} validando={detalhe.dados.a.validacao.estado === "validando"} entregue={detalhe.dados.a.entrega.estado === "registrada"} permiteRegerar={permiteRegerar} permiteEntregas={permiteEntregas} />} /></FocoAoAbrir>}
    {lista.erro && <Aviso tom="atencao">{lista.erro}</Aviso>}
    <CascoDaTabela contagem={`${arquivos.length} arquivo(s) nesta página`} filtros={<FiltrosDaTela naBarra campos={FILTROS} />} acoes={tela.modulos.includes("fiscal_operacao") && <Button href={hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" })}>Gerar novo SPED</Button>}>
      <TabelaFiscal vazio="Nenhum SPED gerado neste filtro." descricaoVazio={`Competência ${contexto.competencia}. Troque o filtro, a competência ou o estabelecimento.`} colunas={["Arquivo / obrigação", "Estabelecimento", "Competência", "Versão", "Situação", "Gerado em", "Ações"]} linhas={arquivos.map((a) => ({ id: String(a.id), celulas: [
        <span key="nome" className="block max-w-60 break-words text-helper">{a.nome_arquivo}<span className="block text-ui font-medium">{OBRIGACAO[a.obrigacao]}</span></span>,
        porCnpj.get(a.cnpj)?.companyNome ?? cnpjFormatado(a.cnpj),
        a.competencia,
        <span key="versao">v{a.versao}<span className="block text-helper text-fg-muted">{a.considerado ? "Vigente" : a.superado_por ? `Superada pela #${a.superado_por}` : "Não considerada"}</span></span>,
        <span key="situacao" className="flex flex-col items-start gap-1"><EstadoFiscal>{situacaoDoArquivo(a)}</EstadoFiscal>{a.defasado && a.decisoes_posteriores ? <span className="text-helper text-fg-muted">{a.decisoes_posteriores} decisão(ões) depois</span> : null}</span>,
        dataHora(a.gerado_em),
        <span key="acoes" className="flex flex-wrap items-center gap-2"><Button size="xs" variant="secondary" href={hrefDe({ arquivo: a.id, cursor: cursor ?? undefined })} scroll={false}>Ver detalhes</Button><Button size="xs" variant="ghost" href={hrefDownload(a.id)} download>Baixar</Button></span>,
      ] }))} />
    </CascoDaTabela>
    <div className="flex flex-wrap gap-3">
      {cursor && <Button variant="secondary" size="sm" href={hrefDe({})}>Voltar ao início</Button>}
      {lista.dados?.proximo_cursor && <Button variant="secondary" size="sm" href={hrefDe({ cursor: lista.dados.proximo_cursor })}>Próxima página</Button>}
    </div>
  </div>;
}

function DetalheDoArquivo({ a, erros, achadosTotal, posteriores, estabelecimento, hrefExecucao, hrefFechar, acoes }: {
  a: ArquivoDetalhado;
  erros: string[];
  achadosTotal: number | null;
  posteriores: { itens: RegistroDeDecisao[]; proximo_cursor: string | null; rastreado?: boolean } | null;
  estabelecimento: string;
  hrefExecucao: string | null;
  hrefFechar: string;
  acoes: React.ReactNode;
}) {
  const totais = linhasDosTotais(a.totais);
  const fatos: [string, React.ReactNode][] = [
    ["Obrigação", OBRIGACAO[a.obrigacao]], ["Estabelecimento", estabelecimento], ["Período", `${data(a.data_ini)} a ${data(a.data_fim)}`],
    ["Versão", `v${a.versao} · ${a.considerado ? "vigente" : "superada"}`], ["Tipo", a.retificadora === null ? "Não registrado" : a.retificadora ? "Substituto" : "Original"],
    ["Gerado em", dataHora(a.gerado_em)], ["Linhas", a.qtd_linhas != null ? formatarNumero(a.qtd_linhas, 0) : "—"], ["Tamanho", tamanho(a.tamanho_bytes)],
    ["NF-e / CT-e", `${a.qtd_nfe ?? "—"} / ${a.qtd_cte ?? "—"}`],
    ["Execução", hrefExecucao ? <Button key="e" href={hrefExecucao} variant="link" size="xs">#{a.execucao_id}</Button> : a.execucao_id ? `#${a.execucao_id}` : "Arquivo anterior ao rastreio"],
  ];
  return <BlocoFiscal titulo={a.nome_arquivo} descricao={`Arquivo #${a.id} no motor SPED`} acao={<span className="flex flex-wrap items-center gap-2"><EstadoFiscal>{situacaoDoArquivo(a)}</EstadoFiscal><Button href={hrefFechar} variant="ghost" size="xs" scroll={false}>Fechar</Button></span>}>
    <div className="space-y-5">
      {acoes}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{fatos.map(([rotulo, valor]) => <div key={rotulo}><dt className="text-helper text-fg-secondary">{rotulo}</dt><dd className="mt-1 text-ui text-fg">{valor}</dd></div>)}</dl>

      <section aria-label="Decisões depois da geração">
        <h3 className="mb-2 text-label font-semibold text-fg">Decisões depois da geração</h3>
        {a.decisao_ate === null
          ? <Aviso tom="neutro">Arquivo gerado antes do registro de decisões: {a.defasado ? "o motor estima que ele está defasado (heurística antiga, que erra para mais)." : "sem indício de defasagem pela heurística antiga."}</Aviso>
          : !a.defasado ? <Aviso tom="sucesso">Nenhuma decisão foi gravada depois desta geração (registro até #{a.decisao_ate}).</Aviso>
            : <>
              <Aviso tom="atencao" className="mb-3"><span className="flex items-center gap-2"><Selo tom="atencao">Defasado</Selo>{a.decisoes_posteriores ?? "Algumas"} decisão(ões) gravada(s) depois desta geração. Regere para que o arquivo as inclua.</span></Aviso>
              <TabelaFiscal vazio="Nenhuma decisão listada." descricaoVazio="" colunas={["Quando", "Quem", "Tabela", "Chave", "Ação", "Competência"]} linhas={(posteriores?.itens ?? []).map((r) => ({ id: String(r.id), celulas: [
                dataHora(r.em), <span key="quem">{r.ator_nome ?? r.ator}<span className="block text-helper text-fg-muted">{r.origem}</span></span>, r.tabela, <span key="chave" className="block max-w-56 break-all text-helper">{r.chave}</span>, ACAO_NO_REGISTRO[r.acao] ?? r.acao, r.competencia ?? "Todas",
              ] }))} />
              {posteriores?.proximo_cursor && <p className="mt-2 text-helper text-fg-muted">Mostrando as 50 primeiras.</p>}
            </>}
      </section>

      <section aria-label="Validação">
        <h3 className="mb-2 text-label font-semibold text-fg">Validação</h3>
        <p className="text-ui text-fg-secondary">
          {a.validacao.estado === "nao_validado" ? "Ainda não validado." : a.validacao.estado === "validando" ? "Validação em andamento no motor." : `${a.validacao.erros ?? 0} erro(s) e ${a.validacao.advertencias ?? 0} advertência(s) · concluída ${dataHora(a.validacao.concluido_em)}`}
          {a.validacao.mensagem ? ` · ${a.validacao.mensagem}` : ""}
        </p>
        {erros.length > 0 && <ul className="mt-2 list-disc pl-5 text-ui text-warning-fg">{erros.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        {achadosTotal !== null && achadosTotal > erros.length && erros.length > 0 && <p className="mt-1 text-helper text-fg-muted">{achadosTotal} achado(s) no total; o relatório completo fica no painel do motor.</p>}
      </section>

      <section aria-label="Entrega">
        <h3 className="mb-2 text-label font-semibold text-fg">Entrega</h3>
        <p className="text-ui text-fg-secondary">
          {ENTREGA[a.entrega.estado] ?? a.entrega.estado}
          {a.entrega.tipo ? ` · ${a.entrega.tipo}` : ""}{a.entrega.recibo ? ` · recibo ${a.entrega.recibo}` : ""}{a.entrega.data_entrega ? ` · em ${data(a.entrega.data_entrega)}` : ""}
          {a.entrega.decidido_por ? ` · registrada por ${a.entrega.decidido_por}${a.entrega.decidido_em ? ` em ${dataHora(a.entrega.decidido_em)}` : ""}` : ""}
        </p>
      </section>

      <section aria-label="Totais do arquivo">
        <h3 className="mb-2 text-label font-semibold text-fg">Totais do arquivo</h3>
        {a.totais_erro ? <Aviso tom="atencao">Não foi possível ler os totais: {a.totais_erro}</Aviso>
          : totais.length === 0 ? <p className="text-ui text-fg-muted">Sem totais.</p>
            : <TabelaFiscal colunas={["Campo", "Valor"]} linhas={totais.map((t) => ({ id: t.campo, celulas: [t.campo, <span key="v" className="tabular-nums">{t.valor}</span>] }))} />}
      </section>
    </div>
  </BlocoFiscal>;
}
