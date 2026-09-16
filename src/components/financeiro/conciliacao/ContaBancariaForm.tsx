"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/useConfirm";
import { salvarContaBancaria, alterarContaAtiva } from "@/app/(app)/conciliacao/actions";

export type ContaParaEditar = {
  id: string;
  nickname: string;
  bankCode: string;
  agency: string | null;
  accountNumber: string;
  type: "CORRENTE" | "POUPANCA";
  /** Já no formato de digitação ("-1234,56"), ou vazio. */
  saldoInicial: string;
  saldoInicialKey: string;
  active: boolean;
  temTransacoes: boolean;
};

/**
 * Cadastro e edição de conta bancária num modal.
 *
 * Um só componente para os dois casos porque os campos são os mesmos; o que
 * muda é que, com extrato importado, banco e número ficam travados — a action
 * recusaria de qualquer jeito, e campo que aceita e depois recusa é pior que
 * campo travado com o motivo embaixo.
 */
export function ContaBancariaForm({ companyId, conta }: { companyId: string; conta?: ContaParaEditar }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const travado = Boolean(conta?.temTransacoes);
  const prefixo = conta ? `conta-${conta.id}` : "conta-nova";

  return (
    <>
      {conta ? (
        <Button variant="linkMuted" className="text-[11px]" onClick={() => setAberto(true)}>
          Editar
        </Button>
      ) : (
        <Button size="sm" onClick={() => setAberto(true)}>
          <Plus size={13} /> Nova conta
        </Button>
      )}
      <Modal open={aberto} onClose={() => setAberto(false)} title={conta ? "Editar conta bancária" : "Nova conta bancária"} maxWidth="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await salvarContaBancaria(dados);
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <input type="hidden" name="companyId" value={companyId} />
          {conta && <input type="hidden" name="id" value={conta.id} />}

          <CampoForm label="Nome da conta" htmlFor={`${prefixo}-nickname`} required helper="Como a equipe chama esta conta — ex.: Itaú movimento.">
            <Input id={`${prefixo}-nickname`} name="nickname" maxLength={80} defaultValue={conta?.nickname} required />
          </CampoForm>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CampoForm label="Banco (COMPE)" htmlFor={`${prefixo}-bank`} required helper="001, 237, 341…">
              <Input id={`${prefixo}-bank`} name="bankCode" inputMode="numeric" maxLength={4} defaultValue={conta?.bankCode} readOnly={travado} required />
            </CampoForm>
            <CampoForm label="Agência" htmlFor={`${prefixo}-agency`}>
              <Input id={`${prefixo}-agency`} name="agency" inputMode="numeric" maxLength={10} defaultValue={conta?.agency ?? ""} />
            </CampoForm>
            <CampoForm label="Conta com dígito" htmlFor={`${prefixo}-number`} required>
              <Input id={`${prefixo}-number`} name="accountNumber" maxLength={30} placeholder="12345-6" defaultValue={conta?.accountNumber} readOnly={travado} required />
            </CampoForm>
          </div>
          {travado && (
            <p className="text-[11px] text-fg-muted -mt-2">
              Banco e número não mudam depois do primeiro extrato importado: são eles que conferem o arquivo.
            </p>
          )}

          <CampoForm label="Tipo" htmlFor={`${prefixo}-type`} required>
            <Select id={`${prefixo}-type`} name="type" defaultValue={conta?.type ?? "CORRENTE"}>
              <option value="CORRENTE">Conta corrente</option>
              <option value="POUPANCA">Poupança</option>
            </Select>
          </CampoForm>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoForm
              label="Saldo inicial (R$)"
              htmlFor={`${prefixo}-saldo`}
              helper="Opcional. Negativo se começou no cheque especial."
            >
              <Input id={`${prefixo}-saldo`} name="openingBalance" inputMode="decimal" placeholder="-1.234,56" defaultValue={conta?.saldoInicial ?? ""} />
            </CampoForm>
            <CampoForm label="Saldo no início do dia" htmlFor={`${prefixo}-saldo-data`} helper="O extrato é somado a partir desta data, inclusive.">
              <Input id={`${prefixo}-saldo-data`} type="date" name="openingBalanceDate" defaultValue={conta?.saldoInicialKey ?? ""} />
            </CampoForm>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AlternarContaAtiva({ bankAccountId, ativa }: { bankAccountId: string; ativa: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <Button
        variant="linkMuted"
        className="text-[11px]"
        onClick={() =>
          requestConfirm(
            ativa
              ? {
                  title: "Inativar esta conta?",
                  description: "Ela deixa de aceitar extrato novo. O histórico importado e as conciliações ficam como estão.",
                  confirmLabel: "Inativar",
                  destructive: true,
                }
              : { title: "Reativar esta conta?", confirmLabel: "Reativar" },
            async () => {
              const r = await alterarContaAtiva(bankAccountId, !ativa);
              if ("error" in r) throw new Error(r.error);
            }
          )
        }
      >
        {ativa ? "Inativar" : "Reativar"}
      </Button>
      {dialog}
    </>
  );
}
