"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";

export function SignatureForm({ token, documentTitle }: { token: string; documentTitle: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    form.set("consent", form.get("consent") ? "true" : "false");

    try {
      const res = await fetch(`/d/${token}/assinar`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Não foi possível assinar. Tente novamente.");
        return;
      }
      router.refresh(); // re-renderiza a página, que passa a mostrar "assinado"
    } catch {
      setError("Erro ao assinar. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface border border-brand/30 rounded-lg p-5 mt-5 space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-fg">Assinatura eletrônica</h2>
        <p className="text-[12px] text-fg-muted mt-0.5">
          Confirme seu nome completo para registrar o aceite deste documento. Ficam registrados nome, data/hora e IP.
        </p>
      </div>
      <CampoForm label="Nome completo" htmlFor="signerName" required>
        <Input id="signerName" name="signerName" type="text" required minLength={3} maxLength={180} />
      </CampoForm>
      <Checkbox
        name="consent"
        value="true"
        label={`Li e concordo com o conteúdo de "${documentTitle}" e assino eletronicamente.`}
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-10 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Assinando…" : "Assinar documento"}
      </button>
      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>
      )}
    </form>
  );
}
