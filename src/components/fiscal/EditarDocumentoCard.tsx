"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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
  const [confirmando, setConfirmando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState<string | null>(null);

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
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
        >
          {aberto ? "Fechar" : "Editar"}
        </button>
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

            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar correção"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border">
            {erroExclusao && (
              <p className="text-[13px] text-danger mb-2">{erroExclusao}</p>
            )}
            {confirmando ? (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-fg">Excluir este documento do acervo?</span>
                <button
                  type="button"
                  onClick={async () => {
                    const r = await excluir();
                    if ("error" in r) {
                      setErroExclusao(r.error);
                      setConfirmando(false);
                    }
                  }}
                  className="h-8 px-3 rounded-md bg-danger text-on-danger text-[12px] font-medium hover:opacity-90 transition-opacity"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="text-[12px] text-danger hover:underline"
              >
                Excluir documento do acervo
              </button>
            )}
            <p className="text-[12px] text-fg-muted mt-2">
              Some da lista e some do portal do cliente. O mesmo XML pode ser reimportado depois.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
