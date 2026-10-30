"use client";

import { useId, useState, useTransition } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";

type Opcao = { id: string; nome: string };
type Vincular = (alvo: string, conta: string | null) => Promise<{ error: string } | void>;

/**
 * Quem a conta é na equipe e no Chatwoot, no fim do painel do usuário
 * (escolha 3A dos Ajustes de 15/10, 20/10/2026). Era a tela Atendentes e
 * vínculos, uma linha por colaborador interno com os dois seletores. O nome e
 * a foto reais da avaliação das conversas saem daqui.
 *
 * Grava na hora, com as actions de antes, e solta o vínculo anterior antes de
 * ligar o novo: um atendente ou uma pessoa nunca fica com duas contas. O
 * vínculo do atendente é com a conta (ChatwootAgentLink.linkedUserId), não com
 * a pessoa.
 */
export function AtendimentoDoUsuario({
  userId,
  pessoas,
  pessoaAtual,
  agentes,
  agenteAtual,
  vincularPessoa,
  vincularAgente,
}: {
  userId: string;
  /** Colaboradores internos sem conta, mais o desta conta. */
  pessoas: Opcao[];
  pessoaAtual: string | null;
  /** Atendentes do Chatwoot sem conta, mais o desta; nulo sem a integração. */
  agentes: Opcao[] | null;
  agenteAtual: string | null;
  vincularPessoa: Vincular;
  vincularAgente: Vincular;
}) {
  const id = useId();
  const [pessoa, setPessoa] = useState(pessoaAtual ?? "");
  const [agente, setAgente] = useState(agenteAtual ?? "");
  const [pendente, startTransition] = useTransition();
  const toast = useToast();

  // Com retorno (auditoria de UX, 30/10/2026): a troca gravava sem aviso nenhum,
  // e uma falha deixava o seletor mostrando um vínculo que não existia.
  function trocar(atual: string, nova: string, definir: (v: string) => void, vincular: Vincular) {
    definir(nova);
    startTransition(async () => {
      try {
        const soltou = atual && atual !== nova ? await vincular(atual, null) : undefined;
        if (soltou && "error" in soltou) throw new Error(soltou.error);
        const ligou = nova ? await vincular(nova, userId) : undefined;
        if (ligou && "error" in ligou) throw new Error(ligou.error);
        toast.success(nova ? "Vínculo salvo." : "Vínculo desfeito.");
      } catch (e) {
        definir(atual);
        toast.error(e instanceof Error && e.message ? e.message : "Não foi possível salvar o vínculo. Tente de novo.");
      }
    });
  }

  if (pessoas.length === 0 && !agentes) return null;

  return (
    <section aria-labelledby={`${id}-titulo`} className="mt-6 space-y-4 border-t border-border pt-5">
      <div>
        <h3 id={`${id}-titulo`} className="text-card-title font-semibold text-fg">
          Atendimento
        </h3>
        <p className="mt-0.5 text-fs-2 text-fg-muted">
          Quem esta conta é na equipe{agentes ? " e no Chatwoot" : ""} — é o que põe o nome e a foto reais na
          avaliação das conversas. Grava na hora, à parte do Salvar acima — o Cancelar não desfaz esta parte.
        </p>
      </div>
      {pessoas.length > 0 && (
        <CampoForm label="Colaborador interno" htmlFor={`${id}-pessoa`}>
          <Select
            id={`${id}-pessoa`}
            value={pessoa}
            disabled={pendente}
            onChange={(e) => trocar(pessoa, e.target.value, setPessoa, vincularPessoa)}
          >
            <option value="">Nenhum</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
      )}
      {agentes && (
        <CampoForm label="Atendente do Chatwoot" htmlFor={`${id}-agente`}>
          <Select
            id={`${id}-agente`}
            value={agente}
            disabled={pendente}
            onChange={(e) => trocar(agente, e.target.value, setAgente, vincularAgente)}
          >
            <option value="">Nenhum</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
      )}
    </section>
  );
}
