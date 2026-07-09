"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Props = {
  className?: string;
};

// router.back() em vez de Link pra voltar de verdade na navegação do browser —
// preserva estado que só existe na entrada de histórico anterior (ex: aba
// selecionada em ?tab= na ficha de Empresa/Pessoa), diferente de um Link fixo
// que sempre abriria a aba padrão.
export function BackButton({ className = "" }: Props) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={`inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg transition-colors ${className}`.trim()}
    >
      <ArrowLeft size={14} />
      Voltar
    </button>
  );
}
