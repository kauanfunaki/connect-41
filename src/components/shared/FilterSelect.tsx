"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/Select";

type Props = {
  paramName: string;
  value: string;
  /** Rótulo da opção vazia, ex: "Todas as tags". */
  emptyLabel: string;
  options: { id: string; name: string }[];
  className?: string;
  ariaLabel?: string;
};

// Versão genérica do CompanyFilterSelect (que é específico de empresa e usa
// window.location.href). Aqui preserva os demais filtros da query via
// useSearchParams e navega com router.replace, sem recarregar a página inteira.
export function FilterSelect({ paramName, value, emptyLabel, options, className, ariaLabel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <Select
      aria-label={ariaLabel ?? emptyLabel}
      value={value}
      className={className ?? "w-auto"}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        if (e.target.value) params.set(paramName, e.target.value);
        else params.delete(paramName);
        params.delete("page");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }}
    >
      <option value="">{emptyLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );
}
