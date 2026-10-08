"use client";

import { useActionState, useState } from "react";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/admin/JanelaDeCadastro";
import type { ObligationState } from "@/app/(app)/admin/obrigacoes/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";

export type PipelineOption = { id: string; name: string; sectorCode: string; sectorLabel: string };

type Props = {
  action: (prev: ObligationState, form: FormData) => Promise<ObligationState>;
  companies: (EmpresaParaEscolher & { name: string })[];
  pipelines: PipelineOption[];
  users: { id: string; name: string }[];
};

const WEEKDAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const FREQUENCY_HINTS: Record<Frequency, string> = {
  DAILY: "Gera 1 item por dia útil.",
  WEEKLY: "Gera 1 item por semana, no dia da semana escolhido.",
  BIWEEKLY: "Gera 1 item a cada 2 semanas, no dia da semana escolhido.",
  MONTHLY: "Gera 1 item por mês, no dia escolhido; vencimento prorroga para o próximo dia útil.",
};

/** O "+ Nova obrigação" do cabeçalho de /admin/obrigacoes. */
export function NovaObrigacao(props: Props) {
  return (
    <JanelaDeCadastro rotulo="Nova obrigação" maxWidth="max-w-3xl">
      {(fechar) => <AddObrigacaoForm {...props} onSucesso={fechar} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

// Na janela do "+ Nova obrigação", no cabeçalho da tela (escolha 5A,
// 08/10/2026): o formulário morava aberto num cartão no topo da lista.
export function AddObrigacaoForm({
  action,
  companies,
  pipelines,
  users,
  onSucesso,
  onCancelar,
}: Props & { onSucesso: () => void; onCancelar: () => void }) {
  const [state, formAction, isPending] = useActionState(async (anterior: ObligationState, form: FormData) => {
    const r = await action(anterior, form);
    if (!r) onSucesso();
    return r;
  }, null);
  const [pipelineId, setPipelineId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const selected = pipelines.find((p) => p.id === pipelineId);

  // Três linhas por assunto — o quê e de quem; para onde vai e quem é avisado;
  // quando. Eram cinco campos numa grade de quatro colunas (o responsável caía
  // sozinho na linha de baixo, e "dia do mês" ocupava um quarto da tela para
  // dois dígitos), e o título, que é o nome da obrigação, vinha por último.
  const temDia = frequency !== "DAILY";
  return (
    <form action={formAction} className="space-y-4">
      <FieldGrid>
        <CampoForm label="Título da obrigação" htmlFor="title" required>
          <Input id="title" name="title" type="text" required placeholder="ex: DAS — Simples Nacional" maxLength={160} />
        </CampoForm>
        <CampoForm label="Empresa" htmlFor="companyId" required>
          <SearchableSelect
            id="companyId"
            name="companyId"
            options={opcoesDeEmpresa(companies)}
            avatar
            lembrarRecentes="empresas"
            placeholder="Buscar empresa…"
          />
        </CampoForm>
      </FieldGrid>

      <FieldGrid>
        <CampoForm label="Kanban de destino" htmlFor="pipelineId" required>
          <Select
            id="pipelineId"
            name="pipelineId"
            required
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
          >
            <option value="" disabled>Selecione…</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.sectorLabel} — {p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Responsável (opcional)" htmlFor="responsibleId">
          <Select id="responsibleId" name="responsibleId" defaultValue="">
            <option value="">— Notificar o setor —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>

      <FieldGrid columns={temDia ? "sm:grid-cols-[160px_180px_minmax(0,1fr)]" : "sm:grid-cols-[160px_minmax(0,1fr)]"}>
        <CampoForm label="Frequência" htmlFor="frequency" required>
          <Select
            id="frequency"
            name="frequency"
            required
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="MONTHLY">Mensal</option>
            <option value="WEEKLY">Semanal</option>
            <option value="BIWEEKLY">Quinzenal</option>
            <option value="DAILY">Diária</option>
          </Select>
        </CampoForm>
        {frequency === "MONTHLY" && (
          <CampoForm label="Dia do mês" htmlFor="dayOfMonth" required>
            <Input id="dayOfMonth" name="dayOfMonth" type="number" min={1} max={31} required placeholder="ex: 20" />
          </CampoForm>
        )}
        {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
          <CampoForm label="Dia da semana" htmlFor="dayOfWeek" required>
            <Select id="dayOfWeek" name="dayOfWeek" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </Select>
          </CampoForm>
        )}
        <CampoForm label="Instruções (opcional)" htmlFor="description">
          <Input id="description" name="description" type="text" placeholder="entram na descrição do item do kanban" />
        </CampoForm>
      </FieldGrid>

      <FormFooter
        pending={isPending}
        pendingLabel="Cadastrando…"
        submitLabel="Cadastrar obrigação"
        onCancel={onCancelar}
        erro={state?.error}
        nota={
          <>
            {FREQUENCY_HINTS[frequency]}
            {selected ? ` Kanban: "${selected.name}" (${selected.sectorLabel}).` : ""}
          </>
        }
      />
    </form>
  );
}
