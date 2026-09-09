"use client";

import { Button } from "@/components/ui/Button";
type Props = {
  action: () => Promise<void>;
  hasAccess: boolean;
};

export function ToggleAccessButton({ action, hasAccess }: Props) {
  return (
    <Button
      variant={hasAccess ? "danger" : "success"}
      size="sm"
      onClick={() => action()}
      className="flex-shrink-0"
    >
      {hasAccess ? "Revogar acesso" : "Conceder acesso"}
    </Button>
  );
}
