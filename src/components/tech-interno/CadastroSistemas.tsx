"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { StatusDot } from "@/components/shared/StatusDot";
import { salvarSistemaTech } from "@/app/(app)/tech/controle-interno/actions";

type Sistema = { id: string; name: string; active: boolean; version: number };
export function CadastroSistemas({ tools }: { tools: Sistema[] }) {
  const router = useRouter(); const [aberto, setAberto] = useState(false); const [editando, setEditando] = useState<Sistema | null>(null);
  const [erro, setErro] = useState(""); const [pendente, iniciar] = useTransition();
  const fechar = () => { if (!pendente) { setAberto(false); setEditando(null); setErro(""); } };
  return <>
    <Button variant="secondary" onClick={() => setAberto(true)}>Cadastrar sistema</Button>
    <div className="divide-y divide-border">
      {tools.map(t => <div key={t.id} className="flex items-center justify-between gap-3 py-3">
        <span className="min-w-0 break-words text-ui">{t.name}<StatusDot className="ml-2 align-middle" color={t.active ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={t.active ? "Ativo" : "Inativo"} /></span>
        <Button size="sm" variant="secondary" onClick={() => { setEditando(t); setErro(""); setAberto(true); }}>Editar</Button>
      </div>)}
      {!tools.length && <p className="py-6 text-label text-fg-secondary">Nenhum sistema cadastrado. Os itens também podem ficar sem sistema ou indicar um novo sistema.</p>}
    </div>
    <Modal open={aberto} onClose={fechar} title={editando ? "Editar sistema" : "Cadastrar sistema"}>
      <form key={editando?.id ?? "novo"} className="flex flex-col gap-4" onSubmit={e => {
        e.preventDefault(); const form = new FormData(e.currentTarget); setErro("");
        iniciar(async () => {
          try {
            const r = await salvarSistemaTech(editando?.id, form);
            if ("error" in r) { setErro(r.error); return; }
            setAberto(false); setEditando(null); router.refresh();
          } catch { setErro("Não foi possível confirmar o salvamento. Atualize a página antes de tentar novamente."); }
        });
      }}>
        <input type="hidden" name="version" value={editando?.version ?? 0} />
        <CampoForm label="Nome do sistema" htmlFor="tech-tool-name" required><Input id="tech-tool-name" name="name" required maxLength={120} defaultValue={editando?.name} disabled={pendente} /></CampoForm>
        <Checkbox id="tech-tool-active" name="active" value="true" label="Sistema ativo" defaultChecked={editando?.active ?? true} disabled={pendente} />
        <p className="text-helper text-fg-muted">Desativar impede novas seleções. Os itens já vinculados continuam identificados.</p>
        <FormFooter pending={pendente} submitLabel="Salvar sistema" onCancel={fechar} erro={erro || undefined} />
      </form>
    </Modal>
  </>;
}
