"use client";

import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";

export type TemplateOption = { id: string; name: string };

export type TestTypeValue = { type: "DISC" } | { type: "MULTIPLA_ESCOLHA"; templateId: string };

type Props = {
  templates: TemplateOption[];
  value: TestTypeValue;
  onChange: (value: TestTypeValue) => void;
  id?: string;
};

// Dropdown DISC + um item por modelo de múltipla escolha ativo — usado tanto
// no "+ Novo teste" da lista quanto no card embutido de candidatura/candidato.
export function TestTypeSelect({ templates, value, onChange, id }: Props) {
  const selectValue = value.type === "DISC" ? "DISC" : value.templateId;

  return (
    <CampoForm label="Tipo de teste" htmlFor={id ?? "test-type"}>
      <Select
        id={id ?? "test-type"}
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "DISC") onChange({ type: "DISC" });
          else onChange({ type: "MULTIPLA_ESCOLHA", templateId: v });
        }}
      >
        <option value="DISC">DISC (perfil comportamental)</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}
