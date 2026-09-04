"use client";

import { useActionState, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/shared/StatusDot";
import type { EstadoDoAcesso } from "@/app/(app)/admin/portal/actions";

type Acesso = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  cliente: string;
  ultimoAcesso: string | null;
};

type Cliente = { id: string; nome: string; empresas: number };

type Props = {
  acessos: Acesso[];
  clientes: Cliente[];
  criarAction: (anterior: EstadoDoAcesso, form: FormData) => Promise<EstadoDoAcesso>;
  enviarLinkAction: (id: string) => Promise<{ error: string } | { ok: true }>;
  alternarAction: (id: string, ativo: boolean) => Promise<void>;
};

export function PortalAcessosList({ acessos, clientes, criarAction, enviarLinkAction, alternarAction }: Props) {
  const [estado, formAction, criando] = useActionState<EstadoDoAcesso, FormData>(criarAction, null);
  const [pendente, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);

  function enviarLink(id: string) {
    setMensagem(null);
    startTransition(async () => {
      const r = await enviarLinkAction(id);
      setMensagem("error" in r ? r.error : "Link enviado.");
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Novo acesso</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
          A conta nasce <span className="font-medium text-fg">sem senha</span> — nem quem cria sabe
          qual é. O cliente recebe por e-mail um link para definir a dele.
        </p>
        <form action={formAction} className="space-y-4">
          <FieldGrid>
            <CampoForm label="Nome" htmlFor="nome" required>
              <Input id="nome" name="nome" required placeholder="Quem vai acessar" />
            </CampoForm>
            <CampoForm label="E-mail" htmlFor="email" required>
              <Input id="email" name="email" type="email" required />
            </CampoForm>
          </FieldGrid>

          <CampoForm
            label="Cliente"
            htmlFor="clientGroupId"
            helper="Define quais empresas esta conta enxerga. Cliente sem empresa não mostra documento nenhum."
            required
          >
            <Select id="clientGroupId" name="clientGroupId" required defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.empresas} {c.empresas === 1 ? "empresa" : "empresas"})
                </option>
              ))}
            </Select>
          </CampoForm>

          {estado && "erro" in estado && (
            <p className="text-[length:var(--fs-helper)] text-danger">{estado.erro}</p>
          )}
          {estado && "ok" in estado && (
            <p className="text-[length:var(--fs-helper)] text-success">
              {estado.aviso ?? "Acesso criado e link enviado."}
            </p>
          )}

          <Button type="submit" disabled={criando}>
            {criando ? "Criando…" : "Criar acesso"}
          </Button>
        </form>
      </Card>

      <div>
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">
          Acessos ({acessos.length})
        </h2>
        {acessos.length === 0 ? (
          <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhum acesso criado ainda.</p>
        ) : (
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {acessos.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-4 py-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-[length:var(--fs-ui)] text-fg truncate">{a.nome}</p>
                  <p className="text-[length:var(--fs-micro)] text-fg-muted truncate">
                    {a.email} · {a.cliente}
                    {a.ultimoAcesso ? ` · entrou em ${a.ultimoAcesso}` : " · nunca entrou"}
                  </p>
                </div>
                <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                <button
                  type="button"
                  disabled={pendente || !a.ativo}
                  onClick={() => enviarLink(a.id)}
                  className="text-[length:var(--fs-ui)] font-medium text-brand hover:underline disabled:opacity-50"
                >
                  Enviar link
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => startTransition(() => void alternarAction(a.id, !a.ativo))}
                  className="text-[length:var(--fs-ui)] text-fg-secondary hover:text-fg disabled:opacity-50"
                >
                  {a.ativo ? "Desativar" : "Reativar"}
                </button>
              </div>
            ))}
          </div>
        )}
        {mensagem && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-3">{mensagem}</p>}
      </div>
    </div>
  );
}
