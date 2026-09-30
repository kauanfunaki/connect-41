"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { BellRing, Clock, LayoutDashboard, Users } from "lucide-react";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";

type Aba = "painel" | "alertas" | "coordenadores" | "horas";

export const ABAS_DA_GESTAO: { chave: Aba; rotulo: string; href: string; icone: React.ReactNode }[] = [
  { chave: "painel", rotulo: "Painel", href: "/gestao", icone: <LayoutDashboard /> },
  { chave: "alertas", rotulo: "Alertas", href: "/gestao/alertas", icone: <BellRing /> },
  { chave: "coordenadores", rotulo: "Coordenadores", href: "/gestao/coordenadores", icone: <Users /> },
  { chave: "horas", rotulo: "Horas de operação", href: "/gestao/horas", icone: <Clock /> },
];

/**
 * As abas da Gestão. O filtro de setor acompanha a troca de aba.
 *
 * Eram um `SegmentedControl` (até 30/09) — o mesmo desenho dos seletores que
 * mudam um valor. Aba troca a tela, e tem o desenho de aba do Connect.
 */
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
    <AbasDeLink
      abas={ABAS_DA_GESTAO.map((a) => ({ ...a, href: setor ? `${a.href}?setor=${encodeURIComponent(setor)}` : a.href }))}
      ativa={ativa}
    />
  );
}
