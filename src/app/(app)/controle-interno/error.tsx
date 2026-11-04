"use client";

import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";

export default function ErroControleInterno({ reset }: { reset: () => void }) {
  return <PageContainer><EmptyState tom="erro" title="Controle interno indisponível" description="Tente novamente. Se continuar, peça à administração para conferir a conexão e a migração do módulo." action={<Button onClick={reset}>Tentar novamente</Button>} /></PageContainer>;
}
