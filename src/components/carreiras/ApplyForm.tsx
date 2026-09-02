"use client";

import { useState } from "react";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { UFS } from "@/lib/ufs";

type Props = {
  slug: string;
  vagaId: string;
};

export function ApplyForm({ slug, vagaId }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    form.set("slug", slug);
    form.set("vagaId", vagaId);
    // Checkbox desmarcado não entra no FormData — normaliza pro backend.
    form.set("consent", form.get("consent") ? "true" : "false");

    try {
      const res = await fetch("/api/carreiras/apply", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erro ao enviar candidatura. Tente novamente.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro ao enviar candidatura. Verifique sua conexão e tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="bg-success/10 border border-success/25 rounded-lg p-6 text-center">
        <p className="text-[15px] font-semibold text-success">Candidatura enviada!</p>
        <p className="text-[13px] text-fg-muted mt-1">
          Recebemos seus dados. Se o seu perfil avançar no processo, a equipe de recrutamento entra em contato pelo e-mail ou telefone informado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Nome completo" htmlFor="name" required>
          <Input id="name" name="name" type="text" required minLength={3} maxLength={120} />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" required maxLength={120} />
        </CampoForm>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CampoForm label="Telefone / WhatsApp" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" maxLength={30} />
        </CampoForm>
        <CampoForm label="Cidade" htmlFor="city">
          <Input id="city" name="city" type="text" maxLength={80} />
        </CampoForm>
        <CampoForm label="UF" htmlFor="stateCode">
          <Select id="stateCode" name="stateCode" defaultValue="">
            <option value="">Selecione</option>
            {UFS.map((uf) => (
              <option key={uf.value} value={uf.value}>{uf.label}</option>
            ))}
          </Select>
        </CampoForm>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="resume" className="block text-[length:var(--fs-label)] font-medium text-fg">
          Currículo (PDF, opcional)
        </label>
        <FileDropzoneField id="resume" name="resume" accept=".pdf" maxSizeMb={10} />
      </div>

      <Checkbox
        name="consent"
        value="true"
        label="Autorizo o uso dos meus dados pessoais para participação neste processo seletivo (LGPD)."
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-10 rounded-md bg-brand text-on-brand text-[14px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? "Enviando…" : "Enviar Candidatura"}
      </button>

      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>
      )}
    </form>
  );
}
