"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Abre o cartão por cima do quadro quando o endereço pede (`?abrir=tarefa-77`,
 * 27/11/2026, funcionalidade-844): o "Ver no quadro" do processo leva à lista
 * com o cartão já aberto. A navegação parte do próprio quadro, então cai na
 * rota interceptada (`@modal/(.)itens`) e o cartão abre em modal, com a lista
 * atrás.
 *
 * O `?abrir=` sai do endereço antes: fechar o cartão (`router.back()`) volta ao
 * quadro limpo, e não ao endereço que o abriria de novo.
 */
export function AbrirCartaoDoEndereco({ basePath, segmento }: { basePath: string; segmento: string | null }) {
  const router = useRouter();
  const feito = useRef(false);

  useEffect(() => {
    if (!segmento || feito.current) return;
    feito.current = true;
    const params = new URLSearchParams(window.location.search);
    params.delete("abrir");
    const resto = params.toString();
    window.history.replaceState(null, "", resto ? `${basePath}?${resto}` : basePath);
    router.push(`${basePath}/itens/${encodeURIComponent(segmento)}`, { scroll: false });
  }, [basePath, segmento, router]);

  return null;
}
