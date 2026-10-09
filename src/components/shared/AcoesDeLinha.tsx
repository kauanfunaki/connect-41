"use client";

import { Pencil, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  foraDeOperacao: boolean;
  onToggle: () => void;
  editarHref: string;
  className?: string;
};

/** Ações diretas dos cadastros; a inativação mantém a confirmação do chamador. */
export function AcoesDeLinha({ foraDeOperacao, onToggle, editarHref, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`.trim()}>
      <Button variant="secondary" size="xs" href={editarHref}>
        <Pencil size={11} /> Editar
      </Button>
      <Button variant={foraDeOperacao ? "secondary" : "danger"} size="xs" type="button" onClick={onToggle}>
        {foraDeOperacao ? <Power size={11} /> : <PowerOff size={11} />}
        {foraDeOperacao ? "Reativar" : "Inativar"}
      </Button>
    </span>
  );
}
