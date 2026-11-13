"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import {
  perguntarAoSocietario,
  aplicarPropostaDoSocietario,
  type RespostaDoSocietario,
} from "@/app/(app)/processos/ia-actions";
import { Aviso } from "@/components/ui/Aviso";
import { RespostaDaCeci } from "@/components/ia/RespostaDaCeci";
import { DetalhesDaProposta } from "@/components/ia/DetalhesDaProposta";
// A frase e os rótulos do chat da Ceci (09/11/2026): era uma cópia daqui, sem
// a abertura de processo — os dois cartões dizem o mesmo.
import { descreverProposta, rotulosDaDecisao, rotulosDoCriado } from "@/lib/ia/chat/regras";
import { ABRIR_PROCESSO } from "@/lib/societario/aberturaCartao";

/** O que aconteceu com cada proposta: aplicada (com o link do que criou, se criou) ou o erro. */
type Aplicada = { ok: true; link?: string } | { erro: string };

export function AssistenteDoSocietario() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<RespostaDoSocietario | null>(null);
  const [pensando, setPensando] = useState(false);
  const [aplicadas, setAplicadas] = useState<Record<number, Aplicada>>({});
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
      <h2 className="inline-flex items-center gap-1.5 text-card-title font-semibold text-fg">
        <Sparkles size={16} className="text-brand" aria-hidden />
        {/* "Ceci", como o botão do topo e o chat (15/10/2026): era "Assistente do Societário". */}
        Pergunte à Ceci
      </h2>
      <p className="text-ui text-fg-secondary max-w-[62ch]">
        Pergunte sobre a fila — o que está parado, o que está em exigência, o que dá para
        destravar — ou peça para abrir um processo. A Ceci lê os mesmos processos que você vê e{" "}
        <strong>não altera nada</strong>; toda mudança passa pelo seu clique na sugestão.
      </p>

      <Textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        placeholder="Ex.: quais processos estão em exigência há mais de uma semana?"
        rows={2}
        aria-label="Pergunta à Ceci sobre a fila do Societário"
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
              A Ceci parou antes de terminar — a resposta pode estar incompleta.
            </Aviso>
          )}
          {/* O mesmo desenho das respostas do chat da Ceci: Markdown seguro, link só para dentro do Connect. */}
          <div className="text-ui text-fg leading-relaxed break-words">
            <RespostaDaCeci texto={resposta.texto} />
          </div>

          {propostas.length > 0 && (
            <div className="border-t border-border-soft pt-3 flex flex-col gap-2">
              <p className="c41-rotulo">
                Sugestões — nada foi feito ainda
              </p>
              {propostas.map((p, i) => {
                const feito = aplicadas[i];
                const abre = p.ferramenta === ABRIR_PROCESSO;
                return (
                  <div key={i} className="border border-border rounded-md px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-ui text-fg">{descreverProposta(p)}</span>
                      {feito && "ok" in feito ? (
                        <span className="inline-flex items-center gap-2">
                          <span role="status" className="inline-flex items-center gap-1 text-fs-2 font-medium text-success-fg">
                            <Check size={13} aria-hidden /> {feito.link ? rotulosDoCriado(p.ferramenta).feito : "Aplicado"}
                          </span>
                          {feito.link && (
                            <Button size="sm" variant="secondary" href={feito.link}>
                              {rotulosDoCriado(p.ferramenta).ver}
                            </Button>
                          )}
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          {feito && "erro" in feito && (
                            <span role="alert" className="text-fs-2 text-danger">{feito.erro}</span>
                          )}
                          <Button
                            size="sm"
                            // Abrir processo é o gesto principal do cartão; concluir e
                            // dispensar seguem como antes.
                            variant={abre ? "primary" : "secondary"}
                            disabled={aplicando === i}
                            loading={aplicando === i}
                            loadingLabel={abre ? "Abrindo…" : "Aplicando…"}
                            onClick={async () => {
                              setAplicando(i);
                              const r = await aplicarPropostaDoSocietario(p);
                              setAplicadas((a) => ({
                                ...a,
                                [i]: r && "error" in r ? { erro: r.error } : { ok: true, ...(r && "link" in r ? { link: r.link } : {}) },
                              }));
                              setAplicando(null);
                            }}
                          >
                            {abre ? rotulosDaDecisao(p.ferramenta).sim : "Aplicar"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <DetalhesDaProposta p={p} />
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
