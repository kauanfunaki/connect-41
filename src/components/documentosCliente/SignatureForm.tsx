"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

/**
 * O aceite eletrônico de um documento enviado ao cliente — o mesmo formulário
 * na página pública do link por e-mail e no portal (08/10/2026):
 * - com `token`, posta na rota pública `/d/{token}/assinar` (quem abre não tem login);
 * - com `acao`, chama a server action do portal, que confere a sessão e o
 *   alcance do cliente.
 * As duas pontas validam pela mesma regra (`lib/envios/regras.ts`).
 */
export function SignatureForm({
  token,
  acao,
  documentTitle,
  nomePadrao,
}: {
  token?: string;
  acao?: (form: FormData) => Promise<{ error: string } | { ok: true }>;
  documentTitle: string;
  /** O nome que já se conhece (o da conta do portal); a pessoa pode corrigir. */
  nomePadrao?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function enviar(form: FormData): Promise<string | null> {
    if (acao) {
      const r = await acao(form);
      return "error" in r ? r.error : null;
    }
    const res = await fetch(`/d/${token}/assinar`, { method: "POST", body: form });
    const body = await res.json();
    return res.ok ? null : (body.error ?? "Não foi possível assinar. Tente novamente.");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    form.set("consent", form.get("consent") ? "true" : "false");

    try {
      const erro = await enviar(form);
      if (erro) {
        setError(erro);
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
        <h2 className="text-fs-5 font-semibold text-fg">Assinatura eletrônica</h2>
        <p className="text-fs-2 text-fg-muted mt-0.5">
          Confirme seu nome completo para registrar o aceite deste documento. Ficam registrados nome, data/hora e IP.
        </p>
      </div>
      <CampoForm label="Nome completo" htmlFor="signerName" required>
        <Input id="signerName" name="signerName" type="text" required minLength={3} maxLength={180} defaultValue={nomePadrao} />
      </CampoForm>
      <Checkbox
        name="consent"
        value="true"
        label={`Li e concordo com o conteúdo de "${documentTitle}" e assino eletronicamente.`}
      />
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Assinando…" : "Assinar documento"}
      </Button>
      {error && (
        <Aviso>{error}</Aviso>
      )}
    </form>
  );
}
