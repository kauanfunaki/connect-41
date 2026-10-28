"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { IconButton } from "@/components/ui/IconButton";
import { MAXIMO_DE_PAGAMENTOS, type LinhaDoPagamento } from "@/lib/financeiro/baixa/pagamentosDoManual";

const VAZIA: LinhaDoPagamento = { data: "", valor: "", juros: "", multa: "", desconto: "" };

/**
 * "Já pago em" do lançamento manual, com o pagamento detalhado (lote 7,
 * 28/10/2026, pedido do BPO): juros, multa e desconto, e a baixa parcial em
 * mais de uma data. Só a data, como antes, é a baixa cheia. Os pagamentos vão
 * em JSON no campo `pagamentos`, e o servidor confere cada um contra o saldo.
 */
export function PagamentosDoManual({ kind, hojeISO }: { kind: "PAGAR" | "RECEBER"; hojeISO: string }) {
  const [linhas, setLinhas] = useState<LinhaDoPagamento[]>([{ ...VAZIA }]);
  const mudar = (i: number, campo: keyof LinhaDoPagamento, valor: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const primeira = linhas[0];
  const pago = kind === "PAGAR" ? "pago" : "recebido";
  // Sem nada além da data, o servidor faz a baixa cheia de antes.
  const detalhado = linhas.length > 1 || [primeira.valor, primeira.juros, primeira.multa, primeira.desconto].some((v) => v.trim() !== "");

  return (
    <>
      <CampoForm label={kind === "PAGAR" ? "Já pago em" : "Já recebido em"} htmlFor="lancamento-pago-em" helper="Deixe vazio se ainda está em aberto.">
        <CampoData id="lancamento-pago-em" name="pagoEm" max={hojeISO} value={primeira.data} onChange={(v) => mudar(0, "data", v)} />
      </CampoForm>
      <input type="hidden" name="pagamentos" value={primeira.data && detalhado ? JSON.stringify(linhas) : ""} />

      {primeira.data && (
        <div className="sm:col-span-2 lg:col-span-4 rounded-md border border-border-soft bg-surface-muted/40 p-3 flex flex-col gap-3">
          <p className="text-micro text-fg-muted">
            Valor {pago} em branco quita a conta. Para {kind === "PAGAR" ? "pagamento" : "recebimento"} parcial, informe o valor e acrescente os outros, cada um com a sua data.
          </p>
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
              {i > 0 ? (
                <CampoForm label={`Data do ${i + 1}º`} htmlFor={`pagamento-${i}-data`}>
                  <CampoData id={`pagamento-${i}-data`} max={hojeISO} value={l.data} onChange={(v) => mudar(i, "data", v)} />
                </CampoForm>
              ) : (
                <p className="text-ui text-fg-secondary self-center">1º {kind === "PAGAR" ? "pagamento" : "recebimento"}</p>
              )}
              <CampoForm label={`Valor ${pago}`} htmlFor={`pagamento-${i}-valor`}>
                <Input id={`pagamento-${i}-valor`} prefix="R$" inputMode="decimal" placeholder={i === 0 ? "o total" : "0,00"} value={l.valor} onChange={(e) => mudar(i, "valor", e.target.value)} />
              </CampoForm>
              <CampoForm label="Juros" htmlFor={`pagamento-${i}-juros`}>
                <Input id={`pagamento-${i}-juros`} prefix="R$" inputMode="decimal" placeholder="0,00" value={l.juros} onChange={(e) => mudar(i, "juros", e.target.value)} />
              </CampoForm>
              <CampoForm label="Multa" htmlFor={`pagamento-${i}-multa`}>
                <Input id={`pagamento-${i}-multa`} prefix="R$" inputMode="decimal" placeholder="0,00" value={l.multa} onChange={(e) => mudar(i, "multa", e.target.value)} />
              </CampoForm>
              <div className="flex items-end gap-1">
                <CampoForm label="Desconto" htmlFor={`pagamento-${i}-desconto`} className="flex-1">
                  <Input id={`pagamento-${i}-desconto`} prefix="R$" inputMode="decimal" placeholder="0,00" value={l.desconto} onChange={(e) => mudar(i, "desconto", e.target.value)} />
                </CampoForm>
                {i > 0 && (
                  <IconButton type="button" title="Tirar este pagamento" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </IconButton>
                )}
              </div>
            </div>
          ))}
          {linhas.length < MAXIMO_DE_PAGAMENTOS && (
            <div>
              <Button type="button" variant="ghost" size="xs" onClick={() => setLinhas((ls) => [...ls, { ...VAZIA }])}>
                <Plus size={12} /> Outro {kind === "PAGAR" ? "pagamento" : "recebimento"}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
