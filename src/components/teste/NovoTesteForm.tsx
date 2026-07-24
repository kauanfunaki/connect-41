"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { TestTypeSelect, type TemplateOption, type TestTypeValue } from "@/components/teste/TestTypeSelect";
import { gerarLinkTeste } from "@/app/(app)/testes/actions";

type PersonOption = { id: string; name: string };

type Props = { candidatos: PersonOption[]; templates: TemplateOption[] };

export function NovoTesteForm({ candidatos, templates }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");
  const [testType, setTestType] = useState<TestTypeValue>({ type: "DISC" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!personId) return;
    setError(null);
    setPending(true);
    try {
      const result = await gerarLinkTeste(
        personId,
        null,
        testType.type,
        testType.type === "MULTIPLA_ESCOLHA" ? testType.templateId : null
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setPersonId("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap border-b border-border pb-4 mb-4">
      <div className="w-64">
        <CampoForm label="Candidato" htmlFor="personId" required>
          <Select id="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
      </div>
      <div className="w-56">
        <TestTypeSelect templates={templates} value={testType} onChange={setTestType} id="novo-teste-type" />
      </div>
      <button
        type="submit"
        disabled={pending || !personId}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {pending ? "Enviando…" : "+ Novo teste"}
      </button>
      {error && <p className="text-[13px] text-danger w-full">{error}</p>}
    </form>
  );
}
