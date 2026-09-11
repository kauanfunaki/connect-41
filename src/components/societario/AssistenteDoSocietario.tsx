"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import {
  perguntarAoSocietario,
  aplicarPropostaDoSocietario,
  type RespostaDoSocietario,
} from "@/app/(app)/processos/ia-actions";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";

function descreverProposta(p: PropostaDeEscrita): string {
  const a = p.argumentos ?? {};
  const motivo = typeof a.motivo === "string" && a.motivo.trim() ? ` — ${a.motivo.trim()}` : "";
  if (p.ferramenta === "propor_concluir_etapa") return `Concluir a etapa${motivo}`;
  if (p.ferramenta === "propor_dispensar_etapa") return `Dispensar a etapa${motivo}`;
  return p.descricao;
}

export function AssistenteDoSocietario() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<RespostaDoSocietario | null>(null);
  const [pensando, setPensando] = useState(false);
  const [aplicadas, setAplicadas] = useState<Record<number, "ok" | string>>({});
  const [aplicando, setAplicando] = useState<number | null>(null);

  async function perguntar() {
    if (!pergunta.trim() || pensando) return;
    setPensando(true);
    setResposta(null);
    setAplicadas({});
    setResposta(await perguntarAoSocietario(pergunta));
    setPensando(false);
  }

  const propostas = resposta && "propostas" in resposta ? resposta.propostas : [];

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <h2 className="text-[15px] font-semibold text-fg">Assistente do Societário</h2>
      </div>
      <p className="text-[13px] text-fg-secondary max-w-[62ch]">
        Pergunte sobre a fila — o que está parado, o que está em exigência, o que dá para
        destravar. Ele lê os mesmos processos que você vê e{" "}
        <strong>não altera nada</strong>; toda mudança passa pelo seu “Aplicar”.
      </p>

      <Textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Ex.: quais processos estão em exigência há mais de uma semana?"
        rows={2}
        aria-label="Pergunta ao assistente do Societário"
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
                            const r = await aplicarPropostaDoSocietario(p);
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
