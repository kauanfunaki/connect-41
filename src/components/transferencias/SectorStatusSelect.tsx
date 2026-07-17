"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import type { HandoffActionResult } from "@/app/(app)/transferencias/actions";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { HANDOFF_STATUS_LABEL } from "@/lib/handoffs";

type Props = {
  action: (status: HandoffSectorStatus) => Promise<HandoffActionResult>;
  current: HandoffSectorStatus;
};

const STATUSES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

// Situação da transferência num setor (Nova/Resolvendo/Finalizada) —
// auto-salva na troca, mesmo padrão do AssigneeSelect.
export function SectorStatusSelect({ action, current }: Props) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as HandoffSectorStatus;
    startTransition(async () => {
      const result = await action(value);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Situação atualizada para "${HANDOFF_STATUS_LABEL[value]}".`);
    });
  }

  return (
    <Select defaultValue={current} onChange={handleChange} disabled={pending} className="w-auto">
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {HANDOFF_STATUS_LABEL[s]}
        </option>
      ))}
    </Select>
  );
}
