import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate } from "@/lib/format";
import {
  situacaoDaLicenca,
  diasAte,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
} from "@/lib/societario/licencas";
import { campoDaData } from "@/lib/societario/datas";
import type { LinhaDeLicenca } from "@/lib/societario/licencas-data";
import { AcoesDaLicenca } from "./AcoesDaLicenca";
import type { OrgaoDaLicenca } from "./LicencaForm";

type Props = {
  linhas: LinhaDeLicenca[];
  /** Hoje, do servidor — o relógio do navegador pode estar noutro fuso. */
  hoje: Date;
  filtrado: boolean;
  orgaos: OrgaoDaLicenca[];
};

/**
 * Quanto falta, em palavras.
 *
 * "Vence em 12 dias" é acionável; "18/09/2026" obriga quem lê a fazer a conta —
 * e é a conta que a fila existe para poupar.
 */
function prazoEmPalavras(expiresAt: Date | null, hoje: Date): string | null {
  if (!expiresAt) return null;
  const dias = diasAte(expiresAt, hoje);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 0) return `vence em ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${Math.abs(dias)} dias`;
}

export function LicencasFila({ linhas, hoje, filtrado, orgaos }: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nada neste recorte"
        description="Troque o filtro acima para ver as outras."
        icon={<ShieldCheck />}
      />
    ) : (
      <EmptyState
        title="Nenhuma licença cadastrada"
        description="Alvará, licença sanitária, ambiental, bombeiros — o que fica valendo depois que o processo fecha, e cuja validade gera a próxima renovação. Cadastre em “Nova licença”."
        icon={<ShieldCheck />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Empresa</th>
            <th className="py-2 pr-3 font-medium">Licença</th>
            <th className="py-2 pr-3 font-medium">Órgão</th>
            <th className="py-2 pr-3 font-medium">Número</th>
            <th className="py-2 pr-3 font-medium">Validade</th>
            <th className="py-2 pr-3 font-medium">Situação</th>
            <th className="py-2 font-medium">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const situacao = situacaoDaLicenca(l, hoje);
            const prazo = prazoEmPalavras(l.expiresAt, hoje);
            return (
              <tr key={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                <td className="py-2.5 pr-3">
                  <Link href={`/empresas/${l.companyId}`} className="font-medium hover:text-brand transition-colors">
                    {l.empresaNome}
                  </Link>
                </td>
                <td className="py-2.5 pr-3 text-fg-secondary">
                  {l.kind}
                  {l.notes && (
                    <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{l.notes}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-fg-muted">{l.orgaoNome ?? "—"}</td>
                <td className="py-2.5 pr-3 tabular-nums text-fg-secondary">{l.number ?? "—"}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                  {l.expiresAt ? (
                    <>
                      {formatInstantDate(l.expiresAt)}
                      {prazo && <span className="block text-[11px] text-fg-muted">{prazo}</span>}
                    </>
                  ) : (
                    <span className="text-fg-muted">não vence</span>
                  )}
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={SITUACAO_VARIANTE[situacao]}>{SITUACAO_LABEL[situacao]}</Badge>
                </td>
                <td className="py-2.5">
                  <AcoesDaLicenca
                    orgaos={orgaos}
                    licenca={{
                      id: l.id,
                      companyId: l.companyId,
                      empresaNome: l.empresaNome,
                      kind: l.kind,
                      organId: l.organId,
                      number: l.number,
                      issuedAt: campoDaData(l.issuedAt),
                      expiresAt: campoDaData(l.expiresAt),
                      notes: l.notes,
                      revogada: l.revokedAt !== null,
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
