"use client";

import { useActionState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { Select } from "@/components/ui/Select";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import type { MeetingState } from "@/app/(app)/agenda/actions";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";

type UserOption = { id: string; name: string };
type CompanyOption = EmpresaParaEscolher & { name: string };

type Props = {
  action: (prev: MeetingState, form: FormData) => Promise<MeetingState>;
  initialStart: string; // "YYYY-MM-DDTHH:mm"
  initialEnd: string;
  hasGoogle: boolean;
  hasMicrosoft: boolean;
  allUsers: UserOption[];
  companies: CompanyOption[];
  onClose: () => void;
};

// Modal de criação — mesmos campos do form dentro do item de Kanban
// (MeetingsSection), mas sem vínculo com pipelineItemId: reunião é criada
// direto pela Agenda. Componente remonta a cada abertura (o pai só o
// renderiza quando open=true), então defaultValue reflete sempre o slot
// clicado mais recente sem precisar de estado controlado.
//
// No `Modal` e com o `FormFooter` (07/10/2026): era uma janela escrita à mão,
// com fundo, título e "X" diferentes dos outros modais e sem o portal.
export function CreateMeetingDialog({ action, initialStart, initialEnd, hasGoogle, hasMicrosoft, allUsers, companies, onClose }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const hasAnyProvider = hasGoogle || hasMicrosoft;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, state]);

  // Fechar (Esc, clique fora, "X") espera o envio terminar.
  const handleClose = useCallback(() => {
    if (!isPending) onClose();
  }, [isPending, onClose]);

  return (
    <Modal open onClose={handleClose} title="Nova reunião">
      {!hasAnyProvider ? (
        // Revisão de 05/10: botão não é link — o destino era texto azul no meio da frase.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <p className="text-[length:var(--fs-body)] text-fg-muted">Conecte sua conta Google ou Microsoft antes de agendar.</p>
          <Button href="/admin/integracoes" variant="secondary" size="sm">
            Abrir Integrações
          </Button>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <CampoForm label="Título" htmlFor="title" required>
            <Input id="title" name="title" required placeholder="Ex: Alinhamento semanal" />
          </CampoForm>

          <div className="grid grid-cols-1 gap-3">
            <CampoForm label="Início" htmlFor="startAt" required>
              <CampoDataHora id="startAt" name="startAt" required defaultValue={initialStart} />
            </CampoForm>
            <CampoForm label="Fim" htmlFor="endAt" required>
              <CampoDataHora id="endAt" name="endAt" required defaultValue={initialEnd} />
            </CampoForm>
          </div>

          <CampoForm label="Provedor" htmlFor="provider" required>
            <Select id="provider" name="provider" required>
              {hasGoogle && <option value="GOOGLE">Google Meet</option>}
              {hasMicrosoft && <option value="MICROSOFT">Microsoft Teams</option>}
            </Select>
          </CampoForm>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <CampoForm label="Empresa" htmlFor="companyId">
              <SearchableSelect
                id="companyId"
                name="companyId"
                options={opcoesDeEmpresa(companies)}
                avatar
                lembrarRecentes="empresas"
                vazioLabel="Nenhuma"
                placeholder="Buscar empresa…"
              />
            </CampoForm>
            <CampoForm label="Cliente(s)" htmlFor="clientName" helper="Separe por vírgula, se houver mais de um">
              <Input id="clientName" name="clientName" placeholder="Ex: Bruno, Maria" />
            </CampoForm>
          </div>

          <AttendeePicker users={allUsers} />

          <FormFooter
            pending={isPending}
            submitLabel="Agendar"
            pendingLabel="Agendando…"
            onCancel={onClose}
            erro={state?.error}
          />
        </form>
      )}
    </Modal>
  );
}
