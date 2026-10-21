"use client";

import { useId, useState, useTransition } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";

type Opcao = { id: string; nome: string };

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
  vincularPessoa: (personId: string, userId: string | null) => Promise<void>;
  vincularAgente: (agentLinkId: string, userId: string | null) => Promise<void>;
}) {
  const id = useId();
  const [pessoa, setPessoa] = useState(pessoaAtual ?? "");
  const [agente, setAgente] = useState(agenteAtual ?? "");
  const [pendente, startTransition] = useTransition();

  function trocar(atual: string, nova: string, definir: (v: string) => void, vincular: (alvo: string, conta: string | null) => Promise<void>) {
    definir(nova);
    startTransition(async () => {
      if (atual && atual !== nova) await vincular(atual, null);
      if (nova) await vincular(nova, userId);
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
          avaliação das conversas. Grava na hora.
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
