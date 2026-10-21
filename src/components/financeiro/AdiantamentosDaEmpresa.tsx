"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Lock, Plus } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatarReaisDeCentavos } from "@/lib/format";
import { dadosParaAdiantar, desfazerAdiantamento, registrarAdiantamento, type DadosParaAdiantar } from "@/lib/financeiro/adiantamentoAcoes";
import type { AdiantamentoLancado } from "@/lib/financeiro/adiantamentoServidor";
import type { SaldoDoAdiantamento } from "@/lib/financeiro/adiantamento";

const reais = (c: number) => formatarReaisDeCentavos(c);
const dataBr = (k: string) => k.split("-").reverse().join("/");

/**
 * Os adiantamentos da empresa (lote D, 20/10 — a conta de adiantamento do
 * Omie): o disponível de cada fornecedor (ou cliente), os lançados e o "Novo
 * adiantamento". Um bloco que começa fechado (a regra do Kauan, 08/10), com o
 * total disponível na linha.
 *
 * Usar o adiantamento é na baixa da conta: "Saiu da conta" oferece o
 * adiantamento de quem é a conta, com o disponível.
 */
export function AdiantamentosDaEmpresa({
  companyId,
  aPagar,
  saldos,
  lancados,
}: {
  companyId: string;
  aPagar: boolean;
  saldos: SaldoDoAdiantamento[];
  lancados: AdiantamentoLancado[];
}) {
  const [novo, setNovo] = useState(false);
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const total = saldos.reduce((s, x) => s + Math.max(0, x.saldoCentavos), 0);
  const titulo = aPagar ? "Adiantamentos a fornecedores" : "Adiantamentos de clientes";

  function desfazer(a: AdiantamentoLancado) {
    requestConfirm(
      {
        title: "Desfazer o adiantamento?",
        description: `O adiantamento de ${reais(a.centavos)} ${aPagar ? "a" : "de"} ${a.contraparteNome}, de ${dataBr(a.dataKey)}, sai — as duas pontas da transferência são canceladas.`,
        confirmLabel: "Desfazer",
        destructive: true,
      },
      async () => {
        const r = await desfazerAdiantamento(a.transferId);
        // O erro aparece no próprio diálogo, que fica aberto.
        if ("error" in r) throw new Error(r.error);
        toast.success("Adiantamento desfeito.");
      }
    );
  }

  return (
    <>
      <BlocoRecolhivel
        titulo={titulo}
        resumo={total > 0 ? `${reais(total)} disponível` : "Nenhum em aberto"}
        className="mb-4 bg-surface"
        espacoDaAcao="pr-48"
        acao={
          <Button size="xs" variant="secondary" onClick={() => setNovo(true)}>
            <Plus size={12} /> Novo adiantamento
          </Button>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <p className="text-helper text-fg-muted">
            {aPagar
              ? "O que se pagou ao fornecedor antes da conta. Quando a conta chegar, pague-a escolhendo o adiantamento em “Saiu da conta”: a despesa entra na DRE ali, e o banco não se mexe de novo."
              : "O que o cliente pagou antes da conta. Quando a conta a receber existir, receba-a escolhendo o adiantamento em “Entrou na conta”: a receita entra na DRE ali, e o banco não se mexe de novo."}
          </p>
          {saldos.length > 0 && (
            <ul className="flex flex-col divide-y divide-border-soft rounded-md border border-border">
              {saldos.map((s) => (
                <li key={s.contraparteId} className="flex items-center justify-between gap-3 px-3 py-2 text-fs-2">
                  <span className="min-w-0 truncate text-fg">{s.contraparteNome}</span>
                  <span className={`tabular-nums font-medium ${s.saldoCentavos < 0 ? "text-danger" : "text-fg"}`}>{reais(s.saldoCentavos)} disponível</span>
                </li>
              ))}
            </ul>
          )}
          {lancados.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-label font-semibold text-fg">Lançados</p>
              <ul className="flex flex-col divide-y divide-border-soft rounded-md border border-border">
                {lancados.map((a) => (
                  <li key={a.transferId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-fs-2">
                    <span className="min-w-0">
                      <span className="text-fg">{a.contraparteNome}</span>
                      <span className="block text-micro text-fg-muted">
                        {dataBr(a.dataKey)}
                        {a.contaDoBanco && ` · ${aPagar ? "saiu de" : "entrou em"} ${a.contaDoBanco}`}
                        {a.conciliado && " · conciliado"}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{reais(a.centavos)}</span>
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={a.conciliado}
                        title={a.conciliado ? "A ponta do banco já foi conciliada — desfaça a conciliação antes." : undefined}
                        onClick={() => desfazer(a)}
                      >
                        Desfazer
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </BlocoRecolhivel>
      {novo && <JanelaDoAdiantamento companyId={companyId} aPagar={aPagar} onFechar={() => setNovo(false)} onFeito={() => { setNovo(false); toast.success("Adiantamento registrado."); }} />}
      {dialog}
    </>
  );
}

function JanelaDoAdiantamento({ companyId, aPagar, onFechar, onFeito }: { companyId: string; aPagar: boolean; onFechar: () => void; onFeito: () => void }) {
  const id = useId();
  const [dados, setDados] = useState<DadosParaAdiantar | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    dadosParaAdiantar(companyId, aPagar ? "PAGAR" : "RECEBER").then((d) => vivo && setDados(d));
    return () => {
      vivo = false;
    };
  }, [companyId, aPagar]);

  return (
    <Modal open onClose={() => !pendente && onFechar()} title={aPagar ? "Novo adiantamento a fornecedor" : "Novo adiantamento de cliente"} maxWidth="max-w-xl">
      {dados === null ? (
        <p className="py-6 text-center text-fs-2 text-fg-muted">Carregando…</p>
      ) : !dados.ok ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao" icone={<Lock />}>
            {dados.erro}
          </Aviso>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await registrarAdiantamento(form);
              if ("error" in r) setErro(r.error);
              else onFeito();
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="kind" value={aPagar ? "PAGAR" : "RECEBER"} />
          <p className="text-helper text-fg-secondary">
            {aPagar
              ? "O dinheiro sai do banco agora e fica no adiantamento do fornecedor, até a conta dele chegar. Não entra na DRE: entra quando a conta for paga com ele."
              : "O dinheiro entrou no banco e fica no adiantamento do cliente, até a conta a receber dele existir. Não entra na DRE: entra quando a conta for recebida com ele."}
          </p>
          <FieldGrid>
            <CampoForm label={aPagar ? "Fornecedor" : "Cliente"} htmlFor={`${id}-contraparte`} required>
              <Select id={`${id}-contraparte`} name="counterpartyId" defaultValue="" required>
                <option value="" disabled>
                  Escolha…
                </option>
                {dados.contrapartes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Valor" htmlFor={`${id}-valor`} required>
              <Input id={`${id}-valor`} name="valor" prefix="R$" inputMode="decimal" placeholder="1.234,56" required />
            </CampoForm>
            <CampoForm label={aPagar ? "Pago em" : "Recebido em"} htmlFor={`${id}-data`} required>
              <CampoData id={`${id}-data`} name="data" defaultValue={dados.hojeKey} max={dados.hojeKey} required />
            </CampoForm>
            <CampoForm
              label={aPagar ? "Saiu da conta" : "Entrou na conta"}
              htmlFor={`${id}-conta`}
              required
              helper={dados.contas.length === 0 ? "Nenhuma conta bancária cadastrada nesta empresa (Banco e caixa)." : "A conciliação casa esta saída com a linha do extrato."}
            >
              <Select
                id={`${id}-conta`}
                name="contaBancariaId"
                defaultValue={dados.contas.length === 1 ? dados.contas[0]!.id : ""}
                disabled={dados.contas.length === 0}
                required
              >
                <option value="" disabled>
                  Escolha…
                </option>
                {dados.contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>
          <CampoForm label="Observação" htmlFor={`${id}-obs`}>
            <Input id={`${id}-obs`} name="observacao" maxLength={120} placeholder="Ex.: sinal do pedido 123" />
          </CampoForm>
          <FormFooter pending={pendente} submitLabel="Registrar adiantamento" pendingLabel="Registrando…" onCancel={onFechar} erro={erro} />
        </form>
      )}
    </Modal>
  );
}
