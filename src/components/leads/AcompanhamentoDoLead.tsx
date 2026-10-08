"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { salvarAcompanhamentoDoLead } from "@/app/(app)/leads/actions";
import { MAX_OBSERVACOES_DO_LEAD, ROTULO_DO_STATUS, STATUS_DO_LEAD } from "@/lib/leads/regras";
import type { LeadStatus } from "@/generated/prisma/enums";

/**
 * Situação, responsável e observações do lead, num salvar só (05/10/2026).
 *
 * `onSubmit` com `preventDefault`, e não `action`: com `action` o React limpa
 * o formulário ao terminar, e quem errou um campo perderia as observações que
 * acabou de escrever.
 */
export function AcompanhamentoDoLead({
  id,
  versao,
  status,
  responsavelId,
  observacoes,
  responsaveis,
}: {
  id: string;
  /** `updatedAt` do lead que a tela mostra — a ação recusa salvar por cima de outra mudança. */
  versao: string;
  status: LeadStatus;
  responsavelId: string | null;
  observacoes: string | null;
  responsaveis: { id: string; name: string }[];
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setSalvo(false);
        startTransition(async () => {
          const r = await salvarAcompanhamentoDoLead(id, dados);
          if ("error" in r) {
            setErro(r.error);
            return;
          }
          setErro(null);
          setSalvo(true);
        });
      }}
    >
      <input type="hidden" name="versao" value={versao} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Situação" htmlFor={`lead-status-${id}`} required>
          <Select id={`lead-status-${id}`} name="status" defaultValue={status} onChange={() => setSalvo(false)}>
            {STATUS_DO_LEAD.map((s) => (
              <option key={s} value={s}>
                {ROTULO_DO_STATUS[s]}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Responsável" htmlFor={`lead-responsavel-${id}`} helper="Quem do setor faz o contato.">
          <Select id={`lead-responsavel-${id}`} name="responsavel" defaultValue={responsavelId ?? ""} onChange={() => setSalvo(false)}>
            <option value="">Sem responsável</option>
            {responsaveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </CampoForm>
      </div>
      <CampoForm label="Observações" htmlFor={`lead-observacoes-${id}`} helper="Só a equipe vê. O que foi conversado, o que ficou combinado, por que foi descartado.">
        <Textarea
          id={`lead-observacoes-${id}`}
          name="observacoes"
          rows={5}
          maxLength={MAX_OBSERVACOES_DO_LEAD}
          defaultValue={observacoes ?? ""}
          onChange={() => setSalvo(false)}
        />
      </CampoForm>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="text-[length:var(--fs-2)] text-danger">{erro}</span>}
        {salvo && !erro && <span className="text-[length:var(--fs-2)] text-success-fg">Salvo.</span>}
        <Button type="submit" loading={pendente}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
