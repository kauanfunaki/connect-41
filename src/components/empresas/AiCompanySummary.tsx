"use client";

import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { AiSummaryState } from "@/app/(app)/empresas/[id]/ai-actions";
import { Aviso } from "@/components/ui/Aviso";
import { SectorChip } from "@/components/ui/SectorChip";
import { Selo } from "@/components/ui/Selo";
import { HANDOFF_PRIORITY_LABEL, HANDOFF_PRIORITY_TOM, HANDOFF_STATUS_LABEL, HANDOFF_STATUS_TOM } from "@/lib/handoffs";
// Só os tipos: a regra do resumo fica no servidor.
import type { ItemDoResumo, SeloDoResumo } from "@/lib/resumoDaEmpresa";

type Props = {
  action: () => Promise<AiSummaryState>;
};

type Gerado = Extract<AiSummaryState, { resumo: unknown }>;

const ROTULO_DO_BLOCO = "text-micro font-semibold uppercase tracking-wide text-fg-muted";

// Os selos saem do registro, e não do texto da IA (17/11/2026, melhoria-723).
// A situação e a prioridade vão sempre escritas, nunca só na cor.
function SeloDoItem({ selo }: { selo: SeloDoResumo }) {
  if (selo.tipo === "setor") {
    return (
      <SectorChip label={selo.rotulo} color={selo.cor} className={selo.situacao ? "pr-1" : ""}>
        {selo.situacao && <Selo tom={HANDOFF_STATUS_TOM[selo.situacao]}>{HANDOFF_STATUS_LABEL[selo.situacao]}</Selo>}
      </SectorChip>
    );
  }
  if (selo.tipo === "prioridade") {
    return <Selo tom={HANDOFF_PRIORITY_TOM[selo.prioridade]}>Prioridade {HANDOFF_PRIORITY_LABEL[selo.prioridade].toLowerCase()}</Selo>;
  }
  return <Selo tom={selo.publicado ? "sucesso" : "atencao"}>{selo.publicado ? "Publicado" : "Rascunho"}</Selo>;
}

function Bloco({ id, titulo, vazio, itens, children }: { id: string; titulo: string; vazio: string; itens: ItemDoResumo[]; children: (item: ItemDoResumo) => React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className={ROTULO_DO_BLOCO}>{titulo}</h3>
      {itens.length === 0 ? (
        <p className="mt-2 text-ui text-fg-muted">{vazio}</p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {itens.map((item) => (
            <li key={item.ref} className="flex items-start gap-3 py-2.5">
              {children(item)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AiCompanySummary({ action }: Props) {
  const [isPending, startTransition] = useTransition();
  // O último resumo fica na tela se a atualização falhar: o erro aparece em
  // cima dele, sem apagar o que a pessoa já estava lendo.
  const [gerado, setGerado] = useState<Gerado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Recolher depois de gerado (25/11/2026, melhoria-834): o resumo pode ficar
  // grande e empurrar a ficha para baixo. Recolhido, fica só o cabeçalho, com
  // quando foi gerado; gerar ou atualizar abre de novo.
  const [recolhido, setRecolhido] = useState(false);
  const idDoConteudo = useId();

  function handleClick() {
    startTransition(async () => {
      const resposta = await action();
      if (resposta && "resumo" in resposta) {
        setGerado(resposta);
        setErro(null);
        setRecolhido(false);
      } else {
        setErro(resposta?.error ?? "Não foi possível gerar o resumo. Tente de novo.");
      }
    });
  }

  // Cartão e título no padrão dos outros da ficha (30/09): era um bloco
  // montado à mão com título de 14px, logo acima de cartões com 18px.
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-section font-semibold text-fg">Resumo IA — últimos 90 dias</h2>
          {/* Com resumo na tela, a frase de explicação dá lugar a quando ele
              foi gerado (17/11/2026, melhoria-723). */}
          <p className="text-helper text-fg-muted mt-0.5">
            {gerado ? `gerado em ${gerado.geradoEm}` : "Consolida reuniões, transferências, kanban e documentos num briefing pré-reunião."}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {gerado && (
            <Button type="button" variant="ghost" onClick={() => setRecolhido((r) => !r)} aria-expanded={!recolhido} aria-controls={idDoConteudo}>
              {recolhido ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />}
              {recolhido ? "Mostrar" : "Recolher"}
            </Button>
          )}
          <Button type="button" onClick={handleClick} disabled={isPending}>
            <Sparkles size={14} />
            {gerado ? (isPending ? "Atualizando…" : "Atualizar") : isPending ? "Gerando…" : "Gerar resumo"}
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {erro && <Aviso className="mt-4">{erro}</Aviso>}

        {gerado && !recolhido && (
          <div id={idDoConteudo}>
            <p className="mt-4 text-body text-fg break-words">{gerado.resumo.resumo}</p>
            {/* Blocos curtos no lugar dos três parágrafos da IA: lado a lado
                em tela larga, empilhados em tela estreita. */}
            <div className="mt-4 grid gap-x-8 gap-y-5 lg:grid-cols-2">
              <Bloco id="resumo-ia-aconteceu" titulo="O que aconteceu" vazio="Nada de relevante no período." itens={gerado.resumo.aconteceu}>
                {(item) => (
                  <>
                    <span className="w-10 flex-shrink-0 text-helper text-fg-muted tabular-nums leading-5">{item.data}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-ui text-fg break-words">{item.texto}</p>
                      {item.selos.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {item.selos.map((selo, i) => (
                            <SeloDoItem key={i} selo={selo} />
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Bloco>
              <Bloco id="resumo-ia-atencao" titulo="Atenção" vazio="Nada pede atenção agora." itens={gerado.resumo.atencao}>
                {(item) => (
                  <>
                    <p className="min-w-0 flex-1 text-ui text-fg break-words">{item.texto}</p>
                    {item.href && (
                      <Button href={item.href} variant="link" className="flex-shrink-0">
                        Abrir<span className="sr-only">: {item.texto}</span>
                      </Button>
                    )}
                  </>
                )}
              </Bloco>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
