"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Aviso } from "@/components/ui/Aviso";
import { Select } from "@/components/ui/Select";
import { TestTypeSelect, type TemplateOption, type TestTypeValue } from "@/components/teste/TestTypeSelect";
import { gerarLinkTeste } from "@/app/(app)/testes/actions";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type PersonOption = { id: string; name: string };

type Props = { candidatos: PersonOption[]; templates: TemplateOption[] };

/**
 * "Enviar teste" no cabeçalho de /testes, com o formulário numa janela
 * (escolha 5A do Kauan, 08/10/2026). Até aqui o formulário morava aberto no
 * topo da lista.
 */
export function NovoTesteForm(props: Props) {
  return (
    <JanelaDeCadastro rotulo="Enviar teste">
      {(fechar) => <FormularioDoTeste {...props} aoEnviar={fechar} />}
    </JanelaDeCadastro>
  );
}

function FormularioDoTeste({ candidatos, templates, aoEnviar }: Props & { aoEnviar: () => void }) {
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
      router.refresh();
      aoEnviar();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FieldGrid columns="">
        <CampoForm label="Candidato" htmlFor="personId" required>
          <Select id="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <TestTypeSelect templates={templates} value={testType} onChange={setTestType} id="novo-teste-type" />
      </FieldGrid>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !personId} className="w-full sm:w-auto">
          {/* Mesmo rótulo do cartão de teste da candidatura: as duas mandam
              o link ao candidato (DRG-17, 07/10/2026). */}
          {pending ? "Enviando…" : "Enviar teste"}
        </Button>
      </div>
    </form>
  );
}
