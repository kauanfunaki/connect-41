"use client";

import { useActionState, useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { TemplateState } from "@/app/(app)/testes/templates/actions";

type QuestionRow = { text: string; options: string[]; correctIndex: number };

type Defaults = {
  id: string;
  name: string;
  description: string;
  questions: QuestionRow[];
};

type Props = {
  action: (prev: TemplateState, form: FormData) => Promise<TemplateState>;
  defaults?: Defaults;
  cancelHref: string;
};

const emptyQuestion: QuestionRow = { text: "", options: ["", ""], correctIndex: 0 };

export function TemplateForm({ action, defaults, cancelHref }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [questions, setQuestions] = useState<QuestionRow[]>(
    defaults?.questions.length ? defaults.questions : [{ ...emptyQuestion }]
  );

  function updateQuestion(i: number, patch: Partial<QuestionRow>) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQuestion() {
    setQuestions((prev) => [...prev, { ...emptyQuestion, options: [...emptyQuestion.options] }]);
  }
  function removeQuestion(i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateOption(i: number, optIndex: number, value: string) {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, options: q.options.map((o, oi) => (oi === optIndex ? value : o)) } : q))
    );
  }
  function addOption(i: number) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? { ...q, options: [...q.options, ""] } : q)));
  }
  function removeOption(i: number, optIndex: number) {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== i) return q;
        const options = q.options.filter((_, oi) => oi !== optIndex);
        const correctIndex = q.correctIndex === optIndex ? 0 : q.correctIndex > optIndex ? q.correctIndex - 1 : q.correctIndex;
        return { ...q, options, correctIndex };
      })
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {defaults && <input type="hidden" name="id" value={defaults.id} />}

      <CampoForm label="Nome do modelo" htmlFor="name" required>
        <Input id="name" name="name" type="text" defaultValue={defaults?.name} placeholder="ex: Português Básico" maxLength={120} required />
      </CampoForm>

      <CampoForm label="Descrição" htmlFor="description" helper="Opcional — visível só pra equipe interna.">
        <Textarea id="description" name="description" rows={2} defaultValue={defaults?.description} maxLength={400} />
      </CampoForm>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-3">
            <input type="hidden" name={`q_text_${i}`} value={q.text} />
            <input type="hidden" name={`q_options_${i}`} value={JSON.stringify(q.options)} />
            <input type="hidden" name={`q_correct_${i}`} value={q.correctIndex} />

            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-fg-muted">Pergunta {i + 1}</span>
              {questions.length > 1 && (
                <button type="button" onClick={() => removeQuestion(i)} className="text-[12px] text-danger hover:underline">
                  Remover
                </button>
              )}
            </div>

            <Input
              type="text"
              value={q.text}
              onChange={(e) => updateQuestion(i, { text: e.target.value })}
              placeholder="Texto da pergunta"
              maxLength={500}
            />

            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={q.correctIndex === oi}
                    onChange={() => updateQuestion(i, { correctIndex: oi })}
                    aria-label={`Alternativa ${oi + 1} é a correta`}
                  />
                  <div className="flex-1">
                    <Input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(i, oi, e.target.value)}
                      placeholder={`Alternativa ${oi + 1}`}
                      maxLength={200}
                    />
                  </div>
                  {q.options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i, oi)}
                      className="text-[12px] text-fg-muted hover:text-danger transition-colors flex-shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {q.options.length < 6 && (
              <button
                type="button"
                onClick={() => addOption(i)}
                className="text-[12px] text-fg-muted hover:text-fg underline transition-colors"
              >
                + Adicionar alternativa
              </button>
            )}
          </div>
        ))}
      </div>

      <input type="hidden" name="q_count" value={questions.length} />

      <button
        type="button"
        onClick={addQuestion}
        className="h-9 px-4 rounded-md border border-border-strong bg-surface-hover text-fg text-[13px] font-medium hover:border-brand transition-colors"
      >
        + Adicionar pergunta
      </button>

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : defaults ? "Atualizar modelo" : "Criar modelo"}
        </button>
        <a href={cancelHref} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Cancelar
        </a>
      </div>

      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
