"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

type Aba = "painel" | "alertas" | "coordenadores" | "horas";

const ABAS: { key: Aba; label: string; href: string }[] = [
  { key: "painel", label: "Painel", href: "/gestao" },
  { key: "alertas", label: "Alertas", href: "/gestao/alertas" },
  { key: "coordenadores", label: "Coordenadores", href: "/gestao/coordenadores" },
  { key: "horas", label: "Horas de operação", href: "/gestao/horas" },
];

/** As abas da Gestão. O filtro de setor acompanha a troca de aba. */
export function AbasDaGestao() {
  const pathname = usePathname();
  const params = useSearchParams();
  const setor = params.get("setor");
  const ativa: Aba = pathname.startsWith("/gestao/alertas")
    ? "alertas"
    : pathname.startsWith("/gestao/coordenadores")
      ? "coordenadores"
      : pathname.startsWith("/gestao/horas")
        ? "horas"
        : "painel";
  return (
    <SegmentedControl<Aba>
      label="Telas da Gestão"
      active={ativa}
      items={ABAS.map((a) => ({ ...a, href: setor ? `${a.href}?setor=${encodeURIComponent(setor)}` : a.href }))}
    />
  );
}
