"use client";

import { useState, useTransition } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type Resultado = { error: string } | { id: string };

/**
 * "+ Nova pasta" no pé da coluna de pastas, numa janela — como no Repositório
 * de manuais (10/11/2026). A pasta é o processo ("Admissão", "Folha do mês").
 */
export function NovaPastaDeFluxos({ action }: { action: (titulo: string) => Promise<Resultado> }) {
  return (
    <JanelaDeCadastro rotulo="Nova pasta" botao={{ variant: "ghost", size: "sm", className: "w-full justify-start max-md:h-11" }}>
      {(fechar) => (
        <FormDeTitulo
          id="fluxos-nova-pasta"
          rotulo="Nome da pasta"
          helper="O processo do setor, como “Admissão” ou “Folha do mês”. Os fluxos entram depois, pelo “+ Fluxo” da pasta."
          enviar={action}
          botao="Criar pasta"
          aoCriar={() => fechar()}
          aoCancelar={fechar}
        />
      )}
    </JanelaDeCadastro>
  );
}

/**
 * "Novo fluxo": o nome e a pasta. O fluxo nasce com o Início e o Fim e abre
 * direto na edição, para o setor escrever as etapas.
 */
export function NovoFluxo({
  pastas,
  pastaInicial,
  action,
  aoCriar,
  noCabecalho = false,
}: {
  pastas: { id: string; titulo: string }[];
  pastaInicial?: string;
  action: (pastaId: string, titulo: string) => Promise<Resultado>;
  aoCriar: (id: string) => void;
  /** O botão do cabeçalho (primário) ou o "+ Fluxo" de dentro da pasta. */
  noCabecalho?: boolean;
}) {
  return (
    <JanelaDeCadastro
      rotulo={noCabecalho ? "Novo fluxo" : "Fluxo"}
      titulo="Novo fluxo"
      botao={noCabecalho ? undefined : { variant: "ghost", size: "xs", className: "h-6! px-2! max-md:h-11!" }}
    >
      {(fechar) => <FormDoFluxo pastas={pastas} pastaInicial={pastaInicial ?? pastas[0]?.id ?? ""} action={action} aoCriar={(id) => { fechar(); aoCriar(id); }} aoCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

function FormDeTitulo({ id, rotulo, helper, enviar, botao, aoCriar, aoCancelar }: { id: string; rotulo: string; helper: string; enviar: (t: string) => Promise<Resultado>; botao: string; aoCriar: (id: string) => void; aoCancelar: () => void }) {
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
          const r = await enviar(titulo);
          if ("error" in r) setErro(r.error);
          else aoCriar(r.id);
        });
      }}
    >
      <CampoForm label={rotulo} htmlFor={id} required helper={helper}>
        <Input id={id} value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
      </CampoForm>
      <FormFooter pending={pendente} pendingLabel="Criando…" submitLabel={botao} onCancel={aoCancelar} erro={erro} />
    </form>
  );
}

function FormDoFluxo({ pastas, pastaInicial, action, aoCriar, aoCancelar }: { pastas: { id: string; titulo: string }[]; pastaInicial: string; action: (pastaId: string, titulo: string) => Promise<Resultado>; aoCriar: (id: string) => void; aoCancelar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [pasta, setPasta] = useState(pastaInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await action(pasta, titulo);
          if ("error" in r) setErro(r.error);
          else aoCriar(r.id);
        });
      }}
    >
      <CampoForm label="Nome do fluxo" htmlFor="fluxos-novo-titulo" required helper="Como o setor chama o processo: “Admissão de funcionário”.">
        <Input id="fluxos-novo-titulo" value={titulo} maxLength={160} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
      </CampoForm>
      <CampoForm label="Pasta" htmlFor="fluxos-novo-pasta" required>
        <Select id="fluxos-novo-pasta" value={pasta} onChange={(e) => setPasta(e.target.value)} required>
          {pastas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo}
            </option>
          ))}
        </Select>
      </CampoForm>
      <FormFooter pending={pendente} pendingLabel="Criando…" submitLabel="Criar e escrever as etapas" onCancel={aoCancelar} erro={erro} />
    </form>
  );
}
