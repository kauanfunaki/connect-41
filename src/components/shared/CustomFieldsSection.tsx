"use client";

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
          <div key={f.id} className="space-y-1.5">
            <label htmlFor={`custom_${f.id}`} className="block text-[12px] font-medium text-fg">
              {f.label} {f.required && <span className="text-danger">*</span>}
            </label>
            <CustomFieldInputControl field={f} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomFieldInputControl({ field }: { field: CustomFieldInput }) {
  const name = `custom_${field.id}`;
  const inputClass =
    "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";

  switch (field.fieldType) {
    case "TEXTAREA":
      return (
        <textarea
          id={name}
          name={name}
          rows={3}
          required={field.required}
          defaultValue={field.value ?? ""}
          className={`${inputClass} h-auto py-2 resize-none`}
        />
      );
    case "NUMBER":
      return (
        <input
          id={name}
          name={name}
          type="number"
          required={field.required}
          defaultValue={field.value ?? ""}
          className={inputClass}
        />
      );
    case "DATE":
      return (
        <input
          id={name}
          name={name}
          type="date"
          required={field.required}
          defaultValue={field.value ?? ""}
          className={inputClass}
        />
      );
    case "SELECT":
      return (
        <select id={name} name={name} required={field.required} defaultValue={field.value ?? ""} className={inputClass}>
          <option value="">Selecionar…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case "BOOLEAN":
      return (
        <select id={name} name={name} defaultValue={field.value ?? "false"} className={inputClass}>
          <option value="false">Não</option>
          <option value="true">Sim</option>
        </select>
      );
    default:
      return (
        <input
          id={name}
          name={name}
          type="text"
          required={field.required}
          defaultValue={field.value ?? ""}
          className={inputClass}
        />
      );
  }
}
