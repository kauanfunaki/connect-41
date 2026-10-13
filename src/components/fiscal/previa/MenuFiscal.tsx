"use client";

import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";

/** Segue o padrão do Connect: ação única direta, várias opções no menu. */
export function MenuFiscal(props: React.ComponentProps<typeof MenuDeMaisAcoes>) {
  return <MenuDeMaisAcoes {...props} />;
}
