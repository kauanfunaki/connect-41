import { AlertTriangle, BadgeCheck, CheckCircle2, Clock, FileText, Play, RefreshCw, Send } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { BlocoFiscal, MetricasFiscais, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { hrefDoMotor } from "@/lib/fiscal/motor/url";
import { dataHora } from "@/lib/fiscal/motor/formato";
import { validacaoDoArquivo } from "@/lib/fiscal/previa/doMotor";

/** Agente sem sinal há mais de 3 minutos aparece como sem comunicação — a régua do Ops Center. */
const SEM_SINAL_S = 180;

/**
 * Painel com o motor real: a saúde (`GET /saude`) — agentes, banco e fila da
 * raiz — e os arquivos da competência (`GET /arquivos`). Nada é calculado
 * aqui além de contar o que o motor devolveu.
 */
export async function PainelMotor({ tela }: { tela: TelaDoMotor }) {
  const { contexto, motor, mapa } = tela;
  if (!contexto) return null;
  const vistos = new Set(mapa.visiveis.filter((e) => !contexto.estabelecimentoId || e.id === contexto.estabelecimentoId).map((e) => e.cnpj));
  const [saude, arquivos] = await Promise.all([
    doMotor(() => motor.cliente.saude(contexto.raiz)),
    doMotor(() => motor.cliente.listarArquivos(contexto.raiz, { competencia: contexto.competencia, apenas_considerados: true, limite: 200 })),
  ]);
  const historico = (estado: string) => hrefDoMotor("/fiscal/operacao", contexto, { aba: "historico", estado });
  const fila = saude.dados?.fila;
  const daCompetencia = (arquivos.dados?.itens ?? []).filter((a) => vistos.has(a.cnpj));
  const podeOperar = tela.modulos.includes("fiscal_operacao");
  const podeArquivos = tela.modulos.includes("fiscal_entregas");
  return <div className="space-y-5">
    {saude.erro && <Aviso tom="atencao">{saude.erro}</Aviso>}
    {saude.dados && <>
      {!saude.dados.banco.ok && <Aviso tom="perigo">O banco do motor SPED está fora do ar. A fila e os arquivos não podem ser consultados agora.</Aviso>}
      {fila && fila.executando_sem_batida.length > 0 && <Aviso tom="atencao"><span className="flex flex-wrap items-center justify-between gap-3"><span>{fila.executando_sem_batida.length} execução(ões) sem sinal do agente podem ser destravadas: {fila.executando_sem_batida.map((id) => `#${id}`).join(", ")}.</span>{podeOperar && <Button href={historico("executando")} variant="secondary" size="sm">Abrir no Histórico</Button>}</span></Aviso>}
      {fila && <MetricasFiscais itens={[
        { rotulo: "Na fila", valor: fila.por_estado.pendente ?? 0, icone: <Clock />, href: podeOperar ? historico("pendente") : undefined, detalhe: fila.pendente_mais_antigo_seg ? `mais antigo há ${Math.round(fila.pendente_mais_antigo_seg / 60)} min` : undefined },
        { rotulo: "Executando", valor: fila.por_estado.executando ?? 0, icone: <Play />, href: podeOperar ? historico("executando") : undefined },
        { rotulo: "Concluídas · 30 dias", valor: fila.por_estado.concluida ?? 0, icone: <CheckCircle2 />, href: podeOperar ? historico("concluida") : undefined },
        { rotulo: "Com erro · 30 dias", valor: fila.por_estado.erro ?? 0, icone: <AlertTriangle />, href: podeOperar ? historico("erro") : undefined, tom: (fila.por_estado.erro ?? 0) > 0 ? "text-warning-fg" : undefined },
      ]} />}
      <BlocoFiscal titulo="Agentes do motor" descricao={`Banco ${saude.dados.banco.ok ? `no ar${saude.dados.banco.latencia_ms != null ? ` · ${saude.dados.banco.latencia_ms} ms` : ""}` : "fora do ar"} · escrita ${saude.dados.escrita_habilitada ? "habilitada" : "desligada"} no motor · conferido ${dataHora(saude.dados.agora)}`}>
        <TabelaFiscal vazio="Nenhum agente deu sinal." descricaoVazio="Sem agente, os pedidos ficam na fila até um agente do motor voltar." colunas={["Agente", "Plataforma", "Último sinal", "Item em execução", "Situação"]} linhas={saude.dados.agentes.map((a) => ({ id: a.agente_host, celulas: [
          a.agente_host, a.plataforma || "—",
          <span key="visto">{dataHora(a.visto_em)}{a.fonte === "fila" && <span className="block text-helper text-fg-muted">pela fila (agente sem batida)</span>}</span>,
          a.item_em_execucao ? `#${a.item_em_execucao}` : "—",
          <Selo key="s" tom={a.segundos_sem_sinal != null && a.segundos_sem_sinal <= SEM_SINAL_S ? "sucesso" : "atencao"}>{a.segundos_sem_sinal != null && a.segundos_sem_sinal <= SEM_SINAL_S ? "Com sinal" : "Sem comunicação"}</Selo>,
        ] }))} />
      </BlocoFiscal>
    </>}
    {arquivos.erro ? <Aviso tom="atencao">{arquivos.erro}</Aviso> : <>
      <MetricasFiscais itens={[
        { rotulo: `SPED vigentes · ${contexto.competencia}`, valor: daCompetencia.length, icone: <FileText />, href: podeArquivos ? hrefDoMotor("/fiscal/entregas", contexto) : undefined },
        { rotulo: "Validação aprovada", valor: daCompetencia.filter((a) => validacaoDoArquivo(a.validacao) === "Aprovado").length, icone: <BadgeCheck /> },
        { rotulo: "Defasados", valor: daCompetencia.filter((a) => a.defasado).length, icone: <RefreshCw />, tom: daCompetencia.some((a) => a.defasado) ? "text-warning-fg" : undefined, detalhe: "decisões depois da geração" },
        { rotulo: "Entregas registradas", valor: daCompetencia.filter((a) => a.entrega.estado === "registrada").length, icone: <Send /> },
      ]} />
      {arquivos.dados?.proximo_cursor && <p className="text-helper text-fg-muted">Mostrando os 200 arquivos mais recentes da competência.</p>}
    </>}
  </div>;
}
