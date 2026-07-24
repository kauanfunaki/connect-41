"use client";

import { useState } from "react";
import { DISC_BANK, TOTAL_BLOCKS } from "@/lib/discBank";
import { Checkbox } from "@/components/ui/Checkbox";

type Props = { token: string };

type BlockAnswer = { maisIndex: number | null; menosIndex: number | null };

function emptyAnswers(): BlockAnswer[] {
  return Array.from({ length: TOTAL_BLOCKS }, () => ({ maisIndex: null, menosIndex: null }));
}

export function DiscForm({ token }: Props) {
  const [answers, setAnswers] = useState<BlockAnswer[]>(emptyAnswers);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const answeredCount = answers.filter((a) => a.maisIndex !== null && a.menosIndex !== null).length;
  const allAnswered = answeredCount === TOTAL_BLOCKS;

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!allAnswered) {
      setError(`Responda todos os ${TOTAL_BLOCKS} blocos antes de enviar (faltam ${TOTAL_BLOCKS - answeredCount}).`);
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
        <p className="text-[13px] text-fg-secondary mb-1">
          Para cada grupo de 4 palavras, marque a que <strong>mais</strong> combina com você e a que{" "}
          <strong>menos</strong> combina. Não existe resposta certa ou errada — responda com a primeira impressão.
        </p>
        <p className="text-[12px] text-fg-muted">
          {answeredCount} de {TOTAL_BLOCKS} respondidos
        </p>
      </section>

      <div className="space-y-3">
        {DISC_BANK.map((block, i) => {
          const a = answers[i]!;
          return (
            <section key={i} className="bg-surface border border-border rounded-lg p-4">
              <p className="text-[11px] text-fg-muted mb-2">
                Bloco {i + 1} de {TOTAL_BLOCKS}
              </p>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-[11px] text-fg-muted">
                    <th className="text-left font-normal"></th>
                    <th className="font-normal w-16">Mais</th>
                    <th className="font-normal w-16">Menos</th>
                  </tr>
                </thead>
                <tbody>
                  {block.map((w, wi) => (
                    <tr key={wi} className="border-t border-border">
                      <td className="py-2 text-fg">{w.word}</td>
                      <td className="text-center">
                        <input
                          type="radio"
                          name={`mais-${i}`}
                          checked={a.maisIndex === wi}
                          disabled={a.menosIndex === wi}
                          onChange={() => setMais(i, wi)}
                          aria-label={`${w.word} — mais como eu`}
                        />
                      </td>
                      <td className="text-center">
                        <input
                          type="radio"
                          name={`menos-${i}`}
                          checked={a.menosIndex === wi}
                          disabled={a.maisIndex === wi}
                          onChange={() => setMenos(i, wi)}
                          aria-label={`${w.word} — menos como eu`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
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
        disabled={isSubmitting || !allAnswered}
        className="w-full h-10 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Enviando…" : "Enviar respostas"}
      </button>

      {error && <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>}
    </form>
  );
}
