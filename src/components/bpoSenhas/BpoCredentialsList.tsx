"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, KeyRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { BpoCredencialState } from "@/app/(app)/bpo-senhas/actions";

export type CredentialRow = {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  username: string | null;
  url: string | null;
  notes: string | null;
  createdByName: string;
  createdAtLabel: string;
};

type CompanyOption = { id: string; name: string };

type Props = {
  credentials: CredentialRow[];
  companies: CompanyOption[];
  canManage: boolean;
  createAction: (prev: BpoCredencialState, form: FormData) => Promise<BpoCredencialState>;
  updateAction: (id: string, prev: BpoCredencialState, form: FormData) => Promise<BpoCredencialState>;
  deleteAction: (id: string) => Promise<void>;
  revealAction: (id: string) => Promise<{ error: string } | { password: string }>;
};

function CredentialFormFields({ companies, defaults }: { companies: CompanyOption[]; defaults?: Partial<CredentialRow> }) {
  return (
    <div className="space-y-3">
      <CampoForm label="Título" htmlFor="title" required>
        <Input id="title" name="title" required defaultValue={defaults?.title} placeholder="Ex: e-CAC, Simples Nacional, Banco Inter" />
      </CampoForm>
      <CampoForm label="Empresa" htmlFor="companyId" helper="Deixe em branco para uma credencial geral do setor.">
        <Select id="companyId" name="companyId" defaultValue={defaults?.companyId ?? ""}>
          <option value="">Geral (sem empresa)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </CampoForm>
      <CampoForm label="Usuário" htmlFor="username">
        <Input id="username" name="username" defaultValue={defaults?.username ?? ""} />
      </CampoForm>
      <CampoForm
        label="Senha"
        htmlFor="password"
        required={!defaults}
        helper={defaults ? "Deixe em branco para manter a senha atual." : undefined}
      >
        <Input id="password" name="password" type="password" required={!defaults} autoComplete="new-password" />
      </CampoForm>
      <CampoForm label="URL" htmlFor="url">
        <Input id="url" name="url" type="url" defaultValue={defaults?.url ?? ""} placeholder="https://…" />
      </CampoForm>
      <CampoForm label="Notas" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </CampoForm>
    </div>
  );
}

function NewCredentialModal({ companies, createAction }: { companies: CompanyOption[]; createAction: Props["createAction"] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createAction, null);
  const wasPending = useRef(false);
  const toast = useToast();

  // useActionState não distingue "ainda não submeteu" de "submeteu com
  // sucesso" (os dois são `null`) — detecta sucesso pela transição
  // pending=true -> false sem erro, em vez de inferir do valor de state.
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
      toast.success("Credencial criada.");
    }
    wasPending.current = isPending;
  }, [isPending, state, toast]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
      >
        <Plus size={15} /> Nova credencial
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova credencial" maxWidth="max-w-md">
        <form action={formAction} className="space-y-4">
          <CredentialFormFields companies={companies} />
          {state?.error && <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Criar"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EditCredentialModal({
  row, companies, updateAction, onClose,
}: { row: CredentialRow; companies: CompanyOption[]; updateAction: Props["updateAction"]; onClose: () => void }) {
  const boundAction = updateAction.bind(null, row.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
  }, [isPending, state, onClose]);

  return (
    <Modal open onClose={onClose} title={`Editar — ${row.title}`} maxWidth="max-w-md">
      <form action={formAction} className="space-y-4">
        <CredentialFormFields companies={companies} defaults={row} />
        {state?.error && <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg transition-colors">
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordCell({ credentialId, revealAction }: { credentialId: string; revealAction: Props["revealAction"] }) {
  const [password, setPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function reveal() {
    startTransition(async () => {
      const res = await revealAction(credentialId);
      if ("password" in res) setPassword(res.password);
      else toast.error(res.error);
    });
  }

  function copy() {
    if (!password) return;
    navigator.clipboard.writeText(password).then(() => toast.success("Senha copiada."));
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="tnum text-fg-secondary">{password ?? "••••••••"}</span>
      <button
        type="button"
        onClick={() => (password ? setPassword(null) : reveal())}
        disabled={isPending}
        className="text-fg-muted hover:text-fg p-1"
        aria-label={password ? "Ocultar senha" : "Revelar senha"}
      >
        {password ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      {password && (
        <button type="button" onClick={copy} className="text-fg-muted hover:text-fg p-1" aria-label="Copiar senha">
          <Copy size={13} />
        </button>
      )}
    </div>
  );
}

export function BpoCredentialsList({ credentials, companies, canManage, createAction, updateAction, deleteAction, revealAction }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const editingRow = credentials.find((c) => c.id === editingId) ?? null;

  function handleDelete(row: CredentialRow) {
    if (!confirm(`Excluir a credencial "${row.title}"? Esta ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      await deleteAction(row.id);
      toast.success("Credencial excluída.");
    });
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <NewCredentialModal companies={companies} createAction={createAction} />
        </div>
      )}

      {credentials.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<KeyRound />}
            title="Nenhuma credencial cadastrada ainda"
            description={canManage ? "Cadastre a primeira credencial do setor." : "Peça ao coordenador do BPO pra cadastrar a primeira credencial."}
          />
        </div>
      ) : (
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[760px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Título</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Empresa</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Usuário</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Senha</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Criada por</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {credentials.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-medium text-fg">
                    {row.title}
                    {row.url && (
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-brand hover:underline truncate max-w-[220px]">
                        {row.url}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{row.companyName ?? "Geral"}</td>
                  <td className="px-4 py-3 text-fg-secondary">{row.username ?? "—"}</td>
                  <td className="px-4 py-3"><PasswordCell credentialId={row.id} revealAction={revealAction} /></td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {row.createdByName}
                    <span className="block text-[11px] text-fg-muted">{row.createdAtLabel}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canManage && (
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setEditingId(row.id)} className="text-fg-muted hover:text-fg p-1.5" aria-label="Editar">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => handleDelete(row)} className="text-fg-muted hover:text-danger p-1.5" aria-label="Excluir">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {editingRow && (
        <EditCredentialModal row={editingRow} companies={companies} updateAction={updateAction} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
