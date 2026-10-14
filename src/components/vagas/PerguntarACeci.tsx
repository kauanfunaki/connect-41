"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NOME_DA_ASSISTENTE } from "@/lib/ia/ceci";
import { pedirParaAbrirCeci } from "@/lib/ia/chat/abrirCeci";
import { IA_DO_SETOR } from "@/lib/ia/chat/regras";

/**
 * "Perguntar à Ceci sobre esta vaga" — escolha "Vaga · 6 C" do Kauan
 * (14/10/2026), no lugar do bloco "Assistente da vaga", que repetia a Ceci do
 * canto. Abre o chat com a Ceci do Recrutamento; a vaga vai como assunto pelo
 * endereço da página (ver `src/lib/ia/chat/abrirCeci.ts`), e a pessoa escreve
 * a pergunta lá.
 */
export function PerguntarACeci({ tituloDaVaga }: { tituloDaVaga: string }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-haspopup="dialog"
      onClick={() => pedirParaAbrirCeci({ agente: IA_DO_SETOR.recrutamento ?? undefined, assunto: `a vaga ${tituloDaVaga}` })}
    >
      <Sparkles size={14} className="text-brand" /> Perguntar à {NOME_DA_ASSISTENTE} sobre esta vaga
    </Button>
  );
}
