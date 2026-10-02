"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, KeyRound, Search, MoreHorizontal } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import type { BpoCredencialState } from "@/app/(app)/bpo-senhas/actions";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { FormFooter } from "@/components/ui/FormFooter";

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

type CompanyOption = EmpresaParaEscolher & { name: string };

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
    <div className="flex flex-col gap-4">
      <CampoForm label="Título" htmlFor="title" required>
        <Input id="title" name="title" required defaultValue={defaults?.title} placeholder="Ex: e-CAC, Simples Nacional, Banco Inter" />
      </CampoForm>
      <CampoForm label="Empresa" htmlFor="companyId" helper="Deixe em branco para uma credencial geral do setor.">
        <SearchableSelect
          id="companyId"
          name="companyId"
          defaultValue={defaults?.companyId ?? ""}
          options={opcoesDeEmpresa(companies)}
          avatar
          lembrarRecentes="empresas"
          vazioLabel="Geral (sem empresa)"
          placeholder="Buscar empresa…"
        />
      </CampoForm>
      {/* Usuário e senha são o par que se consulta junto: lado a lado. */}
      <FieldGrid>
        <CampoForm label="Usuário" htmlFor="username">
          <Input id="username" name="username" defaultValue={defaults?.username ?? ""} />
        </CampoForm>
        <CampoForm
          label="Senha"
          htmlFor="password"
          required={!defaults}
          helper={defaults ? "Deixe em branco para manter a senha atual." : undefined}
        >
          <CampoDeSenha id="password" name="password" required={!defaults} autoComplete="new-password" />
        </CampoForm>
      </FieldGrid>
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
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus size={13} /> Nova credencial
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova credencial" maxWidth="max-w-md">
        <form action={formAction} className="flex flex-col gap-4">
          <CredentialFormFields companies={companies} />
          {state?.error && <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>}
          <FormFooter
            pending={isPending}
            submitLabel="Criar"
            onCancel={() => setOpen(false)}
          />
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
      <form action={formAction} className="flex flex-col gap-4">
        <CredentialFormFields companies={companies} defaults={row} />
        {state?.error && <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{state.error}</p>}
        <FormFooter
          pending={isPending}
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}

/**
 * Editar e excluir a credencial: "Editar" em botão, e o Excluir no "⋯" — era
 * um par de ícones soltos (até 30/09), e a lixeira ficava a um clique
 * acidental do lápis. Mesmo desenho das linhas de Cadastros.
 */
function AcoesDaCredencial({ onEditar, onExcluir }: { onEditar: () => void; onExcluir: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Button variant="secondary" size="xs" onClick={onEditar}>
        <Pencil size={12} /> Editar
      </Button>
      <Popover
        align="right"
        width={180}
        aria-label="Mais ações da credencial"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Mais ações"
            aria-expanded={open}
            className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors ${
              open ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      >
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              onExcluir();
            }}
          >
            Excluir
          </ItemDoMenu>
        )}
      </Popover>
    </span>
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
      <IconButton
        size="sm"
        onClick={() => (password ? setPassword(null) : reveal())}
        disabled={isPending}
        aria-label={password ? "Ocultar senha" : "Revelar senha"}
        title={password ? "Ocultar senha" : "Revelar senha"}
      >
        {password ? <EyeOff size={13} /> : <Eye size={13} />}
      </IconButton>
      {password && (
        <IconButton size="sm" onClick={copy} aria-label="Copiar senha" title="Copiar senha">
          <Copy size={13} />
        </IconButton>
      )}
    </div>
  );
}

export function BpoCredentialsList({ credentials, companies, canManage, createAction, updateAction, deleteAction, revealAction }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const editingRow = credentials.find((c) => c.id === editingId) ?? null;

  // Filtro só no cliente — lista inteira já vem carregada da página (sem
  // paginação/busca no servidor, mesmo espírito de listas pequenas do BPO).
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCredentials = normalizedSearch
    ? credentials.filter((c) =>
        [c.title, c.companyName, c.username].some((field) => field?.toLowerCase().includes(normalizedSearch))
      )
    : credentials;

  function handleDelete(row: CredentialRow) {
    requestConfirm(
      { title: `Excluir a credencial "${row.title}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" },
      async () => {
        await deleteAction(row.id);
        toast.success("Credencial excluída.");
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Barra de ferramentas: busca `compact` e botão `sm`, os dois em 32px —
          eram o Input e o Button de formulário, de 36px. */}
      <div className="flex items-center justify-between gap-3">
        {credentials.length > 0 && (
          <div className="min-w-0 flex-1 max-w-xs">
            <Input
              compact
              icon={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, empresa ou usuário…"
              aria-label="Buscar credenciais"
            />
          </div>
        )}
        {canManage && (
          <div className="ml-auto flex-shrink-0">
            <NewCredentialModal companies={companies} createAction={createAction} />
          </div>
        )}
      </div>

      {credentials.length === 0 ? (
        <Card>
          <EmptyState
            icon={<KeyRound />}
            title="Nenhuma credencial cadastrada ainda"
            description={canManage ? "Cadastre a primeira credencial do setor." : "Peça ao coordenador do BPO pra cadastrar a primeira credencial."}
          />
        </Card>
      ) : filteredCredentials.length === 0 ? (
        <Card>
          <EmptyState icon={<KeyRound />} title="Nenhuma credencial encontrada" description="Tente ajustar a busca." />
        </Card>
      ) : (
      // Tabela no casco padrão, com funil em Empresa e Criada por (30/09) — a
      // lista inteira já está aqui, então o funil filtra no navegador, junto
      // com a busca. No celular, cartões: a tabela de 760px rolava de lado.
      <>
        <CartoesNoCelular>
          {filteredCredentials.map((row) => (
            <Cartao key={row.id}>
              <TopoDoCartao nome={row.title} />
              <InfoDoCartao>
                {row.companyName ?? "Geral"}
                {row.username ? ` · ${row.username}` : ""}
              </InfoDoCartao>
              {row.url && (
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-brand hover:underline truncate">
                  {row.url}
                </a>
              )}
              <div className="mt-1.5">
                <PasswordCell credentialId={row.id} revealAction={revealAction} />
              </div>
              <PeDoCartao>
                <span className="text-[11.5px] text-fg-muted">
                  {row.createdByName} · {row.createdAtLabel}
                </span>
                {canManage && (
                  <span className="ml-auto">
                    <AcoesDaCredencial onEditar={() => setEditingId(row.id)} onExcluir={() => handleDelete(row)} />
                  </span>
                )}
              </PeDoCartao>
            </Cartao>
          ))}
        </CartoesNoCelular>

        <TabelaFiltravel
          linhas={filteredCredentials.map((row) => ({
            id: row.id,
            valores: { empresa: row.companyName ?? "Geral", criador: row.createdByName },
          }))}
        >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[760px] text-[length:var(--fs-body)]">
              <thead>
                <tr className="border-b border-border text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                  </th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Senha</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Criada por" chave="criador" align="right" />
                  </th>
                  {canManage && (
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredCredentials.map((row) => (
                  <LinhaFiltravel key={row.id} id={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-medium text-fg">
                      {row.title}
                      {row.url && (
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="block text-[11px] font-normal text-brand hover:underline truncate max-w-[220px]" title={row.url}>
                          {row.url}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{row.companyName ?? "Geral"}</td>
                    <td className="px-4 py-3 text-fg-secondary">{row.username ?? "—"}</td>
                    <td className="px-4 py-3">
                      <PasswordCell credentialId={row.id} revealAction={revealAction} />
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {row.createdByName}
                      <span className="block text-[11px] text-fg-muted">{row.createdAtLabel}</span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <AcoesDaCredencial onEditar={() => setEditingId(row.id)} onExcluir={() => handleDelete(row)} />
                      </td>
                    )}
                  </LinhaFiltravel>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </TabelaFiltravel>
      </>
      )}

      {editingRow && (
        <EditCredentialModal row={editingRow} companies={companies} updateAction={updateAction} onClose={() => setEditingId(null)} />
      )}
      {dialog}
    </div>
  );
}
