"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, LogOut, Undo2, UserX } from "lucide-react";
import { ACTIVE_STAGES, STAGE_LABEL, linhaDaColuna, numerosDasColunas, resumoDoFunil, type Stage } from "@/lib/recruitmentFunnel";
import { rotuloDaOrigem } from "@/lib/recrutamento/origem";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
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
  /**
   * Só nos contratados: o motivo que trava o "Desfazer contratação", ou `null`
   * quando pode desfazer (`travaDoDesfazer`, 30/10/2026). Fora de Contratado,
   * ausente.
   */
  travaDoDesfazer?: string | null;
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
  /**
   * As candidaturas encerradas (reprovado/desistente), só etapa e situação:
   * entram nos números do topo das colunas — a etapa que alcançaram conta em
   * "chegaram" —, mas não no quadro.
   */
  encerradas: { stage: string; status: string }[];
  /** A quantidade de vagas, para "1 contratada de 2 vagas". */
  quantidadeDeVagas: number;
  canManage: boolean;
  moveAction: (candidaturaId: string, stage: Stage) => Promise<ActionResult>;
  encerrarAction: (
    candidaturaId: string,
    outcome: "REPROVADO" | "DESISTENTE",
    reason: string | null
  ) => Promise<ActionResult>;
  /** Desfaz a contratação (com a trava conferida no servidor). */
  desfazerAction: (candidaturaId: string) => Promise<ActionResult>;
};

type EncerrarTarget = { cardId: string; personName: string; outcome: "REPROVADO" | "DESISTENTE" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function RecruitmentFunnel({ vagaId, cards: initialCards, encerradas, quantidadeDeVagas, canManage, moveAction, encerrarAction, desfazerAction }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [encerrarTarget, setEncerrarTarget] = useState<EncerrarTarget | null>(null);
  const [motivo, setMotivo] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [contratarAlvo, setContratarAlvo] = useState<{ cardId: string; personName: string } | null>(null);
  const [desfazerAlvo, setDesfazerAlvo] = useState<{ cardId: string; personName: string } | null>(null);
  const [erroDoDesfazer, setErroDoDesfazer] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Aplica otimista e DESFAZ se a action retornar erro — antes o card mudava de
  // coluna (ou sumia) mesmo quando o servidor recusava, e a tela só voltava ao
  // estado real num refresh manual.
  // Soltar em "Contratado" contrata: a pessoa vira colaboradora da empresa da
  // vaga, em admissão, e o cartão trava. Era um arraste sem volta e sem
  // pergunta (auditoria de UX, 30/10/2026) — agora passa pela confirmação.
  function pedirMover(cardId: string, stage: Stage) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.stage === stage) return;
    if (stage === "CONTRATADO") {
      setContratarAlvo({ cardId, personName: card.personName });
      return;
    }
    moveCard(cardId, stage);
  }

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

  // Os números de cada coluna (escolha "Vaga · 4 A" do Kauan, 14/10/2026),
  // no lugar do gráfico de funil separado em cima do quadro. Saem do estado do
  // quadro, e não do servidor: arrastar alguém muda os números na hora. Quem
  // está no quadro em "Contratado" foi contratado (soltar lá contrata).
  const candidaturas = [
    ...cards.map((c) => ({ stage: c.stage, status: c.stage === "CONTRATADO" ? "CONTRATADO" : "EM_ANDAMENTO" })),
    ...encerradas,
  ];
  const numeros = new Map(numerosDasColunas(candidaturas).map((n) => [n.stage, n]));
  const contratadas = cards.filter((c) => c.stage === "CONTRATADO").length;

  return (
    <>
      <p className="mb-3 text-fs-2 text-fg-secondary tnum">{resumoDoFunil(candidaturas.length, contratadas, quantidadeDeVagas)}</p>

      {error && (
        <Aviso className="mb-3">
          {error}
        </Aviso>
      )}

      {/* Cada coluna no tamanho dos seus textos (pedido do Kauan sobre o
          desenho, 14/10/2026: no rascunho as colunas ficaram apertadas): no
          mínimo 15,5rem, crescendo para ocupar a largura quando sobra; quando
          não cabem as cinco, o quadro rola de lado, como antes. */}
      <div className="scroll-x overflow-x-auto flex gap-3 pb-1">
        {ACTIVE_STAGES.map((stage) => {
          const stageCards = cards.filter((c) => c.stage === stage);
          const isContratado = stage === "CONTRATADO";
          const isDragOver = dragOver === stage;
          const n = numeros.get(stage);

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
                if (id) pedirMover(id, stage);
              }}
              className={`flex-1 flex-shrink-0 min-w-[15.5rem] rounded-lg border p-2.5 transition-colors ${
                isDragOver ? "border-brand bg-brand/5" : "border-border bg-surface-2"
              }`}
            >
              {/* O topo da coluna: a etapa e quantos estão nela agora, em
                  número grande; a barrinha de quantos chegaram até aqui, sobre
                  o total; e a linha "N chegaram · X% passaram" — a passagem da
                  etapa anterior. A mesma conta do gráfico que saiu. */}
              <div className="mb-2.5 px-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`min-w-0 text-fs-3 font-semibold ${isContratado ? "text-success-fg" : "text-fg"}`}>
                    {STAGE_LABEL[stage]}
                  </span>
                  <span className="font-display text-fs-8 font-semibold leading-none text-fg tnum" aria-hidden>
                    {stageCards.length}
                  </span>
                </div>
                {n && (
                  <>
                    <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                      {n.chegaram > 0 && (
                        <span
                          className="block h-full min-w-1.5 rounded-full"
                          style={{
                            width: `${n.parteDoTotal * 100}%`,
                            background: "linear-gradient(to right, var(--c41-grafico-coluna-base), var(--c41-grafico-coluna-topo))",
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-micro text-fg-muted tnum">{linhaDaColuna(n)}</p>
                  </>
                )}
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
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand/10 text-brand text-micro font-semibold flex items-center justify-center">
                        {initials(c.personName)}
                      </span>
                      {/* Contratada, a pessoa deixou de ser candidata: a ficha
                          dela é a de Pessoas — /candidatos só abre candidato e
                          dava 404. */}
                      <Link
                        href={isContratado ? `/pessoas/${c.personId}` : `/candidatos/${c.personId}`}
                        className="min-w-0 text-ui text-fg hover:text-brand transition-colors truncate"
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
                    {c.respostas && <p className="text-micro text-fg-secondary mt-1.5 pl-8 tnum">{c.respostas}</p>}
                    {c.origin && <p className="text-micro text-fg-muted mt-1.5 pl-8">via {rotuloDaOrigem(c.origin)}</p>}

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
                          onChange={(e) => pedirMover(c.id, e.target.value as Stage)}
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
                        // O "⋯" do app (15/10/2026), que era montado à mão aqui
                        // com Popover + IconButton. Com 36px no celular — 28px
                        // é pequeno para o dedo (auditoria DRG-37, 07/10/2026).
                        <MenuDeMaisAcoes
                          align="right"
                          width={180}
                          rotulo={`Mais ações para ${c.personName}`}
                          aria-label={`Encerrar a candidatura de ${c.personName}`}
                          classeDoGatilho="max-md:w-9 max-md:h-9"
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
                        </MenuDeMaisAcoes>
                      )}
                      {/* Desfazer a contratação (30/10/2026, "desfazer com
                          trava"): só enquanto o DP não começou a admissão. Com
                          a trava, o item aparece desligado e diz por quê. */}
                      {canManage && isContratado && c.travaDoDesfazer !== undefined && (
                        <MenuDeMaisAcoes
                          align="right"
                          width={260}
                          sempreMenu
                          rotulo={`Mais ações para ${c.personName}`}
                          classeDoGatilho="max-md:w-9 max-md:h-9"
                        >
                          {({ close }) => (
                            <ItemDoMenu
                              icone={<Undo2 />}
                              disabled={!!c.travaDoDesfazer}
                              descricao={c.travaDoDesfazer ?? "A pessoa volta a candidata e o cartão, à Proposta."}
                              onClick={() => {
                                close();
                                setErroDoDesfazer(null);
                                setDesfazerAlvo({ cardId: c.id, personName: c.personName });
                              }}
                            >
                              Desfazer contratação
                            </ItemDoMenu>
                          )}
                        </MenuDeMaisAcoes>
                      )}
                    </div>
                  </article>
                ))}
                {stageCards.length === 0 && <p className="text-micro text-fg-muted text-center py-3">—</p>}
              </div>
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={contratarAlvo !== null}
        title={`Contratar ${contratarAlvo?.personName ?? ""}?`}
        description="A pessoa passa a colaboradora da empresa da vaga, com a admissão em andamento no DP, e o cartão fica fixo em Contratado. Enquanto o DP não começar a admissão, dá para desfazer pelo ⋯ do cartão."
        confirmLabel="Contratar"
        pending={pending}
        onConfirm={() => {
          if (!contratarAlvo) return;
          moveCard(contratarAlvo.cardId, "CONTRATADO");
          setContratarAlvo(null);
        }}
        onCancel={() => setContratarAlvo(null)}
      />

      <ConfirmDialog
        open={desfazerAlvo !== null}
        title={`Desfazer a contratação de ${desfazerAlvo?.personName ?? ""}?`}
        description="A pessoa volta a candidata — sai da empresa e do cargo da vaga no DP — e o cartão volta para Proposta, de onde segue pelo quadro."
        confirmLabel="Desfazer contratação"
        destructive
        pending={pending}
        error={erroDoDesfazer}
        onConfirm={() => {
          if (!desfazerAlvo) return;
          const { cardId } = desfazerAlvo;
          startTransition(async () => {
            const r = await desfazerAction(cardId);
            if (r?.error) {
              setErroDoDesfazer(r.error);
              return;
            }
            setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, stage: "PROPOSTA", travaDoDesfazer: undefined } : c)));
            setDesfazerAlvo(null);
          });
        }}
        onCancel={() => setDesfazerAlvo(null)}
      />

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
