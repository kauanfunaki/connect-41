"use client";

// O painel das contas de uma célula do Previsto (25/11/2026). A célula vem no
// endereço (`celula=`), então o painel abre por link, volta com o "voltar" do
// navegador e fecha tirando o parâmetro — sem estado escondido na tela.

import { useRouter } from "next/navigation";
import { SlideOver } from "@/components/ui/SlideOver";

export function PainelDaCelula({ titulo, fecharHref, children }: { titulo: string; fecharHref: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <SlideOver open title={titulo} width="max-w-lg" fundo="leve" onClose={() => router.replace(fecharHref, { scroll: false })}>
      {children}
    </SlideOver>
  );
}
