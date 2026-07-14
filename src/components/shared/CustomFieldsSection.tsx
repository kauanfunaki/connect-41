"use client";

import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

export type CustomFieldInput = {
  id: string;
  label: string;
  fieldType: "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";
  options: string[];
  required: boolean;
  value: string | null;
};

export function CustomFieldsSection({ fields }: { fields: CustomFieldInput[] }) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider border-b border-border pb-2">
        Campos Adicionais
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {fields.map((f) => (
          <CampoForm key={f.id} label={f.label} htmlFor={`custom_${f.id}`} required={f.required}>
            <CustomFieldInputControl field={f} />
          </CampoForm>
        ))}
      </div>
    </div>
  );
}

function CustomFieldInputControl({ field }: { field: CustomFieldInput }) {
  const name = `custom_${field.id}`;

  switch (field.fieldType) {
    case "TEXTAREA":
      return (
        <Textarea
          id={name}
          name={name}
          rows={3}
          required={field.required}
          defaultValue={field.value ?? ""}
        />
      );
    case "NUMBER":
      return (
        <Input
          id={name}
          name={name}
          type="number"
          required={field.required}
          defaultValue={field.value ?? ""}
        />
      );
    case "DATE":
      return (
        <Input
          id={name}
          name={name}
          type="date"
          required={field.required}
          defaultValue={field.value ?? ""}
        />
      );
    case "SELECT":
      return (
        <Select id={name} name={name} required={field.required} defaultValue={field.value ?? ""}>
          <option value="">Selecionar…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>
      );
    case "BOOLEAN":
      return (
        <Select id={name} name={name} defaultValue={field.value ?? "false"}>
          <option value="false">Não</option>
          <option value="true">Sim</option>
        </Select>
      );
    default:
      return (
        <Input
          id={name}
          name={name}
          type="text"
          required={field.required}
          defaultValue={field.value ?? ""}
        />
      );
  }
}
