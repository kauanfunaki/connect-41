"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, LogOut, MoreHorizontal, UserX } from "lucide-react";
import { ACTIVE_STAGES, STAGE_LABEL, type Stage } from "@/lib/recruitmentFunnel";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { IconButton } from "@/components/ui/IconButton";
import { Selo } from "@/components/ui/Selo";
import { ROTULO_DA_FAIXA, type Faixa } from "@/lib/recrutamento/triagem";
import { Aviso } from "@/components/ui/Aviso";

export type FunnelCard = {
  id: string;
  personId: string;
  personName: string;
  origin: string | null;
  hasResume: boolean;
  stage: Stage;
  scorecardCount: number;
  /** Nota da triagem (R1). Só ordena — nunca tira ninguém do funil. */
  nota: { score: number; faixa: Faixa; desatualizada: boolean } | null;
  /** Resumo das respostas do candidato (pretensão · deslocamento · disponibilidade), ou nulo. */
  respostas: string | null;
};

const COR_DA_FAIXA: Record<Faixa, string> = {
  COMPATIVEL: "bg-success-bg text-success-fg border-success/40",
  PARCIAL: "bg-warning-bg text-warning-fg border-warning/40",
  INCOMPATIVEL: "bg-surface-2 text-fg-muted border-border",
};

type ActionResult = { error: string } | null;

type Props = {
  vagaId: string;
  cards: FunnelCard[];
  canManage: boolean;
  moveAction: (candidaturaId: string, stage: Stage) => Promise<ActionResult>;
  encerrarAction: (
    candidaturaId: string,
    outcome: "REPROVADO" | "DESISTENTE",
    reason: string | null
  ) => Promise<ActionResult>;
};

type EncerrarTarget = { cardId: string; personName: string; outcome: "REPROVADO" | "DESISTENTE" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function RecruitmentFunnel({ vagaId, cards: initialCards, canManage, moveAction, encerrarAction }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encerrarTarget, setEncerrarTarget] = useState<EncerrarTarget | null>(null);
  const [motivo, setMotivo] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Aplica otimista e DESFAZ se a action retornar erro — antes o card mudava de
  // coluna (ou sumia) mesmo quando o servidor recusava, e a tela só voltava ao
  // estado real num refresh manual.
  function moveCard(cardId: string, stage: Stage) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === stage) return;
    const previous = card.stage;
    setError(null);
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage } : c)));
    startTransition(async () => {
      const result = await moveAction(cardId, stage);
      if (result?.error) {
        setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage: previous } : c)));
        setError(result.error);
      }
    });
  }

  function abrirEncerramento(c: FunnelCard, outcome: EncerrarTarget["outcome"]) {
    setMotivo("");
    setDialogError(null);
    setEncerrarTarget({ cardId: c.id, personName: c.personName, outcome });
  }

  function confirmEncerrar() {
    if (!encerrarTarget) return;
    const { cardId, outcome } = encerrarTarget;
    const removed = cards.find((c) => c.id === cardId);
    setDialogError(null);
    startTransition(async () => {
      const result = await encerrarAction(cardId, outcome, motivo.trim() || null);
      if (result?.error) {
        setDialogError(result.error);
        return;
      }
      if (removed) setCards((prev) => prev.filter((c) => c.id !== cardId));
      setEncerrarTarget(null);
      setMotivo("");
    });
  }

  return (
    <>
      {error && (
        <Aviso className="mb-3">
          {error}
        </Aviso>
      )}

      <div className="scroll-x overflow-x-auto flex gap-3 pb-1">
        {ACTIVE_STAGES.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage);
          const isContratado = stage === "CONTRATADO";
          const isDragOver = dragOver === stage;

          return (
            <section
              key={stage}
              aria-label={`Etapa ${STAGE_LABEL[stage]}, ${stageCards.length} candidato(s)`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setDragOver(null);
                setDraggingId(null);
                if (id) moveCard(id, stage);
              }}
              className={`flex-shrink-0 w-64 rounded-lg border p-2.5 transition-colors ${
                isDragOver ? "border-brand bg-brand/5" : "border-border bg-surface-2"
              }`}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span className={`text-[length:var(--fs-2)] font-semibold ${isContratado ? "text-success-fg" : "text-fg"}`}>
                  {STAGE_LABEL[stage]}
                </span>
                <span className="text-[length:var(--fs-micro)] text-fg-muted tnum">{stageCards.length}</span>
              </div>

              <div className="space-y-2 min-h-[40px]">
                {stageCards.map((c) => (
                  <article
                    key={c.id}
                    draggable={canManage && !isContratado}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      setDraggingId(c.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`bg-surface border border-border rounded-md p-2.5 ${
                      canManage && !isContratado ? "cursor-grab active:cursor-grabbing" : ""
                    } ${draggingId === c.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand text-[length:var(--fs-micro)] font-semibold flex items-center justify-center">
                        {initials(c.personName)}
                      </span>
                      <Link
                        href={`/candidatos/${c.personId}`}
                        className="min-w-0 text-[length:var(--fs-ui)] text-fg hover:text-brand transition-colors truncate"
                      >
                        {c.personName}
                      </Link>
                    </div>

                    {c.nota && (
                      <p className="mt-1.5 pl-8">
                        {/* O `Selo`, no lugar da pílula à mão (auditoria DRG-06, 07/10/2026); o
                            raio menor, na escala (`rounded-sm`, era o `rounded`
                            de 4px), segue distinguindo a nota dos selos de
                            situação (DRG-26). */}
                        <span title={c.nota.desatualizada ? "Nota dada com uma versão anterior dos requisitos" : "Nota da triagem — só ordena, não reprova"}>
                          <Selo
                            cor={COR_DA_FAIXA[c.nota.faixa]}
                            className={`gap-1 rounded-sm! tnum ${c.nota.desatualizada ? "opacity-60" : ""}`}
                          >
                            {c.nota.score} · {ROTULO_DA_FAIXA[c.nota.faixa]}
                            {c.nota.desatualizada && " · versão anterior"}
                          </Selo>
                        </span>
                      </p>
                    )}
                    {c.respostas && <p className="text-[length:var(--fs-micro)] text-fg-secondary mt-1.5 pl-8 tnum">{c.respostas}</p>}
                    {c.origin && <p className="text-[length:var(--fs-micro)] text-fg-muted mt-1.5 pl-8">via {c.origin}</p>}

                    {/* Alternativa acessível ao arraste: o board era só
                        drag-and-drop de mouse, então quem usa teclado ou leitor
                        de tela não conseguia executar a ação principal da tela
                        (e no celular arrastar entre colunas é impraticável). */}
                    {canManage && !isContratado && (
                      <div className="mt-2">
                        <label htmlFor={`stage-${c.id}`} className="sr-only">
                          Etapa de {c.personName}
                        </label>
                        <Select
                          id={`stage-${c.id}`}
                          compact
                          value={c.stage}
                          disabled={pending}
                          onChange={(e) => moveCard(c.id, e.target.value as Stage)}
                        >
                          {ACTIVE_STAGES.map((s) => (
                            <option key={s} value={s}>
                              {STAGE_LABEL[s]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {/* Botão não é link (conferência de 30/09): "Avaliar" e
                        "Currículo" eram texto colorido. Reprovar e Desistiu
                        encerram a candidatura e foram para o "⋯" — do lado
                        do "Avaliar", um clique errado tirava a pessoa do
                        board. O diálogo com o motivo continua o mesmo. */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Button href={`/vagas/${vagaId}/candidaturas/${c.id}`} variant="secondary" size="xs">
                        <ClipboardCheck size={11} />
                        Avaliar{c.scorecardCount > 0 ? ` (${c.scorecardCount})` : ""}
                      </Button>
                      {c.hasResume && (
                        // `nativo`: o currículo é rota de arquivo (/api), e o
                        // `Link` do Button com `href` puro tentaria
                        // pré-carregá-lo só de o cartão aparecer na tela.
                        <Button href={`/api/resumes/${c.id}`} nativo variant="secondary" size="xs">
                          <FileText size={11} /> Currículo
                        </Button>
                      )}
                      {canManage && !isContratado && (
                        <Popover
                          align="right"
                          width={180}
                          aria-label={`Encerrar a candidatura de ${c.personName}`}
                          trigger={({ open, toggle }) => (
                            // O `IconButton` do app, com 36px no celular — o
                            // botão à mão tinha 28px, pequeno para o dedo
                            // (auditoria DRG-37, 07/10/2026).
                            <IconButton
                              size="sm"
                              variant="framed"
                              active={open}
                              onClick={toggle}
                              aria-label={`Mais ações para ${c.personName}`}
                              aria-expanded={open}
                              className="max-md:w-9 max-md:h-9"
                            >
                              <MoreHorizontal size={14} />
                            </IconButton>
                          )}
                        >
                          {({ close }) => (
                            <>
                              <ItemDoMenu
                                icone={<UserX />}
                                danger
                                onClick={() => {
                                  close();
                                  abrirEncerramento(c, "REPROVADO");
                                }}
                              >
                                Reprovar
                              </ItemDoMenu>
                              <ItemDoMenu
                                icone={<LogOut />}
                                onClick={() => {
                                  close();
                                  abrirEncerramento(c, "DESISTENTE");
                                }}
                              >
                                Desistiu
                              </ItemDoMenu>
                            </>
                          )}
                        </Popover>
                      )}
                    </div>
                  </article>
                ))}
                {stageCards.length === 0 && <p className="text-[length:var(--fs-micro)] text-fg-muted text-center py-3">—</p>}
              </div>
            </section>
          );
        })}
      </div>

      {/* Substitui o window.prompt: sem tema, sem validação, sem mostrar erro de
          retorno, e bloqueado por alguns navegadores. */}
      <ConfirmDialog
        open={encerrarTarget !== null}
        title={
          encerrarTarget?.outcome === "REPROVADO"
            ? `Reprovar ${encerrarTarget?.personName}?`
            : `Registrar desistência de ${encerrarTarget?.personName}?`
        }
        description="O candidato sai do board e vai para a faixa de encerrados. A etapa alcançada é preservada para o cálculo de conversão."
        confirmLabel={encerrarTarget?.outcome === "REPROVADO" ? "Reprovar" : "Registrar desistência"}
        destructive={encerrarTarget?.outcome === "REPROVADO"}
        pending={pending}
        error={dialogError}
        onConfirm={confirmEncerrar}
        onCancel={() => {
          setEncerrarTarget(null);
          setMotivo("");
          setDialogError(null);
        }}
      >
        <CampoForm label="Motivo" htmlFor="encerrar-motivo" helper="Opcional.">
          <Textarea
            id="encerrar-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={500}
            placeholder="Ex: perfil técnico abaixo do exigido; aceitou outra proposta…"
          />
        </CampoForm>
      </ConfirmDialog>
    </>
  );
}
