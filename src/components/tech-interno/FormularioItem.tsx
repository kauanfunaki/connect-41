"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { FormFooter } from "@/components/ui/FormFooter";
import { salvarItemTech, comentarItemTech } from "@/app/(app)/tech/controle-interno/actions";
import { TIPOS, PRIORIDADES, SITUACOES, ROTA_TECH_INTERNO, ORIGENS_DO_SISTEMA, comVolta, type SistemaTech, type OrigemDoSistema } from "@/lib/tech-interno/regras";

type Pessoa = { id: string; name: string };
export type ItemDoFormulario = {
  id: string; version: number; title: string; description: string | null;
  type: keyof typeof TIPOS; priority: number; status: keyof typeof SITUACOES;
  systemMode: "NONE" | "NEW" | "EXISTING"; systemKey: string | null; assigneeId: string | null; dueDate: string | null;
  assigneeName: string | null;
};

export function FormularioItem({ item, sistemas, users, podeEditar, voltar = ROTA_TECH_INTERNO }: { item?: ItemDoFormulario; sistemas: SistemaTech[]; users: Pessoa[]; podeEditar: boolean; voltar?: string }) {
  const router = useRouter();
  const [sistema, setSistema] = useState(item?.systemMode === "EXISTING" ? item.systemKey ?? "NONE" : item?.systemMode ?? "NONE");
  const [erro, setErro] = useState("");
  const { show } = useToast();
  const [pendente, iniciar] = useTransition();
  const modo = sistema === "NONE" || sistema === "NEW" ? sistema : "EXISTING";
  const responsaveis = item?.assigneeId && !users.some(u => u.id === item.assigneeId)
    ? [...users, { id: item.assigneeId, name: `${item.assigneeName ?? "Responsável anterior"} (indisponível)` }] : users;
  return <form className="flex flex-col gap-5" onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setErro("");
    iniciar(async () => {
      try {
        const r = await salvarItemTech(item?.id, form);
        if ("error" in r) { setErro(r.error); return; }
        show(item ? "Alterações salvas." : "Item criado.", "success");
        if (!item) router.replace(comVolta(`${ROTA_TECH_INTERNO}/${r.id}`, voltar));
        else router.refresh();
      } catch { setErro("Não foi possível confirmar o salvamento. Atualize a página antes de tentar novamente."); }
    });
  }}>
    <input type="hidden" name="version" value={item?.version ?? 0} />
    <input type="hidden" name="systemMode" value={modo} />
    <input type="hidden" name="systemKey" value={modo === "EXISTING" ? sistema : ""} />
    <fieldset disabled={!podeEditar || pendente} className="contents">
      <CampoForm label="Título" htmlFor="tech-title" required><Input id="tech-title" name="title" required maxLength={200} defaultValue={item?.title} /></CampoForm>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Tipo" htmlFor="tech-type" required><Select id="tech-type" name="type" defaultValue={item?.type ?? ""} required>
          <option value="" disabled>Escolha o tipo</option>{Object.entries(TIPOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select></CampoForm>
        <CampoForm label="Prioridade" htmlFor="tech-priority" required><Select id="tech-priority" name="priority" defaultValue={item?.priority ?? 1}>{PRIORIDADES.map((label, v) => <option key={v} value={v}>{label}</option>)}</Select></CampoForm>
        <CampoForm label="Situação" htmlFor="tech-status" required><Select id="tech-status" name="status" defaultValue={item?.status ?? "PENDING"}>{Object.entries(SITUACOES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select></CampoForm>
        {/* Os robôs, sites e apps do Ops Center, com busca: a lista cresce com o
            cadastro de lá (29/10/2026). Inativo só aparece no item que já o usa. */}
        <CampoForm label="Sistema" htmlFor="tech-system" helper="Do cadastro do Ops Center."><Select id="tech-system" busca value={sistema} onChange={e => setSistema(e.target.value)}>
          <option value="NONE">Sem sistema</option><option value="NEW">Novo sistema</option>
          {(Object.keys(ORIGENS_DO_SISTEMA) as OrigemDoSistema[]).map(origem => {
            const daOrigem = sistemas.filter(s => s.origem === origem && (s.ativo || s.chave === item?.systemKey));
            return daOrigem.length ? <optgroup key={origem} label={ORIGENS_DO_SISTEMA[origem]}>
              {daOrigem.map(s => <option key={s.chave} value={s.chave}>{s.nome}{!s.ativo ? " (inativo)" : ""}</option>)}
            </optgroup> : null;
          })}
        </Select></CampoForm>
        <CampoForm label="Responsável" htmlFor="tech-assignee"><Select id="tech-assignee" name="assigneeId" defaultValue={item?.assigneeId ?? ""}><option value="">Sem responsável</option>{responsaveis.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></CampoForm>
        <CampoForm label="Prazo" htmlFor="tech-due" helper="Opcional."><CampoData id="tech-due" name="dueDate" min="1900-01-01" max="9999-12-31" defaultValue={item?.dueDate ?? ""} /></CampoForm>
      </div>
      <CampoForm label="Descrição" htmlFor="tech-description"><Textarea id="tech-description" name="description" rows={6} maxLength={10000} defaultValue={item?.description ?? ""} /></CampoForm>
    </fieldset>
    {podeEditar ? <FormFooter pending={pendente} submitLabel={item ? "Salvar alterações" : "Criar item"} pendingLabel={item ? undefined : "Criando…"} cancelHref={voltar} erro={erro || undefined} />
      : <p className="text-helper text-fg-muted text-right">Acesso somente para consulta.</p>}
  </form>;
}

export function FormularioComentario({ id }: { id: string }) {
  const router = useRouter(); const [texto, setTexto] = useState(""); const [erro, setErro] = useState(""); const [pendente, iniciar] = useTransition();
  return <form className="flex flex-col gap-3" onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget); setErro("");
    iniciar(async () => {
      try {
        const r = await comentarItemTech(id, form);
        if ("error" in r) { setErro(r.error); return; }
        setTexto(""); router.refresh();
      } catch { setErro("Não foi possível confirmar o comentário. Atualize a página para conferir antes de tentar novamente."); }
    });
  }}>
    <CampoForm label="Comentário" htmlFor="tech-comment"><Textarea id="tech-comment" name="body" value={texto} onChange={e => setTexto(e.target.value)} rows={3} maxLength={5000} required disabled={pendente} /></CampoForm>
    {erro && <p role="alert" className="text-helper text-danger">{erro}</p>}
    <Button className="self-end" type="submit" loading={pendente}><MessageSquarePlus size={14} aria-hidden />Adicionar comentário</Button>
  </form>;
}
