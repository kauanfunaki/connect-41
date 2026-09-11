"use client";

import { useState } from "react";
import { Bot, User, AlertTriangle, Link2, Unlink } from "lucide-react";
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
  telefoneLegivel,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
} from "@/lib/whatsapp/conversas";
import {
  responderConversa,
  devolverAoRobo,
  vincularCandidatura,
  desvincularCandidatura,
  type AcaoNaConversa,
} from "@/app/(app)/whatsapp/actions";
import type { ConversaDetalhada } from "@/lib/whatsapp/data";

type Props = {
  conversa: ConversaDetalhada;
  agora: Date;
  /** Candidaturas em andamento, para ligar a conversa a uma pessoa. */
  candidaturas: { id: string; rotulo: string }[];
};

export function Conversa({ conversa, agora, candidaturas }: Props) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [escolhida, setEscolhida] = useState("");

  const situacao = situacaoDaConversa(conversa, agora);
  const resposta = podeResponder(conversa, agora);
  const devolucao = podeDevolverAoRobo(conversa);

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
        </div>

        {conversa.handoffReason && (
          <p className="flex items-start gap-2 text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            O assistente passou para você: {conversa.handoffReason}
          </p>
        )}

        {/* O vínculo é o que faz o assistente saber de quem está falando — e é
            de gente, nunca do robô: identificar alguém por telefone é palpite,
            e palpite errado mostra o processo de uma pessoa para outra. */}
        {conversa.candidaturaId ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-secondary">
            <Link2 size={13} />
            Ligada a uma candidatura.
            <button
              type="button"
              className="text-brand hover:underline inline-flex items-center gap-1"
              disabled={ocupado}
              onClick={() => correr(() => desvincularCandidatura(conversa.id))}
            >
              <Unlink size={12} /> desfazer
            </button>
          </div>
        ) : (
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
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto">
          {conversa.mensagens.map((m) => {
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
                {m.error && m.status !== "FALHOU" && (
                  <p className="text-[10px] text-fg-muted">motivo: {m.error}</p>
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
                Responder assume a conversa — o assistente para de responder aqui.
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
