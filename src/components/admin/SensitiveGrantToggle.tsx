"use client";

import { useState, useTransition } from "react";

type Props = {
  action: (canView: boolean) => Promise<void>;
  granted: boolean;
  label: string; // ex: "SECTOR_USER × Salário" — usado no aria-label
};

export function SensitiveGrantToggle({ action, granted, label }: Props) {
  const [isPending, startTransition] = useTransition();
  // Otimista: reflete o clique na hora; o revalidatePath da action corrige se falhar.
  const [checked, setChecked] = useState(granted);

  function handleClick() {
    const next = !checked;
    setChecked(next);
    startTransition(() => action(next));
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={handleClick}
      disabled={isPending}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors disabled:opacity-60 ${
        checked ? "bg-brand border-brand" : "bg-surface-2 border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
