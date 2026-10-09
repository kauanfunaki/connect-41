"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import {
  perguntarAoAssistente,
  aplicarProposta,
  type RespostaDoAssistente,
} from "@/app/(app)/vagas/[id]/ia-actions";
import type { PropostaDeEscrita } from "@/lib/ia/ferramentas";
import { Aviso } from "@/components/ui/Aviso";

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
    // Sem moldura própria (auditoria DRG-09, 07/10/2026): mora dentro do
    // cartão do funil, que é p-5, e o cartão de p-4 dentro dele ficava com a
    // borda desalinhada da de fora. O fio de cima separa do funil.
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-brand" />
        <h2 className="text-card-title font-semibold text-fg">Assistente da vaga</h2>
      </div>
      <p className="text-ui text-fg-secondary max-w-[60ch]">
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
      <div className="flex justify-end">
        <Button onClick={perguntar} disabled={pensando || !pergunta.trim()}>
          {pensando ? "Consultando…" : "Perguntar"}
        </Button>
      </div>

      {resposta && "error" in resposta && (
        <Aviso>
          {resposta.error}
        </Aviso>
      )}

      {resposta && "texto" in resposta && (
        <div className="flex flex-col gap-3">
          {resposta.truncado && (
            <Aviso tom="atencao" icone={<AlertTriangle />}>
              O assistente parou antes de terminar — a resposta pode estar incompleta.
            </Aviso>
          )}
          <p className="text-ui text-fg whitespace-pre-wrap">{resposta.texto}</p>

          {propostas.length > 0 && (
            <div className="border-t border-border-soft pt-3 flex flex-col gap-2">
              <p className="text-micro uppercase tracking-wide text-fg-muted">
                Sugestões — nada foi feito ainda
              </p>
              {propostas.map((p, i) => {
                const feito = aplicadas[i];
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-md px-3 py-2"
                  >
                    <span className="min-w-0 text-ui text-fg">{descreverProposta(p)}</span>
                    {feito === "ok" ? (
                      <span className="text-fs-2 text-success-fg">aplicado</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {typeof feito === "string" && (
                          <span className="text-fs-2 text-danger">{feito}</span>
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
    </section>
  );
}
