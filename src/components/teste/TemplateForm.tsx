"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormFooter } from "@/components/ui/FormFooter";
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
    <form action={formAction} className="flex flex-col gap-5">
      {defaults && <input type="hidden" name="id" value={defaults.id} />}

      <CampoForm label="Nome do modelo" htmlFor="name" required>
        <Input id="name" name="name" type="text" defaultValue={defaults?.name} placeholder="ex: Português Básico" maxLength={120} required />
      </CampoForm>

      <CampoForm label="Descrição" htmlFor="description" helper="Opcional — visível só pra equipe interna.">
        <Textarea id="description" name="description" rows={2} defaultValue={defaults?.description} maxLength={400} />
      </CampoForm>

      {/* Cada pergunta é um cartão com cabeçalho (título e "Remover" na mesma
          linha) e as alternativas num grupo com legenda. Antes o rótulo era
          um texto cinza de 12px, o rádio cru não dizia para que servia e o
          "x" de 28px ficava mais baixo que o campo de 36px ao lado. */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-4">
            <input type="hidden" name={`q_text_${i}`} value={q.text} />
            <input type="hidden" name={`q_options_${i}`} value={JSON.stringify(q.options)} />
            <input type="hidden" name={`q_correct_${i}`} value={q.correctIndex} />

            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`pergunta-${i}`} className="text-[length:var(--fs-label)] font-medium text-fg">
                Pergunta {i + 1}
              </label>
              {questions.length > 1 && (
                <Button variant="danger" size="xs" onClick={() => removeQuestion(i)}>
                  <Trash2 size={12} /> Remover
                </Button>
              )}
            </div>

            <Input
              id={`pergunta-${i}`}
              type="text"
              value={q.text}
              onChange={(e) => updateQuestion(i, { text: e.target.value })}
              placeholder="Texto da pergunta"
              maxLength={500}
            />

            <fieldset className="space-y-2">
              <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">
                Alternativas <span className="font-normal text-fg-muted text-[length:var(--fs-helper)]">— marque a correta</span>
              </legend>
              {q.options.map((opt, oi) => (
                <div key={oi} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={q.correctIndex === oi}
                    onChange={() => updateQuestion(i, { correctIndex: oi })}
                    aria-label={`Alternativa ${oi + 1} é a correta`}
                    className="w-4 h-4 flex-shrink-0 accent-brand cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <Input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(i, oi, e.target.value)}
                      placeholder={`Alternativa ${oi + 1}`}
                      aria-label={`Alternativa ${oi + 1}`}
                      maxLength={200}
                    />
                  </div>
                  {q.options.length > 2 && (
                    <Button
                      variant="ghost"
                      onClick={() => removeOption(i, oi)}
                      className="w-9 px-0! flex-shrink-0 hover:text-danger!"
                      aria-label={`Remover a alternativa ${oi + 1}`}
                    >
                      <X size={15} />
                    </Button>
                  )}
                </div>
              ))}
              {q.options.length < 6 && (
                <Button variant="secondary" size="sm" onClick={() => addOption(i)}>
                  <Plus size={14} /> Adicionar alternativa
                </Button>
              )}
            </fieldset>
          </div>
        ))}
      </div>

      <input type="hidden" name="q_count" value={questions.length} />

      <div>
        <Button variant="secondary" onClick={addQuestion}>
          <Plus size={14} /> Adicionar pergunta
        </Button>
      </div>

      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}

      <FormFooter cancelHref={cancelHref} pending={isPending} submitLabel={defaults ? "Atualizar modelo" : "Criar modelo"} />
    </form>
  );
}
