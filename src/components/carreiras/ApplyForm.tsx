"use client";

import { useState } from "react";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { UFS } from "@/lib/ufs";
import { Button } from "@/components/ui/Button";
import { ConfirmacaoEnviada } from "@/components/publico/ConfirmacaoEnviada";
import { MAX_MB_DO_CURRICULO } from "@/lib/curriculo";

const DISPONIBILIDADES = ["Imediata", "Em até 15 dias", "Em até 30 dias", "Mais de 30 dias"];

type Props = {
  slug: string;
  vagaId: string;
  /** Carimbo de tempo assinado pelo servidor ao montar a página — ver `src/lib/carreiras/antiRobo.ts`. */
  carimbo: string;
};

export function ApplyForm({ slug, vagaId, carimbo }: Props) {
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
    form.set("carimbo", carimbo);
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
      <ConfirmacaoEnviada
        titulo="Candidatura enviada!"
        texto="Recebemos seus dados. Se o seu perfil avançar no processo, a equipe de recrutamento entra em contato pelo e-mail ou telefone informado."
      >
        <Button href={`/carreiras/${slug}/minha-conta`} variant="secondary" size="sm" className="mt-3">
          Acompanhar minhas candidaturas
        </Button>
      </ConfirmacaoEnviada>
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

      {/* As mesmas três perguntas do WhatsApp do Recrutamento — respondidas
          aqui, o robô não pergunta de novo. Nenhuma pede endereço: o tempo até
          o local é o que importa, e ele é opcional.
          O fio de cima fica num <div> por fora: borda no próprio <fieldset>
          faz a legenda "morder" o fio. Os rótulos longos ("Pretensão salarial
          (R$ por mês)") quebravam em duas linhas na coluna de um terço e
          desciam o campo; a unidade foi para o R$ e o "min" do campo. */}
      <div className="border-t border-border pt-4">
        <fieldset className="space-y-3">
          <legend className="text-[length:var(--fs-label)] font-medium text-fg">Algumas perguntas rápidas</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CampoForm label="Pretensão salarial" htmlFor="pretensaoSalarial" required helper="Por mês.">
              <Input id="pretensaoSalarial" name="pretensaoSalarial" type="number" inputMode="decimal" min={1} step="0.01" required prefix="R$" />
            </CampoForm>
            <CampoForm label="Quando pode começar?" htmlFor="disponibilidade" required>
              <Select id="disponibilidade" name="disponibilidade" defaultValue="" required>
                <option value="" disabled>Selecione</option>
                {DISPONIBILIDADES.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Tempo até o local" htmlFor="deslocamentoMinutos">
              <Input id="deslocamentoMinutos" name="deslocamentoMinutos" type="number" inputMode="numeric" min={0} max={600} step={1} placeholder="Opcional" suffix="min" />
            </CampoForm>
          </div>
        </fieldset>
      </div>

      <CampoForm label="Currículo (PDF, opcional)" htmlFor="resume">
        <FileDropzoneField id="resume" name="resume" accept=".pdf" maxSizeMb={MAX_MB_DO_CURRICULO} />
      </CampoForm>

      {/* Campo-armadilha: invisível para quem usa o formulário, preenchido por
          robô que completa todo campo que acha. Fora da tela em vez de
          `display: none`, que parte dos robôs sabe ignorar; fora da ordem de
          tabulação e escondido do leitor de tela, para nenhuma pessoa cair
          nele. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden">
        <label htmlFor="website">Site</label>
        <Input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Caixa no topo do texto: no celular a frase quebra em duas ou três
          linhas, e o `Checkbox` com rótulo centraliza a caixa no parágrafo. */}
      <label htmlFor="consent" className="flex items-start gap-2.5 text-[length:var(--fs-label)] text-fg-secondary cursor-pointer">
        <Checkbox id="consent" name="consent" value="true" className="mt-0.5" />
        <span>Autorizo o uso dos meus dados pessoais para participação neste processo seletivo (LGPD).</span>
      </label>

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Enviando…" : "Enviar Candidatura"}
      </Button>

      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>
      )}
    </form>
  );
}
