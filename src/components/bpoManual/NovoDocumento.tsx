"use client";

import { useState, useTransition } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type Acao = (title: string) => Promise<{ error: string } | { id: string }>;

/**
 * O "+ Novo documento" do cabeçalho do Repositório de manuais, com o título numa
 * janela (P19, 15/10/2026). Ficava no pé da árvore e criava ali mesmo, num campo
 * solto que sumia ao perder o foco. O documento novo chega aberto na árvore.
 */
export function NovoDocumento({ action }: { action: Acao }) {
  return (
    <JanelaDeCadastro rotulo="Novo documento">
      {(fechar) => <FormDoDocumento action={action} onSucesso={fechar} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

function FormDoDocumento({ action, onSucesso, onCancelar }: { action: Acao; onSucesso: () => void; onCancelar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await action(titulo);
          if ("error" in r) setErro(r.error);
          else onSucesso();
        });
      }}
    >
      <CampoForm label="Título do documento" htmlFor="manual-documento-titulo" required helper="As páginas entram depois, pelo “+ Página” do documento, na árvore.">
        <Input id="manual-documento-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </CampoForm>
      <FormFooter pending={pendente} pendingLabel="Criando…" submitLabel="Criar documento" onCancel={onCancelar} erro={erro} />
    </form>
  );
}
