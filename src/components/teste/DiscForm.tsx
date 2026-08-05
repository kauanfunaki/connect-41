"use client";

import { useRef, useState } from "react";
import { DISC_BANK, TOTAL_BLOCKS } from "@/lib/discBank";
import { Checkbox } from "@/components/ui/Checkbox";
import { ChoicePill } from "./ChoicePill";
import { useTestDraft } from "./useTestDraft";

type Props = { token: string };

type BlockAnswer = { maisIndex: number | null; menosIndex: number | null };

function emptyAnswers(): BlockAnswer[] {
  return Array.from({ length: TOTAL_BLOCKS }, () => ({ maisIndex: null, menosIndex: null }));
}

function isBlockAnswers(v: unknown): v is BlockAnswer[] {
  return (
    Array.isArray(v) &&
    v.length === TOTAL_BLOCKS &&
    v.every(
      (a) =>
        typeof a === "object" &&
        a !== null &&
        (a.maisIndex === null || (typeof a.maisIndex === "number" && a.maisIndex >= 0 && a.maisIndex < 4)) &&
        (a.menosIndex === null || (typeof a.menosIndex === "number" && a.menosIndex >= 0 && a.menosIndex < 4))
    )
  );
}

export function DiscForm({ token }: Props) {
  const {
    value: answers,
    setValue: setAnswers,
    hadDraft,
    dismissRestoredNotice,
    clear: clearDraft,
  } = useTestDraft<BlockAnswer[]>({ token, initial: emptyAnswers(), isValid: isBlockAnswers });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const blockRefs = useRef<(HTMLElement | null)[]>([]);

  const answeredCount = answers.filter((a) => a.maisIndex !== null && a.menosIndex !== null).length;
  const allAnswered = answeredCount === TOTAL_BLOCKS;
  const firstIncomplete = answers.findIndex((a) => a.maisIndex === null || a.menosIndex === null);

  // Marcar uma palavra como "mais"/"menos" desmarca a mesma palavra do outro
  // lado, se estava lá — mais/menos nunca podem ser a mesma palavra no bloco.
  function setMais(block: number, index: number) {
    setAnswers((prev) =>
      prev.map((a, i) => (i === block ? { maisIndex: index, menosIndex: a.menosIndex === index ? null : a.menosIndex } : a))
    );
  }
  function setMenos(block: number, index: number) {
    setAnswers((prev) =>
      prev.map((a, i) => (i === block ? { menosIndex: index, maisIndex: a.maisIndex === index ? null : a.maisIndex } : a))
    );
  }

  function goToFirstIncomplete() {
    if (firstIncomplete < 0) return;
    blockRefs.current[firstIncomplete]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!allAnswered) {
      // Antes só dizia "faltam N" e o candidato rolava 24 blocos procurando.
      setError(`Faltam ${TOTAL_BLOCKS - answeredCount} bloco(s). Levamos você ao primeiro que ficou incompleto.`);
      goToFirstIncomplete();
      return;
    }

    const form = new FormData(e.currentTarget);
    form.set("consent", form.get("consent") ? "true" : "false");
    form.set(
      "answers",
      JSON.stringify(answers.map((a, block) => ({ block, maisIndex: a.maisIndex, menosIndex: a.menosIndex })))
    );

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/teste/${token}/submit`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erro ao enviar. Tente novamente.");
        return;
      }
      clearDraft();
      setDone(true);
    } catch {
      setError("Erro ao enviar. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-success/10 border border-success/25 rounded-lg p-6 text-center">
        <p className="text-[15px] font-semibold text-success">Teste enviado!</p>
        <p className="text-[13px] text-fg-muted mt-1">
          Obrigado por responder. O resultado já está disponível para a equipe de recrutamento.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hadDraft && (
        <div className="bg-brand/8 border border-brand/25 rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <p className="text-[13px] text-fg">
            Recuperamos as respostas que você já tinha marcado neste link. Continue de onde parou.
          </p>
          <button
            type="button"
            onClick={dismissRestoredNotice}
            className="text-[12px] text-fg-muted hover:text-fg transition-colors flex-shrink-0"
          >
            Ok
          </button>
        </div>
      )}

      <section className="bg-surface border border-border rounded-lg p-5">
        <p className="text-[13px] text-fg-secondary">
          Em cada grupo de 4 palavras, marque a que <strong>mais</strong> combina com você e a que{" "}
          <strong>menos</strong> combina. Não existe resposta certa ou errada — responda com a primeira impressão.
        </p>
        <p className="text-[12px] text-fg-muted mt-2">Suas respostas ficam salvas neste aparelho enquanto você responde.</p>
      </section>

      {/* Progresso fixo: o contador vivia no topo e sumia no scroll, então no
          meio dos 24 blocos não dava pra saber quanto faltava. */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2.5 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-[12px] font-medium text-fg">
            {answeredCount} de {TOTAL_BLOCKS} respondidos
          </span>
          {!allAnswered && answeredCount > 0 && (
            <button
              type="button"
              onClick={goToFirstIncomplete}
              className="text-[12px] text-brand hover:underline"
            >
              Ir ao próximo pendente
            </button>
          )}
        </div>
        <div
          className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={TOTAL_BLOCKS}
          aria-label="Progresso do teste"
        >
          <div
            className="h-full bg-brand rounded-full transition-[width]"
            style={{ width: `${(answeredCount / TOTAL_BLOCKS) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {DISC_BANK.map((block, i) => {
          const a = answers[i]!;
          const complete = a.maisIndex !== null && a.menosIndex !== null;
          return (
            <fieldset
              key={i}
              ref={(el) => {
                blockRefs.current[i] = el;
              }}
              className={`bg-surface border rounded-lg p-4 scroll-mt-24 ${
                complete ? "border-border" : "border-border-strong"
              }`}
            >
              <legend className="text-[11px] text-fg-muted px-1">
                Bloco {i + 1} de {TOTAL_BLOCKS}
                {complete && <span className="text-success"> · ok</span>}
              </legend>

              {/* Uma linha por palavra (em vez de tabela de 3 colunas): em 375px
                  a tabela deixava ~180px pro texto e alvos de 13px. */}
              <div className="divide-y divide-border">
                {block.map((w, wi) => (
                  <div key={wi} className="flex items-center justify-between gap-3 py-2 first:pt-1">
                    <span className="text-[14px] text-fg">{w.word}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ChoicePill
                        name={`mais-${i}`}
                        checked={a.maisIndex === wi}
                        disabled={a.menosIndex === wi}
                        onSelect={() => setMais(i, wi)}
                        label="Mais"
                        ariaLabel={`${w.word}: é o que mais combina comigo`}
                      />
                      <ChoicePill
                        name={`menos-${i}`}
                        checked={a.menosIndex === wi}
                        disabled={a.maisIndex === wi}
                        onSelect={() => setMenos(i, wi)}
                        label="Menos"
                        ariaLabel={`${w.word}: é o que menos combina comigo`}
                        tone="neutral"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <Checkbox
        name="consent"
        value="true"
        label="Confirmo que as respostas são minhas e autorizo o uso dos meus dados pessoais para este processo seletivo (LGPD)."
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Enviando…" : "Enviar respostas"}
      </button>

      {error && (
        <p role="alert" className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}
