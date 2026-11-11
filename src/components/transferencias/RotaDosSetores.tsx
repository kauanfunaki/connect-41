import { ChevronRight } from "lucide-react";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { SectorChip } from "@/components/ui/SectorChip";
import { HANDOFF_STATUS_LABEL } from "@/lib/handoffs";

// O sinal da situação de cada setor de destino, dentro do chip dele
// (10/11/2026, lista "Caixa de entrada em tabela" do Kauan): nova é o círculo
// tracejado em âmbar (espera alguém começar), resolvendo é o meio círculo
// cheio em azul, finalizada é o círculo com ✓ em verde. Os desenhos vêm da
// página de decisão; as cores são os tons de letra do app. Devolvida
// (10/11/2026) é o círculo com a seta que volta (o "corner-up-left"), em
// vermelho: a parte voltou para quem pediu.
const COR_DO_SINAL: Record<HandoffSectorStatus, string> = {
  NEW: "text-warning-fg",
  IN_PROGRESS: "text-brand",
  DONE: "text-success-fg",
  RETURNED: "text-danger",
};

/** A ordem dos sinais na legenda: o caminho da parte, e a devolução no fim. */
const ORDEM_DA_LEGENDA: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE", "RETURNED"];

/** O desenho do sinal, sem texto: quem usa põe o nome da situação ao lado (legenda) ou no chip. */
export function SinalDoSetor({ status, tamanho = 13 }: { status: HandoffSectorStatus; tamanho?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-shrink-0 ${COR_DO_SINAL[status]}`}
    >
      {status === "NEW" && <circle cx="12" cy="12" r="9" strokeDasharray="3.2 3" />}
      {status === "IN_PROGRESS" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
        </>
      )}
      {status === "DONE" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8.5 12 2.5 2.5 4.5-5" />
        </>
      )}
      {status === "RETURNED" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m11 8.5-3 3 3 3" />
          <path d="M8 11.5h4.5a3 3 0 0 1 3 3v1.5" />
        </>
      )}
    </svg>
  );
}

/**
 * Setor de origem → setores de destino, cada destino com o sinal da situação
 * dele. O nome da situação vai no `title` (o mouse) e num texto só para o
 * leitor de tela ("Fiscal, finalizada"): o desenho sozinho não diz nada a quem
 * não enxerga a cor nem a forma.
 */
export function RotaDosSetores({
  de,
  para,
  rotulos,
  cores,
  className = "",
}: {
  de: string;
  para: { sectorCode: string; status: HandoffSectorStatus }[];
  rotulos: Record<string, string>;
  cores: Record<string, string>;
  className?: string;
}) {
  const nome = (code: string) => rotulos[code] ?? code;
  const cor = (code: string) => cores[code] ?? "#586577";
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <SectorChip label={nome(de)} color={cor(de)} />
      <ChevronRight size={13} aria-label="para" className="text-fg-muted flex-shrink-0" />
      {para.map((s) => (
        <SectorChip key={s.sectorCode} label={nome(s.sectorCode)} color={cor(s.sectorCode)}>
          {/* Uma camada acima do link esticado da linha, para o `title` aparecer. */}
          <span title={HANDOFF_STATUS_LABEL[s.status]} className="relative z-10 inline-flex">
            <SinalDoSetor status={s.status} />
          </span>
          <span className="sr-only">, {HANDOFF_STATUS_LABEL[s.status].toLowerCase()}</span>
        </SectorChip>
      ))}
    </span>
  );
}

/** A legenda dos sinais, embaixo da lista. */
export function LegendaDosSinais({ comNaoLida = true }: { comNaoLida?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-helper text-fg-muted" aria-hidden>
      {comNaoLida && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-[7px] rounded-full bg-brand" />
          ainda não aberta por você
        </span>
      )}
      {ORDEM_DA_LEGENDA.map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <SinalDoSetor status={s} />
          {HANDOFF_STATUS_LABEL[s].toLowerCase()}
        </span>
      ))}
    </p>
  );
}
