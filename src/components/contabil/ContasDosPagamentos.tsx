"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { CONTAS_DO_MOTOR, type ContasDosPagamentos as Contas } from "@/lib/contabil/pagamentos";
import { salvarContasDosPagamentos, type ResultadoDosPagamentos } from "@/app/(app)/sped-contabil/pagamentos-actions";

type Chave = keyof Contas;
const GRUPOS: { titulo: string; ajuda: string; campos: [Chave, string][] }[] = [
  { titulo: "Motorista (contrato ou recibo)", ajuda: "Todos na conta coletiva. Histórico: código + nº do contrato (000 sem) + nome.", campos: [["motoristaDebito", "Débito"], ["motoristaCredito", "Crédito"], ["motoristaHistorico", "Histórico"]] },
  { titulo: "Fatura de aluguel de veículo", ajuda: "O crédito é a conta do fornecedor (a locadora).", campos: [["veiculoDebito", "Débito"], ["veiculoHistorico", "Histórico"]] },
  { titulo: "Aluguel de imóvel", ajuda: "O crédito é a conta do locador.", campos: [["imovelDebito", "Débito"], ["imovelHistorico", "Histórico"]] },
  { titulo: "RPA: a folha dos autônomos do mês", ajuda: "Um lançamento por crédito, no último dia do mês, contra o débito do bruto. O líquido é o bruto menos as retenções.", campos: [["rpaDebito", "Débito (bruto)"], ["rpaIss", "ISS"], ["rpaIssHistorico", "Histórico do ISS"], ["rpaInss", "INSS"], ["rpaInssHistorico", "Histórico do INSS"], ["rpaSest", "SEST/SENAT"], ["rpaSestHistorico", "Histórico do SEST/SENAT"], ["rpaLiquido", "Líquido"], ["rpaLiquidoHistorico", "Histórico do líquido"]] },
];

/**
 * As contas dos lançamentos-modelo dos pagamentos sem nota (03/11/2026), em
 * Plano e contas. Vêm preenchidas com os códigos do motor e valem até a
 * empresa gravar outros; em branco, a categoria fica pendente.
 */
export function ContasDosPagamentos({ empresaId, contas, gravadas, podeAgir }: { empresaId: string; contas: Contas; gravadas: Chave[]; podeAgir: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [valores, setValores] = useState<Contas>(contas);
  const depois = (r: ResultadoDosPagamentos) => { if (r.ok) { toast.success(r.mensagem); router.refresh(); } else toast.error(r.erro); };
  const doMotor = gravadas.length === 0;
  return (
    <Card className="p-5">
      <h3 className="text-card-title font-semibold text-fg">Contas dos pagamentos sem nota</h3>
      <p className="mt-1 mb-4 text-label text-fg-secondary">
        Os lançamentos-modelo do contábil, que vencem a regra da categoria. {doMotor ? "Estão com os códigos do motor; grave para usar outros." : "Gravadas para esta empresa."} Em branco, os pagamentos da categoria ficam pendentes.
      </p>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); iniciar(async () => depois(await salvarContasDosPagamentos({ empresa: empresaId, contas: valores }))); }}>
        {GRUPOS.map((g) => (
          <fieldset key={g.titulo} className="space-y-2">
            <legend className="text-label font-medium text-fg">{g.titulo}</legend>
            <p className="text-helper text-fg-muted">{g.ajuda}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {g.campos.map(([chave, rotulo]) => (
                <CampoForm key={chave} label={rotulo} htmlFor={`pagamento-${chave}`} helper={valores[chave] !== CONTAS_DO_MOTOR[chave] ? `No motor: ${CONTAS_DO_MOTOR[chave]}` : undefined}>
                  <Input id={`pagamento-${chave}`} compact disabled={!podeAgir} inputMode="numeric" maxLength={10} value={valores[chave]} onChange={(e) => setValores((v) => ({ ...v, [chave]: e.target.value.replace(/\D/g, "") }))} />
                </CampoForm>
              ))}
            </div>
          </fieldset>
        ))}
        {podeAgir && <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pendente}>Salvar contas dos pagamentos</Button>
          {!doMotor && <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => { const r = await salvarContasDosPagamentos({ empresa: empresaId, restaurar: true }); depois(r); if (r.ok) setValores(CONTAS_DO_MOTOR); })}>Voltar aos códigos do motor</Button>}
        </div>}
      </form>
    </Card>
  );
}
