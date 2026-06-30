"use client";

import { useTransition } from "react";

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
    <select
      defaultValue={currentStageId}
      disabled={isPending}
      onChange={(e) => startTransition(() => moveAction(itemId, e.target.value))}
      className="h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors disabled:opacity-60"
    >
      {stages.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
