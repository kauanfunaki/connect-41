"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { DeleteButton } from "@/components/ui/DeleteButton";
import type { EdicaoState } from "@/app/(app)/documentos-fiscais/[id]/editar";

type Empresa = { id: string; nome: string };

type Props = {
  documentoId: string;
  acao: (prev: EdicaoState, form: FormData) => Promise<EdicaoState>;
  excluir: () => Promise<{ error: string } | { ok: true }>;
  empresas: Empresa[];
  /** Documento com lançamento não se edita: a ficha explica por quê. */
  bloqueado: boolean;
  /** Já formatado no servidor — evita divergência de hidratação e o lint de data crua. */
  editadoEm: string | null;
  valores: {
    companyId: string;
    number: string;
    series: string | null;
    issuerName: string;
    recipientName: string | null;
    amount: string | null;
    issuedAt: string;
    competence: string;
  };
};

export function EditarDocumentoCard({
  documentoId,
  acao,
  excluir,
  empresas,
  bloqueado,
  editadoEm,
  valores,
}: Props) {
  const [state, formAction, isPending] = useActionState(acao, null);
  const [aberto, setAberto] = useState(false);

  if (bloqueado) {
    return (
      <Card className="p-5 mt-4">
        <h2 className="text-[length:var(--fs-ui)] font-medium text-fg mb-1">Corrigir documento</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted">
          Este documento já virou lançamento. Estorne antes de corrigir ou excluir — assim o
          financeiro não fica com valor diferente do da nota.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 mt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[length:var(--fs-ui)] font-medium text-fg mb-1">Corrigir documento</h2>
          <p className="text-[length:var(--fs-helper)] text-fg-muted">
            {editadoEm
              ? `Corrigido à mão em ${editadoEm}. O que o XML dizia está na auditoria.`
              : "O XML é a fonte. Corrigir aqui faz o acervo divergir dele, e a mudança fica registrada na auditoria."}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAberto((v) => !v)} className="flex-shrink-0">
          {aberto ? "Fechar" : "Editar"}
        </Button>
      </div>

      {aberto && (
        <>
          <form action={formAction} className="mt-5 space-y-4">
            <input type="hidden" name="id" value={documentoId} />

            {state && "error" in state && (
              <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
                {state.error}
              </p>
            )}
            {state && "ok" in state && (
              <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
                Correção salva.
              </p>
            )}

            <CampoForm label="Empresa" htmlFor="companyId">
              <Select id="companyId" name="companyId" defaultValue={valores.companyId}>
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </Select>
            </CampoForm>

            <div className="grid grid-cols-2 gap-3">
              <CampoForm label="Número" htmlFor="number" required>
                <Input id="number" name="number" defaultValue={valores.number} required />
              </CampoForm>
              <CampoForm label="Série" htmlFor="series">
                <Input id="series" name="series" defaultValue={valores.series ?? ""} />
              </CampoForm>
            </div>

            <CampoForm label="Emitente" htmlFor="issuerName" required>
              <Input id="issuerName" name="issuerName" defaultValue={valores.issuerName} required />
            </CampoForm>

            <CampoForm label="Destinatário" htmlFor="recipientName">
              <Input
                id="recipientName"
                name="recipientName"
                defaultValue={valores.recipientName ?? ""}
              />
            </CampoForm>

            <div className="grid grid-cols-2 gap-3">
              <CampoForm label="Valor" htmlFor="amount">
                <Input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={valores.amount ?? ""}
                  placeholder="1234,56"
                />
              </CampoForm>
              <CampoForm label="Emissão" htmlFor="issuedAt">
                <Input id="issuedAt" name="issuedAt" type="date" defaultValue={valores.issuedAt} />
              </CampoForm>
            </div>

            <CampoForm label="Competência" htmlFor="competence">
              <Input
                id="competence"
                name="competence"
                defaultValue={valores.competence}
                placeholder="AAAA-MM"
              />
            </CampoForm>
            <p className="text-[12px] text-fg-muted -mt-3">
              Em branco, volta a seguir a data de emissão.
            </p>

            {/* `loading` já troca o rótulo por "Salvando…" e desabilita — era o
                que o ternário fazia à mão. */}
            <Button type="submit" variant="primary" loading={isPending}>
              Salvar correção
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border">
            {/* Era um fluxo de confirmação escrito à mão — dois estados, dois
                botões e a mensagem de erro. O `DeleteButton` já faz os três,
                com diálogo temático e o erro dentro dele em vez de solto na
                página. Adaptador de uma linha porque ele espera
                `{ error } | null | void` e a action devolve `{ ok: true }`. */}
            <DeleteButton
              action={async () => {
                const r = await excluir();
                return "error" in r ? { error: r.error } : null;
              }}
              nome="este documento"
              label="Excluir documento do acervo"
              description="Some da lista e do portal do cliente. O mesmo XML pode ser reimportado depois."
            />
          </div>
        </>
      )}
    </Card>
  );
}
