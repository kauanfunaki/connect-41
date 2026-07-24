"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";

type Question = { id: string; text: string; options: string[] };
type Props = { token: string; questions: Question[] };

export function QuizForm({ token, questions }: Props) {
  const [answers, setAnswers] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, null]))
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const answeredCount = Object.values(answers).filter((v) => v !== null).length;
  const allAnswered = answeredCount === questions.length;

  function setAnswer(questionId: string, index: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: index }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!allAnswered) {
      setError(`Responda todas as ${questions.length} perguntas antes de enviar (faltam ${questions.length - answeredCount}).`);
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="bg-surface border border-border rounded-lg p-5">
        <p className="text-[13px] text-fg-secondary mb-1">Escolha uma alternativa em cada pergunta.</p>
        <p className="text-[12px] text-fg-muted">
          {answeredCount} de {questions.length} respondidas
        </p>
      </section>

      <div className="space-y-3">
        {questions.map((q, qi) => (
          <section key={q.id} className="bg-surface border border-border rounded-lg p-4">
            <p className="text-[13px] font-medium text-fg mb-3">
              {qi + 1}. {q.text}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <label key={oi} className="flex items-center gap-2 text-[13px] text-fg cursor-pointer">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === oi}
                    onChange={() => setAnswer(q.id, oi)}
                  />
                  {opt}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      <Checkbox
        name="consent"
        value="true"
        label="Confirmo que as respostas são minhas e autorizo o uso dos meus dados pessoais para este processo seletivo (LGPD)."
      />

      <button
        type="submit"
        disabled={isSubmitting || !allAnswered}
        className="w-full h-10 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Enviando…" : "Enviar respostas"}
      </button>

      {error && <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>}
    </form>
  );
}
