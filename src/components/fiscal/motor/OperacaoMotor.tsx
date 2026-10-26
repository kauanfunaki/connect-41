import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { CascoDaTabela } from "@/components/shared/CascoDaTabela";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { BlocoFiscal, EstadoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { MODOS_EXECUCAO } from "@/lib/fiscal/previa/execucao";
import { ESTADO_DA_EXECUCAO } from "@/lib/fiscal/previa/doMotor";
import { ACOES_DE_EXECUCAO, ESTADOS_DE_EXECUCAO, type ExecucaoDoMotor } from "@/lib/sped/motor";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefDoMotor, param } from "@/lib/fiscal/motor/url";
import { dataHora, duracao } from "@/lib/fiscal/motor/formato";
import { FormularioDeExecucao } from "./FormularioDeExecucao";
import { AcoesDaExecucao } from "./AcoesDaExecucao";
import { AcompanhamentoDaExecucao } from "./AcompanhamentoDaExecucao";

const FILTROS: CampoDeFiltro[] = [
  { chave: "estado", rotulo: "Estado", opcoes: ESTADOS_DE_EXECUCAO.map((e) => ({ value: e, label: ESTADO_DA_EXECUCAO[e] })) },
  { chave: "acao", rotulo: "Ação", opcoes: ACOES_DE_EXECUCAO.map((a) => ({ value: a, label: MODOS_EXECUCAO[a] })) },
];

/**
 * Executar e Histórico com o motor real: o pedido vai para a fila do motor; a
 * lista é a fila (`GET /execucoes`), paginada pelo cursor do motor; o detalhe
 * acompanha o log enquanto a execução roda. Só aparecem execuções dos
 * estabelecimentos que a pessoa vê.
 */
export async function OperacaoMotor({ tela, aba, params, permiteAgir, permiteGerir }: {
  tela: TelaDoMotor;
  aba: string;
  params: Record<string, string | string[] | undefined>;
  permiteAgir: boolean;
  permiteGerir: boolean;
}) {
  const { contexto, motor, mapa } = tela;
  if (!contexto) return null;
  const vistos = new Map(mapa.visiveis.map((e) => [e.id, e]));
  const doRecorte = (e: ExecucaoDoMotor) => e.empresa_id !== null && vistos.has(e.empresa_id) && (!contexto.estabelecimentoId || e.empresa_id === contexto.estabelecimentoId);
  const historico = aba === "historico";
  const cursor = param(params, "cursor") ?? null;
  const estado = param(params, "estado");
  const acao = param(params, "acao");
  const estadoValido = estado && (ESTADOS_DE_EXECUCAO as readonly string[]).includes(estado) ? estado : undefined;
  const acaoValida = acao && (ACOES_DE_EXECUCAO as readonly string[]).includes(acao) ? acao : undefined;
  const lista = await doMotor(() => motor.cliente.listarExecucoes(contexto.raiz, historico
    ? { estado: estadoValido, acao: acaoValida, competencia: contexto.competencia, empresa_id: contexto.estabelecimentoId ?? undefined, limite: 50, cursor }
    : { estado: "pendente,executando", empresa_id: contexto.estabelecimentoId ?? undefined, limite: 50 }));
  const execucoes = (lista.dados?.itens ?? []).filter(doRecorte);

  const idAberto = Number(param(params, "execucao"));
  const detalhe = Number.isSafeInteger(idAberto) && idAberto > 0
    ? await doMotor(async () => {
      const e = await motor.cliente.obterExecucao(contexto.raiz, idAberto);
      if (e.empresa_id === null || !vistos.has(e.empresa_id)) return null;
      return { e, log: await motor.cliente.logDaExecucao(contexto.raiz, idAberto, 200) };
    })
    : null;

  const hrefDe = (extra: Record<string, string | number | undefined>) => hrefDoMotor("/fiscal/operacao", contexto, { aba, estado: estadoValido, acao: acaoValida, ...extra });
  const linhas = execucoes.map((e) => {
    const estab = e.empresa_id !== null ? vistos.get(e.empresa_id) : undefined;
    return { id: String(e.id), celulas: [
      <span key="acao" className="block max-w-64">#{e.id} · {MODOS_EXECUCAO[e.acao as keyof typeof MODOS_EXECUCAO] ?? e.rotulo ?? e.acao}<span className="block text-helper text-fg-muted">{estab?.companyNome ?? "—"}{e.solicitado_por ? ` · ${e.solicitado_por}` : ""}</span></span>,
      `${e.data_ini} a ${e.data_fim}`,
      <span key="estado" className="flex flex-col items-start gap-1"><EstadoFiscal>{ESTADO_DA_EXECUCAO[e.estado]}</EstadoFiscal>{e.travada && <Selo tom="atencao">Sem sinal do agente</Selo>}</span>,
      <span key="hora" className="text-helper">Pedido: {dataHora(e.solicitado_em)}<span className="block">Início: {dataHora(e.iniciado_em)}</span><span className="block">{duracao(e.iniciado_em, e.concluido_em)}</span></span>,
      <span key="resultado" className="block max-w-60 text-helper">{e.mensagem ?? (e.agente_host ? `Agente ${e.agente_host}` : "—")}{tela.modulos.includes("fiscal_entregas") && e.arquivo_ids.map((id) => <Button key={id} href={hrefDoMotor("/fiscal/entregas", contexto, { arquivo: id })} size="xs" variant="link">Arquivo #{id}</Button>)}</span>,
      <AcoesDaExecucao key="acoes" raiz={contexto.raiz} id={e.id} podeCancelar={e.pode_cancelar} podeDestravar={e.pode_destravar} permiteAgir={permiteAgir} permiteGerir={permiteGerir} hrefDetalhe={hrefDe({ execucao: e.id, cursor: cursor ?? undefined })} />,
    ] };
  });
  const colunas = ["Ação", "Período", "Estado", "Horários", "Resultado", "Ações"];
  const motivo = !motor.escrita ? "Escrita do SPED não habilitada: os pedidos ficam desabilitados." : !permiteAgir ? "Seu perfil consulta a fila, mas não pode enviar pedidos." : null;

  return <div className="space-y-5">
    {detalhe?.erro && <Aviso tom="atencao">{detalhe.erro}</Aviso>}
    {detalhe?.dados && <AcompanhamentoDaExecucao key={detalhe.dados.e.id} raiz={contexto.raiz} inicial={detalhe.dados.e} logInicial={detalhe.dados.log.texto} truncadoInicial={detalhe.dados.log.truncado} />}
    {detalhe && !detalhe.erro && !detalhe.dados && <Aviso tom="atencao">Execução não encontrada entre as empresas que você acessa.</Aviso>}
    {lista.erro && <Aviso tom="atencao">{lista.erro}</Aviso>}
    {historico ? <>
      <CascoDaTabela contagem={`${execucoes.length} execução(ões) nesta página`} filtros={<FiltrosDaTela naBarra campos={FILTROS} />} acoes={<Button href={hrefDoMotor("/fiscal/operacao", contexto, { aba: "executar" })}>Nova execução</Button>}>
        <TabelaFiscal vazio="Nenhuma execução neste filtro." descricaoVazio={`Competência ${contexto.competencia}. Troque o filtro ou a competência.`} colunas={colunas} linhas={linhas} />
      </CascoDaTabela>
      <div className="flex flex-wrap gap-3">
        {cursor && <Button variant="secondary" size="sm" href={hrefDe({})}>Voltar ao início</Button>}
        {lista.dados?.proximo_cursor && <Button variant="secondary" size="sm" href={hrefDe({ cursor: lista.dados.proximo_cursor })}>Próxima página</Button>}
      </div>
    </> : <>
      <FormularioDeExecucao raiz={contexto.raiz} estabelecimentos={mapa.visiveis.map((e) => ({ id: e.id, rotulo: `${e.companyNome} · ${e.uf}`, matriz: e.matriz, ativo: e.ativo }))} estabelecimentoId={contexto.estabelecimentoId} competencia={contexto.competencia} podeSolicitar={motor.escrita && permiteAgir} motivo={motivo} />
      <BlocoFiscal titulo="Fila do motor" descricao={`${execucoes.length} pedido(s) na fila ou executando. A lista se atualiza ao recarregar; o log de cada um se atualiza sozinho.`} acao={<Button href={hrefDoMotor("/fiscal/operacao", contexto, { aba: "historico" })} variant="link" size="sm">Ver histórico</Button>}>
        <TabelaFiscal vazio="Nenhum pedido na fila." descricaoVazio="Os pedidos enviados aparecem aqui até o agente concluir." colunas={colunas} linhas={linhas} />
      </BlocoFiscal>
    </>}
  </div>;
}
