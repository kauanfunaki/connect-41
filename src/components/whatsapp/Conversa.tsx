"use client";

import { useState, type ReactNode } from "react";
import { Bot, User, AlertTriangle, Link2, Unlink, FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { formatInstantDateTime } from "@/lib/format";
import {
  situacaoDaConversa,
  podeResponder,
  podeDevolverAoRobo,
  podeAssumir,
  podeSoltar,
  podeEncerrar,
  telefoneLegivel,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
} from "@/lib/whatsapp/conversas";
import {
  responderConversa,
  devolverAoRobo,
  assumirConversa,
  soltarConversa,
  encerrarAtendimento,
  vincularCandidatura,
  desvincularCandidatura,
  type AcaoNaConversa,
} from "@/app/(app)/whatsapp/actions";
import type { ConversaDetalhada } from "@/lib/whatsapp/data";
import { DESFECHOS, DESFECHOS_DA_TELA, rotuloDoDesfecho } from "@/lib/whatsapp/atendimentos";
import { FichaNaConversa } from "./FichaNaConversa";

type Props = {
  conversa: ConversaDetalhada;
  agora: Date;
  /** Candidaturas em andamento, para ligar a conversa a uma pessoa. */
  candidaturas: { id: string; rotulo: string }[];
  /** Quem está olhando — decide entre "Assumir" e "Soltar". */
  userId: string;
};

export function Conversa({ conversa, agora, candidaturas, userId }: Props) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [escolhida, setEscolhida] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const [desfecho, setDesfecho] = useState("");

  const situacao = situacaoDaConversa(conversa, agora);
  const resposta = podeResponder(conversa, agora);
  const devolucao = podeDevolverAoRobo(conversa);
  const assumir = podeAssumir({ optedOutAt: conversa.optedOutAt, assignedToId: conversa.responsavel?.id ?? null }, userId);
  const soltar = podeSoltar({ assignedToId: conversa.responsavel?.id ?? null }, userId);
  const encerrar = podeEncerrar(conversa);
  const ultimoEncerramento = conversa.encerramentos.at(-1) ?? null;

  function fecharPainel() {
    setEncerrando(false);
    setDesfecho("");
  }

  async function correr(fn: () => Promise<AcaoNaConversa>, limparTexto = false) {
    setOcupado(true);
    setErro(null);
    const r = await fn();
    if (r && "error" in r) setErro(r.error);
    else if (limparTexto) setTexto("");
    setOcupado(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-fg">
                {conversa.nome ?? telefoneLegivel(conversa.waPhone)}
              </h2>
              <Badge variant={SITUACAO_VARIANTE[situacao]}>{SITUACAO_LABEL[situacao]}</Badge>
            </div>
            <p className="text-[12px] text-fg-muted mt-0.5">
              {telefoneLegivel(conversa.waPhone)}
              {conversa.vaga && ` · ${conversa.vaga}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {conversa.responsavel ? (
              <span className="text-[12px] text-fg-secondary">
                {conversa.responsavel.id === userId ? "Com você" : `Com ${conversa.responsavel.nome}`}
              </span>
            ) : (
              conversa.handoffAt &&
              !conversa.optedOutAt && <span className="text-[12px] text-danger font-medium">Ninguém assumiu</span>
            )}
            {assumir.pode && (
              <Button size="sm" disabled={ocupado} onClick={() => correr(() => assumirConversa(conversa.id))}>
                Assumir
              </Button>
            )}
            {/* "Soltar" e o "Cancelar" do encerramento eram texto cinza, e o
                "desfazer" do vínculo, texto azul (30/09): botão não é link. Só
                o desenho mudou — as ações são as mesmas. */}
            {soltar.pode && (
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => correr(() => soltarConversa(conversa.id))}>
                Soltar
              </Button>
            )}
            {devolucao.pode && (
              <Button
                variant="secondary"
                size="sm"
                disabled={ocupado}
                onClick={() => correr(() => devolverAoRobo(conversa.id))}
              >
                Devolver ao assistente
              </Button>
            )}
            {encerrar.pode && !encerrando && (
              <Button variant="secondary" size="sm" disabled={ocupado} onClick={() => setEncerrando(true)}>
                Encerrar atendimento
              </Button>
            )}
          </div>
        </div>

        {conversa.handoffReason && (
          <p className="flex items-start gap-2 text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            O assistente passou para você: {conversa.handoffReason}
          </p>
        )}

        {encerrando && (
          <div className="flex flex-wrap items-end gap-2 bg-surface-hover border border-border rounded-md p-3">
            <div className="flex-1 min-w-[14rem]">
              <label htmlFor="desfecho" className="block text-[11px] text-fg-muted mb-1">
                Como terminou este atendimento?
              </label>
              <Select id="desfecho" value={desfecho} onChange={(e) => setDesfecho(e.target.value)}>
                <option value="">Selecione…</option>
                {DESFECHOS_DA_TELA.map((d) => (
                  <option key={d} value={d}>
                    {DESFECHOS[d]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              size="sm"
              disabled={ocupado || !desfecho}
              onClick={() =>
                correr(async () => {
                  const r = await encerrarAtendimento(conversa.id, desfecho);
                  if (r && "success" in r) fecharPainel();
                  return r;
                })
              }
            >
              Encerrar
            </Button>
            <Button variant="secondary" size="sm" disabled={ocupado} onClick={fecharPainel}>
              Cancelar
            </Button>
            <p className="basis-full text-[11px] text-fg-muted">
              Nada é enviado ao candidato. A conversa volta ao assistente, sem responsável, e a próxima mensagem dele
              abre um novo atendimento.
            </p>
          </div>
        )}

        {situacao === "encerrada" && ultimoEncerramento && (
          <p className="text-[12px] text-fg-secondary">
            Atendimento encerrado{ultimoEncerramento.por ? ` por ${ultimoEncerramento.por}` : ""} em{" "}
            {formatInstantDateTime(ultimoEncerramento.em)} · {rotuloDoDesfecho(ultimoEncerramento.desfecho)}. A próxima
            mensagem do candidato abre um novo atendimento com o assistente.
          </p>
        )}

        {/* O vínculo é o que faz o assistente saber de quem está falando.
            Telefone sozinho é palpite — palpite errado mostra o processo de
            uma pessoa para outra —, então o robô só liga sozinho quando o
            candidato confirma o nome (`src/lib/whatsapp/vinculo.ts`). Fora
            disso, é de gente: aqui. */}
        {conversa.candidaturaId ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-secondary">
            <Link2 size={13} />
            Ligada a uma candidatura.
            <Button
              variant="secondary"
              size="xs"
              disabled={ocupado}
              onClick={() => correr(() => desvincularCandidatura(conversa.id))}
            >
              <Unlink size={11} /> desfazer
            </Button>
            {conversa.ficha && <FichaNaConversa ficha={conversa.ficha} />}
          </div>
        ) : (
          <>
          {conversa.vinculoAutomatico === "confirmando" && (
            <p className="text-[12px] text-fg-muted">
              O assistente achou uma inscrição com este telefone e pediu o nome completo para confirmar.
            </p>
          )}
          {conversa.vinculoAutomatico === "nao_confirmou" && (
            <p className="text-[12px] text-warning">
              O vínculo automático não confirmou quem é (ou foi desfeito). Só se liga à mão.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[16rem]">
              <label htmlFor="vinculo" className="block text-[11px] text-fg-muted mb-1">
                Quem é esta pessoa? O assistente só consulta o processo depois disto.
              </label>
              <Select
                id="vinculo"
                value={escolhida}
                onChange={(e) => setEscolhida(e.target.value)}
              >
                <option value="">Selecione a candidatura…</option>
                {candidaturas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rotulo}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              disabled={ocupado || !escolhida}
              onClick={() => correr(() => vincularCandidatura(conversa.id, escolhida))}
            >
              Ligar
            </Button>
          </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto">
          {comMarcasDeEncerramento(conversa, (m) => {
            const minha = m.direction === "SAIDA";
            return (
              <div key={m.id} className={minha ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}>
                <div
                  className={`rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ${
                    minha
                      ? m.status === "BLOQUEADA"
                        ? "bg-warning-bg border border-warning/30 text-fg"
                        : "bg-brand/10 border border-brand/20 text-fg"
                      : "bg-surface-hover border border-border text-fg"
                  }`}
                >
                  {m.body}
                  {m.anexo && (
                    <a
                      href={`/api/whatsapp/midia/${m.id}`}
                      className="mt-1 flex items-center gap-1 text-[12px] text-brand hover:underline"
                    >
                      <FileText size={12} /> Baixar {m.anexo.nome}
                    </a>
                  )}
                </div>
                <p className="text-[10px] text-fg-muted mt-0.5 flex items-center gap-1">
                  {minha &&
                    (m.doRobo ? (
                      <>
                        <Bot size={10} /> assistente
                      </>
                    ) : (
                      <>
                        <User size={10} /> time
                      </>
                    ))}
                  {formatInstantDateTime(m.createdAt)}
                  {/* Bloqueada é o rascunho que o robô ia mandar e não mandou.
                      Mostrar é o que permite a quem assumiu aproveitar ou
                      descartar com conhecimento de causa. */}
                  {m.status === "BLOQUEADA" && <span className="text-warning">· não enviada</span>}
                  {m.status === "FALHOU" && <span className="text-danger">· falhou</span>}
                </p>
                {/* O motivo aparece também na falha de envio: é justamente o
                    caso em que quem olha precisa saber o que o provedor
                    respondeu, e o log do container nem sempre está à mão. */}
                {m.error && (
                  <p className={`text-[10px] ${m.status === "FALHOU" ? "text-danger" : "text-fg-muted"}`}>
                    motivo: {m.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 flex flex-col gap-2">
        {erro && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
            {erro}
          </p>
        )}
        {resposta.pode ? (
          <>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva para o candidato…"
              rows={3}
              aria-label="Resposta ao candidato"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-fg-muted">
                {situacao === "encerrada"
                  ? "Responder abre um novo atendimento e assume a conversa."
                  : "Responder assume a conversa — o assistente para de responder aqui."}
              </p>
              <Button
                disabled={ocupado || !texto.trim()}
                onClick={() => correr(() => responderConversa(conversa.id, texto), true)}
              >
                {ocupado ? "Enviando…" : "Enviar"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-fg-secondary">{resposta.motivo}</p>
        )}
      </Card>
    </div>
  );
}

type Mensagem = ConversaDetalhada["mensagens"][number];

/**
 * As mensagens com uma linha onde cada atendimento terminou: é o que mostra,
 * numa conversa longa, que o "oi" de hoje abriu um atendimento novo.
 */
function comMarcasDeEncerramento(conversa: ConversaDetalhada, mensagem: (m: Mensagem) => ReactNode): ReactNode[] {
  const marcas = conversa.encerramentos;
  const itens: ReactNode[] = [];
  let k = 0;
  const marca = (i: number) => {
    const e = marcas[i]!;
    return (
      <div key={`fim-${i}`} className="flex items-center gap-2 my-1 text-[11px] text-fg-muted" role="separator">
        <span className="h-px flex-1 bg-border" />
        Atendimento encerrado · {rotuloDoDesfecho(e.desfecho)}
        {e.por ? ` · por ${e.por}` : ""} · {formatInstantDateTime(e.em)}
        <span className="h-px flex-1 bg-border" />
      </div>
    );
  };
  for (const m of conversa.mensagens) {
    while (k < marcas.length && marcas[k]!.em <= m.createdAt) itens.push(marca(k++));
    itens.push(mensagem(m));
  }
  while (k < marcas.length) itens.push(marca(k++));
  return itens;
}
