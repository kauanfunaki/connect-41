import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { FechamentoMotor, DemonstrativoContribMotor } from "@/components/fiscal/motor/ContribuicoesMotor";
import { ArquivosMotor } from "@/components/fiscal/motor/ArquivosMotor";
import { TabelaDeDecisoes } from "@/components/fiscal/motor/TabelaDeDecisoes";
import { AcoesDaExecucao } from "@/components/fiscal/motor/AcoesDaExecucao";
import { AcompanhamentoDaExecucao } from "@/components/fiscal/motor/AcompanhamentoDaExecucao";
import { TabelaContabilDoMotor as TabelaContabil } from "./TabelaContabil";
import { GerarContribuicoesForm } from "./GerarContribuicoesForm";
import { ContextoContribuicoes } from "./ContextoContribuicoes";
import { abrirMotor, estabelecimentosDaRaiz } from "@/lib/fiscal/motor/servidor";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { podeExcluir, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { DECISOES } from "@/lib/fiscal/motor/decisoes";
import { DECISOES_DO_CONTABIL } from "@/lib/contabil/escopoContribuicoes";
import type { EmpresaDoContabil } from "@/lib/contabil/servidor";
import { ESTADO_DA_EXECUCAO } from "@/lib/fiscal/previa/doMotor";
import { formatInstantDateTime } from "@/lib/format";
import type { ExecucaoDoMotor } from "@/lib/sped/motor";

type Params = Record<string, string | undefined>;
const href = (empresa: string, mes: string, secao: string, extra: Params = {}) => "/contabil/sped?" + new URLSearchParams(Object.fromEntries(Object.entries({ empresa, mes, aba: "contribuicoes", secao, ...extra }).filter(([, v]) => v !== undefined)) as Record<string, string>);
const quando = (s: string | null) => s ? formatInstantDateTime(new Date(s)) : "—";

export async function AreasContribuicoes({ ctx, empresa, mes, secao, params }: { ctx: AuthContext; empresa: EmpresaDoContabil; mes: string; secao: string; params: Params }) {
  const motor = await abrirMotor(ctx.tenantId);
  if (!motor) return <EmptyState title="Configure a integração do SPED" description="O EFD Contribuições é processado pelo motor remoto. Cadastre a URL e os tokens na integração do escritório." action={<Button href="/admin/integracoes" variant="secondary">Abrir integrações</Button>} />;
  if (empresa.cnpj.length !== 14) return <Aviso tom="atencao">Cadastre um CNPJ válido para esta empresa.</Aviso>;
  const raiz = empresa.cnpj.slice(0, 8);
  if (!motor.raizes.includes(raiz)) return <Aviso tom="atencao">Esta raiz de CNPJ não está no alcance configurado para o motor.</Aviso>;
  const mapa = await doMotor(() => estabelecimentosDaRaiz(ctx.tenantId, raiz));
  if (mapa.erro !== null) return <Aviso tom="atencao">{mapa.erro}</Aviso>;
  const matriz = mapa.dados.visiveis.find((e) => e.matriz);
  if (!matriz) return <Aviso tom="atencao">A matriz desta raiz precisa estar cadastrada no motor e vinculada ao escritório.</Aviso>;
  const [agir, gerir] = await Promise.all([podeNoModulo(ctx, "contabil_sped", "agir"), podeNoModulo(ctx, "contabil_sped", "gerir")]);
  const tela: TelaDoMotor = { ctx, motor, contexto: { raiz, competencia: mes, estabelecimentoId: null }, mapa: mapa.dados, estabelecimento: null, modulos: ["contabil_sped"], erro: null, contabil: { empresaId: empresa.id } };
  let conteudo: React.ReactNode;
  if (secao === "fechamento") conteudo = <FechamentoMotor tela={tela} params={params} />;
  else if (secao === "apuracao") conteudo = <DemonstrativoContribMotor tela={tela} params={params} />;
  else if (secao === "parametros") conteudo = <ParametrosContribuicoes tela={tela} params={params} podeAgir={agir && motor.escrita} />;
  else if (secao === "arquivos") conteudo = <ArquivosMotor tela={tela} params={params} permiteRegerar={agir && motor.escrita} permiteEntregas={agir && motor.escrita} />;
  else if (secao === "gerar") conteudo = <GeracaoContribuicoes tela={tela} params={params} empresaId={empresa.id} mes={mes} podeAgir={agir} podeGerir={gerir} />;
  else conteudo = <ResumoContribuicoes tela={tela} empresaId={empresa.id} mes={mes} />;
  return <ContextoContribuicoes empresaId={empresa.id}><div className="space-y-4 min-w-0">
    <p className="text-helper text-fg-secondary">Raiz {raiz} · {matriz.companyNome}. A escrituração reúne matriz e filiais.</p>
    {!motor.escrita && <Aviso tom="info">Consulta disponível. Falta o token de escrita na integração para alterar ou gerar.</Aviso>}
    {conteudo}
  </div></ContextoContribuicoes>;
}

async function ResumoContribuicoes({ tela, empresaId, mes }: { tela: TelaDoMotor; empresaId: string; mes: string }) {
  const raiz = tela.contexto!.raiz;
  const [execucoes, arquivos, fechamento] = await Promise.all([
    doMotor(() => tela.motor.cliente.listarExecucoes(raiz, { acao: "sped_contribuicoes", competencia: mes, limite: 5 })),
    doMotor(() => tela.motor.cliente.listarArquivos(raiz, { obrigacao: "contribuicoes", competencia: mes, limite: 5 })),
    doMotor(() => tela.motor.cliente.fechamento(raiz, mes)),
  ]);
  const vigente = arquivos.dados?.itens.find((a) => a.considerado);
  const pendencias = fechamento.dados?.apoio.reduce((s, a) => s + (a.conferir ?? 0), 0);
  return <div className="space-y-4">
    <dl className="grid gap-4 sm:grid-cols-3 border-y border-border py-4">{[["Integração", "Disponível"], ["Arquivo vigente", vigente ? "Versão " + vigente.versao : "Sem arquivo"], ["Apoio a conferir", pendencias === undefined ? "Indisponível" : String(pendencias)]].map(([nome, v]) => <div key={nome}><dt className="text-helper text-fg-secondary">{nome}</dt><dd className="mt-1 font-semibold">{v}</dd></div>)}</dl>
    {[execucoes.erro, arquivos.erro, fechamento.erro].filter(Boolean).map((e, i) => <Aviso key={i} tom="atencao">{e}</Aviso>)}
    {vigente && <p className="text-label">{vigente.nome_arquivo}{vigente.defasado && <Selo tom="atencao">Há decisões posteriores</Selo>}</p>}
    <h3 className="text-card-title font-semibold">Últimos pedidos</h3>
    <TabelaContabil colunas={["Pedido", "Estado", "Solicitado em", ""]} linhas={(execucoes.dados?.itens ?? []).map((e) => ({ id: String(e.id), celulas: ["#" + e.id, ESTADO_DA_EXECUCAO[e.estado], quando(e.solicitado_em), <Button key="abrir" size="xs" variant="link" href={href(empresaId, mes, "gerar", { execucao: String(e.id) })}>Acompanhar</Button>] }))} />
    <p className="text-helper text-fg-muted">As decisões e os parâmetros são os mesmos usados pelo Fiscal. As alterações ficam registradas na auditoria.</p>
  </div>;
}

async function ParametrosContribuicoes({ tela, params, podeAgir }: { tela: TelaDoMotor; params: Params; podeAgir: boolean }) {
  const tipo = DECISOES_DO_CONTABIL.find((t) => t === params.decisao) ?? "parametro_contribuicoes";
  const lista = await doMotor(() => tela.motor.cliente.listarDecisoes(tela.contexto!.raiz, tipo, { competencia: tela.contexto!.competencia, limite: 50, cursor: params.cursor }));
  const aqui = (extra: Params = {}) => href(tela.contabil!.empresaId, tela.contexto!.competencia, "parametros", { decisao: tipo, ...extra });
  return <div className="space-y-4"><nav aria-label="Tipos de parâmetros e ajustes" className="flex flex-wrap gap-2">{DECISOES_DO_CONTABIL.map((t) => <Button key={t} variant={t === tipo ? "secondary" : "ghost"} size="sm" href={aqui({ decisao: t })}>{DECISOES[t].rotulo}</Button>)}</nav>
    {lista.erro !== null ? <Aviso tom="atencao">{lista.erro}</Aviso> : <>
      <TabelaDeDecisoes tipo={tipo} raiz={tela.contexto!.raiz} linhas={lista.dados.itens} permiteAgir={podeAgir} permiteExcluir={podeExcluir(tela.ctx)} estabelecimentos={tela.mapa.visiveis.map((e) => ({ cnpj: e.cnpj, rotulo: e.companyNome }))} competencia={tela.contexto!.competencia} />
      <div className="flex gap-2">{params.cursor && <Button size="sm" variant="secondary" href={aqui()}>Voltar ao início</Button>}{lista.dados.proximo_cursor && <Button size="sm" variant="secondary" href={aqui({ cursor: lista.dados.proximo_cursor })}>Próxima página</Button>}</div>
    </>}
  </div>;
}

async function GeracaoContribuicoes({ tela, params, empresaId, mes, podeAgir, podeGerir }: { tela: TelaDoMotor; params: Params; empresaId: string; mes: string; podeAgir: boolean; podeGerir: boolean }) {
  const raiz = tela.contexto!.raiz;
  const [lista, configuracao] = await Promise.all([
    doMotor(() => tela.motor.cliente.listarExecucoes(raiz, { acao: "sped_contribuicoes", competencia: mes, limite: 50, cursor: params.cursor, estado: ["pendente", "executando", "concluida", "erro", "cancelada"].includes(params.estado ?? "") ? params.estado : undefined })),
    doMotor(() => tela.motor.cliente.listarDecisoes(raiz, "parametro_contribuicoes", { competencia: mes, limite: 1 })),
  ]);
  const id = Number(params.execucao);
  const selecionada = Number.isSafeInteger(id) && id > 0 ? id : lista.dados?.itens.find((e) => e.estado === "pendente" || e.estado === "executando")?.id;
  const detalhe = selecionada ? await doMotor(async () => {
    const e = await tela.motor.cliente.obterExecucao(raiz, selecionada);
    if (e.acao !== "sped_contribuicoes" || e.empresa_id === null || !tela.mapa.visiveis.some((x) => x.id === e.empresa_id)) return null;
    return { e, log: await tela.motor.cliente.logDaExecucao(raiz, e.id, 200) };
  }) : null;
  const valor = configuracao.dados?.itens[0]?.valor;
  const emAndamento = lista.dados?.itens.some((e) => e.estado === "pendente" || e.estado === "executando");
  const aqui = (extra: Params = {}) => href(empresaId, mes, "gerar", { estado: params.estado, ...extra });
  return <div className="space-y-4">
    <GerarContribuicoesForm empresaId={empresaId} mes={mes} pode={podeAgir && tela.motor.escrita && configuracao.erro === null && !emAndamento} motivo={!podeAgir ? "Seu perfil consulta esta área." : !tela.motor.escrita ? "Falta o token de escrita." : configuracao.erro ? "Não foi possível ler os parâmetros. Tente novamente." : emAndamento ? "Aguarde o pedido em andamento terminar." : ""} tipoInicial={valor?.tipo_escrit === "1" ? "1" : "0"} reciboInicial={String(valor?.num_rec_anterior ?? "")} />
    {lista.erro && <Aviso tom="atencao">{lista.erro}</Aviso>}{configuracao.erro && <Aviso tom="atencao">{configuracao.erro}</Aviso>}
    {detalhe?.erro && <Aviso tom="atencao">{detalhe.erro}</Aviso>}
    {detalhe?.dados && <AcompanhamentoDaExecucao key={detalhe.dados.e.id} raiz={raiz} inicial={detalhe.dados.e} logInicial={detalhe.dados.log.texto} truncadoInicial={detalhe.dados.log.truncado} />}
    {detalhe && detalhe.erro === null && !detalhe.dados && <Aviso tom="atencao">Pedido de Contribuições não encontrado.</Aviso>}
    <FiltrosDaTela campos={[{ chave: "estado", rotulo: "Estado", opcoes: Object.entries(ESTADO_DA_EXECUCAO).map(([value, label]) => ({ value, label })) }]} />
    <TabelaContabil colunas={["Pedido", "Estado", "Horário", "Resultado", "Ações"]} linhas={(lista.dados?.itens ?? []).filter((e) => e.acao === "sped_contribuicoes").map((e: ExecucaoDoMotor) => ({ id: String(e.id), celulas: ["#" + e.id, ESTADO_DA_EXECUCAO[e.estado], quando(e.solicitado_em), e.mensagem || (e.travada ? "Sem sinal do agente" : "—"), <AcoesDaExecucao key="acoes" raiz={raiz} id={e.id} podeCancelar={e.pode_cancelar} podeDestravar={e.pode_destravar} permiteAgir={podeAgir && tela.motor.escrita} permiteGerir={podeGerir && tela.motor.escrita} hrefDetalhe={aqui({ execucao: String(e.id), cursor: params.cursor })} />] }))} />
    <div className="flex gap-2">{params.cursor && <Button variant="secondary" size="sm" href={aqui()}>Voltar ao início</Button>}{lista.dados?.proximo_cursor && <Button variant="secondary" size="sm" href={aqui({ cursor: lista.dados.proximo_cursor })}>Próxima página</Button>}</div>
  </div>;
}
