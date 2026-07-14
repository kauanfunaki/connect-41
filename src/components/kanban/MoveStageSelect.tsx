"use client";

import { useTransition } from "react";
import { Select } from "@/components/ui/Select";

type Stage = { id: string; name: string };

type Props = {
  itemId: string;
  currentStageId: string;
  stages: Stage[];
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
};

export function MoveStageSelect({ itemId, currentStageId, stages, moveAction }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      defaultValue={currentStageId}
      disabled={isPending}
      onChange={(e) => startTransition(() => moveAction(itemId, e.target.value))}
      className="w-auto"
    >
      {stages.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </Select>
  );
}
