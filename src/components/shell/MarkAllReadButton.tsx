"use client";

import { Button } from "@/components/ui/Button";
type Props = {
  action: () => Promise<void>;
};

export function MarkAllReadButton({ action }: Props) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => action()}
    >
      Marcar todas como lidas
    </Button>
  );
}
