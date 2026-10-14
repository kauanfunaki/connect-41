"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";

type Props = {
  paramName?: string;
  placeholder?: string;
  className?: string;
  /** Repassa a variante enxuta do Input — default true porque este componente só é usado em barra de ferramentas acima de listagem, nunca em formulário. */
  compact?: boolean;
};

// Filtra a listagem enquanto o usuário digita (debounce de 350ms), sem
// precisar apertar Enter — atualiza a URL via router.replace preservando os
// demais filtros ativos (status, empresa, etc.) já presentes na query string.
export function DebouncedSearchInput({ paramName = "search", placeholder, className, compact = true }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramName) ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // O valor já é o da URL (o campo acabou de aparecer, ou a pessoa apagou
      // e redigitou o mesmo): nada a fazer. Sem isto, abrir uma lista direto na
      // página 2 — ou o campo remontar ao trocar de empresa — voltava para a 1.
      if (value.trim() === (searchParams.get(paramName) ?? "").trim()) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set(paramName, value.trim());
      else params.delete(paramName);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // A caixa de busca do app, com o "limpar" próprio: apagar volta a lista
  // inteira pelo mesmo debounce de quem digita.
  return (
    <CampoDeBusca
      compact={compact}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}
