"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { HandoffActionResult } from "@/app/(app)/transferencias/actions";

type Props = {
  action: (userId: string | null) => Promise<HandoffActionResult>;
  options: { id: string; name: string }[];
  currentAssigneeId: string | null;
};

// Auto-salva na troca (sem botão separado) — mesmo espírito do
// ToggleModuleButton: uma única interação já reflete o resultado.
export function AssigneeSelect({ action, options, currentAssigneeId }: Props) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value || null;
    startTransition(async () => {
      const result = await action(value);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(value ? "Responsável atualizado." : "Responsável removido.");
    });
  }

  return (
    <Select
      defaultValue={currentAssigneeId ?? ""}
      onChange={handleChange}
      disabled={pending}
      className="w-auto"
    >
      <option value="">Sem responsável</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}
