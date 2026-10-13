"use client";

import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";

/** O Fiscal reserva a linha para a ação principal; consultas ficam no menu. */
export function MenuFiscal(props: React.ComponentProps<typeof MenuDeMaisAcoes>) {
  return <MenuDeMaisAcoes {...props} sempreMenu />;
}
