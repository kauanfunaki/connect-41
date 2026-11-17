"use client";

import { useState, useTransition } from "react";
import { Plus, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/useConfirm";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { salvarContaBancaria, alterarContaAtiva } from "@/app/(app)/conciliacao/actions";
import { FormFooter } from "@/components/ui/FormFooter";
import { ajudaDoTipo, grupoDoTipo, TIPOS_DE_CONTA, TIPOS_DO_CADASTRO, type GrupoDaConta, type TipoDeConta } from "@/lib/financeiro/tiposDeConta";
import { BANCO_SEM_EXTRATO } from "@/lib/financeiro/conciliacao/conta";

/** O seletor de tipo em grupos (lote D, 20/10 — os tipos do Omie): o grupo diz o que a conta faz. */
const GRUPOS: { grupo: GrupoDaConta; rotulo: string }[] = [
  { grupo: "banco", rotulo: "Com extrato" },
  { grupo: "caixa", rotulo: "Dinheiro sem extrato" },
  { grupo: "fora", rotulo: "Fora do caixa" },
];

export type ContaParaEditar = {
  id: string;
  nickname: string;
  bankCode: string;
  agency: string | null;
  accountNumber: string;
  type: TipoDeConta;
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
 * campo travado com o motivo no cadeado.
 */
export function ContaBancariaForm({ companyId, conta }: { companyId: string; conta?: ContaParaEditar }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const travado = Boolean(conta?.temTransacoes);
  // O motivo no cadeado de cada campo travado, no lugar da frase embaixo da
  // linha (17/11/2026, melhoria-707).
  const motivoDaTrava = travado ? "Não muda depois do primeiro extrato importado: é o que confere o arquivo." : undefined;
  const prefixo = conta ? `conta-${conta.id}` : "conta-nova";
  const [tipo, setTipo] = useState<TipoDeConta>(conta?.type ?? "CORRENTE");
  // Sem extrato, banco e número não conferem arquivo nenhum: ficam opcionais.
  const comExtrato = grupoDoTipo(tipo) === "banco";

  return (
    <>
      {conta ? (
        <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>
          Editar
        </Button>
      ) : (
        // No cabeçalho da tela, no tamanho dos outros botões de criar (5A, 08/10/2026).
        <Button onClick={() => setAberto(true)}>
          <Plus size={14} /> Nova conta
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

          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_180px]">
            <CampoForm label="Nome da conta" htmlFor={`${prefixo}-nickname`} required dica="Como a equipe chama esta conta.">
              <Input id={`${prefixo}-nickname`} name="nickname" maxLength={80} placeholder="Ex.: Itaú movimento" defaultValue={conta?.nickname} required />
            </CampoForm>
            <CampoForm label="Tipo" htmlFor={`${prefixo}-type`} required dica={ajudaDoTipo(tipo) ?? undefined} travado={motivoDaTrava}>
              <Select id={`${prefixo}-type`} name="type" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeConta)} disabled={travado}>
                {GRUPOS.map((g) => (
                  <optgroup key={g.grupo} label={g.rotulo}>
                    {TIPOS_DO_CADASTRO.filter((t) => TIPOS_DE_CONTA[t].grupo === g.grupo).map((t) => (
                      <option key={t} value={t}>
                        {TIPOS_DE_CONTA[t].rotulo}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              {/* O select desabilitado não vai no formulário. */}
              {travado && <input type="hidden" name="type" value={tipo} />}
            </CampoForm>
          </FieldGrid>

          {/* Banco e agência são números curtos: coluna estreita, e a conta
              fica com o resto. */}
          <div className="flex flex-col gap-2">
            <FieldGrid columns="sm:grid-cols-[120px_140px_minmax(0,1fr)]">
              <CampoForm label="Banco (COMPE)" htmlFor={`${prefixo}-bank`} required={comExtrato} travado={motivoDaTrava}>
                <Input
                  id={`${prefixo}-bank`}
                  name="bankCode"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={comExtrato ? "001" : ""}
                  defaultValue={conta && conta.bankCode !== BANCO_SEM_EXTRATO ? conta.bankCode : ""}
                  readOnly={travado}
                  required={comExtrato}
                />
              </CampoForm>
              <CampoForm label="Agência" htmlFor={`${prefixo}-agency`}>
                <Input id={`${prefixo}-agency`} name="agency" inputMode="numeric" maxLength={10} defaultValue={conta?.agency ?? ""} />
              </CampoForm>
              <CampoForm label={comExtrato ? "Conta com dígito" : "Número"} htmlFor={`${prefixo}-number`} required={comExtrato} travado={motivoDaTrava}>
                <Input
                  id={`${prefixo}-number`}
                  name="accountNumber"
                  maxLength={30}
                  placeholder={comExtrato ? "12345-6" : ""}
                  defaultValue={conta?.accountNumber}
                  readOnly={travado}
                  required={comExtrato}
                />
              </CampoForm>
            </FieldGrid>
          </div>

          <FieldGrid>
            <CampoForm label="Saldo inicial" htmlFor={`${prefixo}-saldo`} dica="Negativo se começou no cheque especial.">
              <Input id={`${prefixo}-saldo`} name="openingBalance" prefix="R$" inputMode="decimal" placeholder="-1.234,56" defaultValue={conta?.saldoInicial ?? ""} />
            </CampoForm>
            <CampoForm label="Data do saldo inicial" htmlFor={`${prefixo}-saldo-data`} dica="O dia ao qual o saldo inicial se refere, antes das movimentações. O extrato é somado a partir desse dia, inclusive.">
              <CampoData id={`${prefixo}-saldo-data`} name="openingBalanceDate" defaultValue={conta?.saldoInicialKey ?? ""} />
            </CampoForm>
          </FieldGrid>

          <FormFooter
            pending={pendente}
            onCancel={() => setAberto(false)}
            erro={erro}
          />
        </form>
      </Modal>
    </>
  );
}

/**
 * Inativar ou reativar a conta, no menu "⋯" ao lado do "Editar" (08/10/2026) —
 * a regra de 30/09 (`AcoesDeLinha`): o que tira da operação fica longe de um
 * clique acidental. Os dois botões ficavam lado a lado, "Editar | Inativar".
 */
export function AlternarContaAtiva({ bankAccountId, ativa }: { bankAccountId: string; ativa: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <MenuDeMaisAcoes rotulo="Mais ações" aria-label="Ações da conta bancária" width={200}>
        {({ close }) => (
          <ItemDoMenu
            icone={ativa ? <PowerOff /> : <Power />}
            danger={ativa}
            onClick={() => {
              close();
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
              );
            }}
          >
            {ativa ? "Inativar conta" : "Reativar conta"}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </>
  );
}
