"use client";

import { useRef, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { useTestDraft } from "./useTestDraft";

type Question = { id: string; text: string; options: string[] };
type Props = { token: string; questions: Question[] };

type Answers = Record<string, number | null>;

export function QuizForm({ token, questions }: Props) {
  const initial: Answers = Object.fromEntries(questions.map((q) => [q.id, null]));

  // Rascunho é descartado se o modelo mudou (pergunta adicionada/removida
  // depois do link gerado) — as chaves precisam bater com as perguntas atuais.
  function isAnswers(v: unknown): v is Answers {
    if (typeof v !== "object" || v === null) return false;
    const keys = Object.keys(v as object);
    if (keys.length !== questions.length) return false;
    return questions.every((q) => {
      const a = (v as Answers)[q.id];
      return a === null || (typeof a === "number" && Number.isInteger(a) && a >= 0 && a < q.options.length);
    });
  }

  const {
    value: answers,
    setValue: setAnswers,
    hadDraft,
    dismissRestoredNotice,
    clear: clearDraft,
  } = useTestDraft<Answers>({ token, initial, isValid: isAnswers });

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const questionRefs = useRef<(HTMLElement | null)[]>([]);

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const allAnswered = answeredCount === questions.length;
  const firstIncomplete = questions.findIndex((q) => answers[q.id] == null);

  function setAnswer(questionId: string, index: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
  }

  function goToFirstIncomplete() {
    if (firstIncomplete < 0) return;
    questionRefs.current[firstIncomplete]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!allAnswered) {
      setError(
        `Faltam ${questions.length - answeredCount} pergunta(s). Levamos você à primeira que ficou sem resposta.`
      );
      goToFirstIncomplete();
      return;
    }

    const form = new FormData(e.currentTarget);
    form.set("consent", form.get("consent") ? "true" : "false");
    form.set(
      "answers",
      JSON.stringify(questions.map((q) => ({ questionId: q.id, selectedIndex: answers[q.id] })))
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
        <p className="text-[13px] text-fg-secondary">Escolha uma alternativa em cada pergunta.</p>
        <p className="text-[12px] text-fg-muted mt-2">Suas respostas ficam salvas neste aparelho enquanto você responde.</p>
      </section>

      <div className="sticky top-0 z-10 -mx-4 px-4 py-2.5 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <span className="text-[12px] font-medium text-fg">
            {answeredCount} de {questions.length} respondidas
          </span>
          {!allAnswered && answeredCount > 0 && (
            <button type="button" onClick={goToFirstIncomplete} className="text-[12px] text-brand hover:underline">
              Ir à próxima pendente
            </button>
          )}
        </div>
        <div
          className="h-1.5 rounded-full bg-surface-2 overflow-hidden"
          role="progressbar"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={questions.length}
          aria-label="Progresso do teste"
        >
          <div
            className="h-full bg-brand rounded-full transition-[width]"
            style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, qi) => {
          const selected = answers[q.id];
          return (
            <fieldset
              key={q.id}
              ref={(el) => {
                questionRefs.current[qi] = el;
              }}
              className={`bg-surface border rounded-lg p-4 scroll-mt-24 ${
                selected != null ? "border-border" : "border-border-strong"
              }`}
            >
              <legend className="text-[11px] text-fg-muted px-1">
                Pergunta {qi + 1} de {questions.length}
                {selected != null && <span className="text-success"> · ok</span>}
              </legend>

              <p className="text-[14px] font-medium text-fg mb-3">{q.text}</p>

              {/* Alternativa inteira é o alvo (não só o rádio de 13px). */}
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const isChecked = selected === oi;
                  return (
                    <label
                      key={oi}
                      className={`relative flex items-center gap-2.5 min-h-11 px-3 py-2 rounded-md border text-[14px] cursor-pointer transition-colors ${
                        isChecked
                          ? "border-brand bg-brand/8 text-fg"
                          : "border-border-strong text-fg-secondary hover:border-brand hover:text-fg"
                      } has-[:focus-visible]:shadow-[0_0_0_3px_var(--c41-focus-ring)]`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={isChecked}
                        onChange={() => setAnswer(q.id, oi)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors ${
                          isChecked ? "border-brand bg-brand shadow-[inset_0_0_0_2.5px_var(--c41-surface)]" : "border-border-strong"
                        }`}
                      />
                      {opt}
                    </label>
                  );
                })}
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
