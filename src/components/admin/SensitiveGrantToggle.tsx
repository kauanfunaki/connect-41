"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/Switch";

type Props = {
  action: (canView: boolean) => Promise<void>;
  granted: boolean;
  label: string; // ex: "SECTOR_USER × Salário" — usado no aria-label
};

export function SensitiveGrantToggle({ action, granted, label }: Props) {
  const [isPending, startTransition] = useTransition();
  // Otimista: reflete o clique na hora; o revalidatePath da action corrige se falhar.
  const [checked, setChecked] = useState(granted);

  function alternar(next: boolean) {
    setChecked(next);
    startTransition(() => action(next));
  }

  return <Switch checked={checked} onCheckedChange={alternar} disabled={isPending} aria-label={label} />;
}
