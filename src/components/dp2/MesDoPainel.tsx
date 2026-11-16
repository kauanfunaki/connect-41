"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CampoMes } from "@/components/ui/CampoMes";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";

/**
 * Quanto esperar depois da última mudança antes de filtrar. Digitando, o campo
 * já lê "1020" como 10/2020 antes de a pessoa terminar o "26" do ano: sem a
 * espera, o painel ia para 2020 e voltava, e o histórico ganhava um mês a mais.
 */
const ESPERA_MS = 600;

/**
 * O mês do Painel do DP 2 (16/11/2026, melhoria-698): escolher ou digitar um
 * mês completo já filtra, sem o botão "Ver mês" que havia ao lado. Campo limpo
 * não navega — o painel fica no mês que estava, como a competência do SPED.
 */
export function MesDoPainel({ mes }: { mes: string }) {
  const { ir } = useNavegarSemRecarregar();
  const pathname = usePathname();
  const params = useSearchParams();
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);
  // Solto (`defaultValue`), para o mês escolhido ficar no campo durante a
  // espera; o `key` o refaz quando o painel muda de mês, inclusive pelo voltar.
  return (
    <CampoMes
      key={mes}
      name="mes"
      defaultValue={mes}
      aria-label="Mês"
      compact
      onChange={(v) => {
        clearTimeout(espera.current);
        if (!v || v === mes) return;
        espera.current = setTimeout(() => {
          const q = new URLSearchParams(params);
          q.set("mes", v);
          ir(`${pathname}?${q}`);
        }, ESPERA_MS);
      }}
    />
  );
}
