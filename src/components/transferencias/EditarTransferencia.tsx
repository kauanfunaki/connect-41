"use client";

import { useId, useState, useTransition } from "react";
import { PencilLine } from "lucide-react";
import type { HandoffPriority } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { editarTransferencia } from "@/app/(app)/transferencias/actions";
import { ASSUNTO_MAXIMO, HANDOFF_PRIORITY_OPTIONS, HANDOFF_PRIORITY_TOM } from "@/lib/handoffs";

type Dados = { subject: string; description: string; priority: HandoffPriority };

type Props = {
  handoffId: string;
  inicial: Dados;
  pessoas: MentionUser[];
};

const TOM_DO_SEGMENTO = { neutro: "neutral", marca: "brand", atencao: "warning", perigo: "danger" } as const;

/**
 * "Editar" no cabeçalho da transferência aberta (10/11/2026, pedido do
 * Kauan): assunto, descrição e prioridade, numa janela. Fica com quem pediu, a
 * coordenação do setor de origem e o administrador (quem decide aparece na
 * página). A mudança vira um item da Atividade. Fechar com algo alterado
 * pergunta antes, como no "Editar dados" dos Chamados.
 */
export function EditarTransferencia({ handoffId, inicial, pessoas }: Props) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" className="max-sm:h-11" onClick={() => setAberto(true)}>
        <PencilLine size={14} aria-hidden />
        Editar
      </Button>
      {/* Monta só quando abre: cada abertura parte dos dados atuais. */}
      {aberto && <JanelaDeEdicao handoffId={handoffId} inicial={inicial} pessoas={pessoas} onFechar={() => setAberto(false)} />}
    </>
  );
}

function JanelaDeEdicao({ handoffId, inicial, pessoas, onFechar }: Props & { onFechar: () => void }) {
  const toast = useToast();
  const idDoAssunto = useId();
  const idDaDescricao = useId();
  const [dados, setDados] = useState<Dados>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [descartar, setDescartar] = useState(false);
  const [pendente, iniciar] = useTransition();
  const mudou =
    dados.subject.trim() !== inicial.subject.trim() || dados.description.trim() !== inicial.description.trim() || dados.priority !== inicial.priority;

  function pedirParaFechar() {
    if (pendente) return;
    if (mudou) setDescartar(true);
    else onFechar();
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!mudou) return;
    if (!dados.subject.trim()) {
      setErro("Escreva o assunto.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await editarTransferencia(handoffId, dados);
      if (r.ok) {
        toast.success("Transferência atualizada.");
        onFechar();
      } else setErro(r.erro);
    });
  }

  return (
    <>
      <Modal open onClose={pedirParaFechar} title="Editar a transferência" maxWidth="max-w-2xl">
        <form onSubmit={salvar} className="space-y-5">
          <p className="text-ui text-fg-secondary">A mudança vale para todos os setores desta transferência e fica na Atividade.</p>
          <fieldset disabled={pendente} className="space-y-5">
            <CampoForm label="Assunto" htmlFor={idDoAssunto} required>
              <Input
                id={idDoAssunto}
                value={dados.subject}
                maxLength={ASSUNTO_MAXIMO}
                onChange={(e) => setDados({ ...dados, subject: e.target.value })}
              />
            </CampoForm>
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-medium leading-5 text-fg">Prioridade</span>
              <SegmentedControl
                label="Prioridade"
                tocavel
                active={dados.priority}
                onChange={(priority) => setDados({ ...dados, priority })}
                className="self-start"
                items={HANDOFF_PRIORITY_OPTIONS.map((o) => ({ key: o.value, label: o.label, tone: TOM_DO_SEGMENTO[HANDOFF_PRIORITY_TOM[o.value]] }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idDaDescricao} className="text-label font-medium leading-5 text-fg">
                Descrição
              </label>
              <MentionTextarea
                id={idDaDescricao}
                rows={6}
                crescer
                value={dados.description}
                onChange={(description) => setDados({ ...dados, description })}
                users={pessoas}
                placeholder="O que os setores precisam saber. Use @ para mencionar alguém."
              />
            </div>
          </fieldset>
          {erro && (
            <p role="alert" className="rounded-md bg-danger/8 p-3 text-ui text-danger">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            {!mudou && <span className="mr-auto text-helper text-fg-muted">Nada alterado ainda.</span>}
            <Button type="button" variant="secondary" disabled={pendente} onClick={pedirParaFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!mudou} loading={pendente} loadingLabel="Salvando…">
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={descartar}
        title="Descartar as alterações?"
        description="O que você mudou na transferência ainda não foi salvo."
        confirmLabel="Descartar alterações"
        cancelLabel="Continuar editando"
        destructive
        onConfirm={() => {
          setDescartar(false);
          onFechar();
        }}
        onCancel={() => setDescartar(false)}
      />
    </>
  );
}
