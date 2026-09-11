"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import {
  perguntarAoAssistente,
  aplicarProposta,
  type RespostaDoAssistente,
} from "@/app/(app)/vagas/[id]/ia-actions";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";

const ETAPA_LABEL: Record<string, string> = {
  TRIAGEM: "Triagem",
  ENTREVISTA: "Entrevista",
  TESTE: "Teste",
  PROPOSTA: "Proposta",
  CONTRATADO: "Contratado",
};

/** O que a proposta faz, em português, para quem vai confirmar. */
function descreverProposta(p: PropostaDeEscrita): string {
  const a = p.argumentos ?? {};
  const motivo = typeof a.motivo === "string" && a.motivo.trim() ? ` — ${a.motivo.trim()}` : "";
  if (p.ferramenta === "propor_mover_etapa") {
    const etapa = String(a.etapa ?? "");
    return `Mover para ${ETAPA_LABEL[etapa] ?? etapa}${motivo}`;
  }
  if (p.ferramenta === "propor_encerrar_candidatura") {
    const desfecho = a.desfecho === "DESISTENTE" ? "desistente" : "reprovado";
    return `Encerrar como ${desfecho}${motivo}`;
  }
  return p.descricao;
}

export function AssistenteDaVaga({ vagaId }: { vagaId: string }) {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<RespostaDoAssistente | null>(null);
  const [pensando, setPensando] = useState(false);
  // Uma proposta some da lista assim que é aplicada — deixá-la ali convidaria a
  // aplicar duas vezes, e mover duas vezes é uma etapa a mais sem querer.
  const [aplicadas, setAplicadas] = useState<Record<number, "ok" | string>>({});
  const [aplicando, setAplicando] = useState<number | null>(null);

  async function perguntar() {
    if (!pergunta.trim() || pensando) return;
    setPensando(true);
    setResposta(null);
    setAplicadas({});
    setResposta(await perguntarAoAssistente(vagaId, pergunta));
    setPensando(false);
  }

  const propostas = resposta && "propostas" in resposta ? resposta.propostas : [];

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <h2 className="text-[15px] font-semibold text-fg">Assistente da vaga</h2>
      </div>
      <p className="text-[13px] text-fg-secondary max-w-[60ch]">
        Pergunte sobre os candidatos desta vaga. O assistente lê as fichas e as entrevistas e pode
        sugerir movimentos — <strong>ele não altera nada</strong>; toda mudança passa pelo seu
        “Aplicar”.
      </p>

      <Textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Ex.: quem já foi entrevistado e ainda está na triagem?"
        rows={2}
        aria-label="Pergunta ao assistente"
      />
      <div>
        <Button onClick={perguntar} disabled={pensando || !pergunta.trim()}>
          {pensando ? "Consultando…" : "Perguntar"}
        </Button>
      </div>

      {resposta && "error" in resposta && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {resposta.error}
        </p>
      )}

      {resposta && "texto" in resposta && (
        <div className="flex flex-col gap-3">
          {resposta.truncado && (
            <p className="flex items-start gap-2 text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              O assistente parou antes de terminar — a resposta pode estar incompleta.
            </p>
          )}
          <p className="text-[13px] text-fg whitespace-pre-wrap">{resposta.texto}</p>

          {propostas.length > 0 && (
            <div className="border-t border-border-soft pt-3 flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-wide text-fg-muted">
                Sugestões — nada foi feito ainda
              </p>
              {propostas.map((p, i) => {
                const feito = aplicadas[i];
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md px-3 py-2"
                  >
                    <span className="text-[13px] text-fg">{descreverProposta(p)}</span>
                    {feito === "ok" ? (
                      <span className="text-[12px] text-success">aplicado</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {typeof feito === "string" && (
                          <span className="text-[12px] text-danger">{feito}</span>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={aplicando === i}
                          onClick={async () => {
                            setAplicando(i);
                            const r = await aplicarProposta(vagaId, p);
                            setAplicadas((a) => ({ ...a, [i]: r ? r.error : "ok" }));
                            setAplicando(null);
                          }}
                        >
                          {aplicando === i ? "Aplicando…" : "Aplicar"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
