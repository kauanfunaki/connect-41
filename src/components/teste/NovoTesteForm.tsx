"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
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
    // Grade, e não `flex items-end` com larguras fixas (w-64/w-56): no celular
    // os campos estouravam a tela, e o botão só ficava alinhado enquanto
    // nenhum campo tivesse texto de ajuda embaixo.
    <form onSubmit={handleSubmit} className="border-b border-border pb-4 mb-4 space-y-3">
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:grid-cols-[320px_280px_auto]">
        <CampoForm label="Candidato" htmlFor="personId" required>
          <Select id="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <TestTypeSelect templates={templates} value={testType} onChange={setTestType} id="novo-teste-type" />
        <AlinhadoAoCampo>
          <Button type="submit" disabled={pending || !personId} className="w-full sm:w-auto">
            {/* Mesmo rótulo do cartão de teste da candidatura: as duas mandam
                o link ao candidato (DRG-17, 07/10/2026). */}
            {pending ? "Enviando…" : "Enviar teste"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </form>
  );
}
