"use client";

import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { PRIORIDADES, ROTULOS_PRIORIDADE, type Prioridade } from "@/lib/chamados/regras";

// Da esquerda para a direita, mais urgente (27/10/2026): verde, amarelo,
// laranja e vermelho.
const CORES: Record<Prioridade, string> = { BAIXA: "#23A55A", MEDIA: "#F2C12E", ALTA: "#F28C28", URGENTE: "#E5484D" };

/**
 * Prioridade em quatro botões lado a lado, cada um com a bolinha da cor e o
 * nome (26/11/2026, melhoria-809). Era uma régua de quatro faixas com uma seta
 * embaixo da escolhida, e o nome só ao lado: a cor sozinha não dizia o nível.
 * O mesmo controle serve no Novo chamado, no "Editar dados" e na Classificação
 * do chamado. O rótulo segue o dos outros campos (14px, médio, na cor do texto).
 */
export function SeletorDePrioridade({ value, onChange, disabled = false }: { value: Prioridade; onChange: (p: Prioridade) => void; disabled?: boolean }) {
  return <div className="flex min-w-0 flex-col gap-1.5">
    <span aria-hidden className="text-label font-medium leading-5 text-fg">Prioridade</span>
    {/* Quebra de linha só onde não cabe (a coluna estreita do detalhe, entre md e xl). */}
    <SegmentedControl label="Prioridade" tone="brand" tocavel active={value} onChange={onChange} className="max-w-full flex-wrap self-start"
      items={PRIORIDADES.map(p => ({ key: p, label: ROTULOS_PRIORIDADE[p], disabled, icon: <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: CORES[p] }} /> }))} />
  </div>;
}
