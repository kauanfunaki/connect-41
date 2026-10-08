"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { SalaryChangeState } from "@/app/(app)/pessoas/[id]/salario/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { TabelaNoDesktop, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
// Reais e percentual em pt-BR: o decimal do banco chegava cru ("R$ 3500.5",
// "12.5%"). Troca por `formatarReais` de lib/format.ts quando a base o criar
// (auditoria DRG-01, 07/10/2026).
import { formatarReais, formatarNumero } from "@/lib/format";
import { Aviso } from "@/components/ui/Aviso";

export type SalaryChangeItem = {
  id: string;
  previousSalary: string | null;
  newSalary: string;
  changePercent: string | null;
  cargoName: string | null;
  reason: string | null;
  effectiveDateLabel: string;
};

type CargoOption = { id: string; name: string };

type Props = {
  action: (prev: SalaryChangeState, form: FormData) => Promise<SalaryChangeState>;
  history: SalaryChangeItem[];
  cargos: CargoOption[];
};

export function SalaryHistorySection({ action, history, cargos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  const variacao = (h: SalaryChangeItem) =>
    h.changePercent ? (
      <span className={Number(h.changePercent) >= 0 ? "text-success-fg" : "text-danger"}>
        {Number(h.changePercent) >= 0 ? "+" : ""}
        {formatarNumero(Number(h.changePercent), 2)}%
      </span>
    ) : null;

  return (
    <Card className="p-5 mb-4">
      {/* Título de cartão no token de cartão — era o de seção, 18px (DRG-10). */}
      <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Histórico Salarial</h2>

      {history.length === 0 ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">Nenhum reajuste registrado ainda.</p>
      ) : (
        <>
          {/* No celular, uma linha por reajuste em vez da tabela de 640px com
              rolagem lateral (auditoria DRG-31, 07/10/2026). Já dentro do
              cartão, então linhas com divisória, sem cartão em cada uma. */}
          <ul className="md:hidden divide-y divide-border border-y border-border mb-4">
            {history.map((h) => (
              <li key={h.id} className="py-2.5">
                <TopoDoCartao nome={h.effectiveDateLabel} valor={formatarReais(Number(h.newSalary))} />
                <InfoDoCartao>
                  {h.previousSalary && <>antes {formatarReais(Number(h.previousSalary))} </>}
                  {variacao(h)}
                  {h.cargoName && <> · {h.cargoName}</>}
                </InfoDoCartao>
                {h.reason && <InfoDoCartao>{h.reason}</InfoDoCartao>}
              </li>
            ))}
          </ul>
          {/* Era uma lista de linhas (até 30/09); virou tabela no casco padrão.
              Sem funil: data e valores são únicos por linha — filtro não ajuda. */}
          <TabelaNoDesktop className="c41-tabela rounded-lg border border-border mb-4">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3">Vigência</th>
                  <th className="px-4 py-3">Salário</th>
                  <th className="px-4 py-3">Variação</th>
                  <th className="px-4 py-3">Novo cargo</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border">
                    <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{h.effectiveDateLabel}</td>
                    <td className="px-4 py-3 text-fg whitespace-nowrap">
                      {h.previousSalary ? <span className="text-fg-muted">{formatarReais(Number(h.previousSalary))} → </span> : ""}{formatarReais(Number(h.newSalary))}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{variacao(h) ?? <span className="text-fg-muted">—</span>}</td>
                    <td className="px-4 py-3 text-fg-secondary">{h.cargoName ?? <span className="text-fg-muted">—</span>}</td>
                    <td className="px-4 py-3 text-fg-muted">
                      <span className="block max-w-[260px] truncate" title={h.reason ?? undefined}>
                        {h.reason ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </>
      )}

      {/* Revisão de alinhamento (30/09): era uma fileira `items-end` de
          larguras soltas, que quebrava em lugares diferentes conforme a tela,
          e o rótulo "Novo Cargo (promoção)" não cabia na coluna. Agora é a
          grade dos formulários da ficha, com o botão alinhado ao campo. */}
      <form action={formAction} className="border-t border-border pt-5">
        <FieldGrid columns="sm:grid-cols-2 xl:grid-cols-[180px_180px_minmax(0,240px)_minmax(0,1fr)_auto]">
          <CampoForm label="Novo Salário" htmlFor="newSalary" required>
            <Input id="newSalary" name="newSalary" type="number" step="0.01" required prefix="R$" placeholder="0,00" />
          </CampoForm>
          <CampoForm label="Data do Reajuste" htmlFor="effectiveDate" required>
            <CampoData id="effectiveDate" name="effectiveDate" required />
          </CampoForm>
          <CampoForm label="Novo cargo" htmlFor="cargoId" helper="Só em promoção.">
            <Select id="cargoId" name="cargoId" defaultValue="">
              <option value="">Sem alteração</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
          <AlinhadoAoCampo>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando…" : "Registrar Reajuste"}
            </Button>
          </AlinhadoAoCampo>
        </FieldGrid>
      </form>
      {state?.error && (
        <Aviso className="mt-3">
          {state.error}
        </Aviso>
      )}
    </Card>
  );
}
