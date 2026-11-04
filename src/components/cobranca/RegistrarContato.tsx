"use client";

import { useState, useTransition } from "react";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoData } from "@/components/ui/CampoData";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { registrarContato } from "@/app/(app)/cobranca/actions";
import {
  ROTULO_DO_CANAL,
  ROTULO_DO_RESULTADO,
  TAMANHO_MAXIMO_DA_ANOTACAO,
  type CanalDeContato,
  type ResultadoDoContato,
} from "@/lib/financeiro/cobranca/regras";

/** Uma escolha em pílulas: rádios de verdade (teclado e leitor de tela), com cara de botão. */
function Pilulas<K extends string>({
  legenda,
  nome,
  opcoes,
  valor,
  onChange,
}: {
  legenda: string;
  nome: string;
  opcoes: Record<K, string>;
  valor: K;
  onChange: (k: K) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-label font-medium text-fg-secondary">{legenda}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(opcoes) as K[]).map((k) => (
          <label key={k} className="cursor-pointer">
            <input type="radio" name={nome} value={k} checked={valor === k} onChange={() => onChange(k)} className="peer sr-only" />
            <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 text-fs-2 font-medium text-fg-secondary transition-colors hover:border-brand/30 hover:text-fg peer-checked:border-brand/40 peer-checked:bg-brand-subtle peer-checked:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
              {opcoes[k]}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Registrar um contato com o sacado — "O que aconteceu agora?" (Cobrança A,
 * página de opções de 04/11/2026): canal e resultado viram pílulas, dois
 * cliques; eram duas listas de escolher numa grade de quatro campos.
 *
 * A data do contato abre em hoje e aceita dias passados (a ligação de ontem
 * registrada hoje). "Prometeu pagar" pede a data prometida como próxima ação —
 * a validação é a mesma no servidor (`validarContato`).
 */
export function RegistrarContato({ entryId, hojeISO }: { entryId: string; hojeISO: string }) {
  const [resultado, setResultado] = useState<ResultadoDoContato>("SEM_RESPOSTA");
  const [canal, setCanal] = useState<CanalDeContato>("TELEFONE");
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const dados = new FormData(form);
        setErro(null);
        setSalvo(false);
        startTransition(async () => {
          const r = await registrarContato(dados);
          if ("error" in r) setErro(r.error);
          else {
            form.reset();
            setResultado("SEM_RESPOSTA");
            setCanal("TELEFONE");
            setSalvo(true);
          }
        });
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <Pilulas legenda="Canal" nome="canal" opcoes={ROTULO_DO_CANAL} valor={canal} onChange={setCanal} />
      <Pilulas legenda="Resultado" nome="resultado" opcoes={ROTULO_DO_RESULTADO} valor={resultado} onChange={setResultado} />
      <FieldGrid columns="sm:grid-cols-2">
        <CampoForm label="Data do contato" htmlFor={`contatoEm-${entryId}`} required>
          <CampoData id={`contatoEm-${entryId}`} name="contatoEm" defaultValue={hojeISO} max={hojeISO} required />
        </CampoForm>
        <CampoForm
          label={resultado === "PROMETEU_PAGAR" ? "Pagamento prometido para" : "Próxima ação"}
          htmlFor={`proximaAcao-${entryId}`}
          required={resultado === "PROMETEU_PAGAR"}
          helper={resultado === "PROMETEU_PAGAR" ? undefined : "Opcional. Quando voltar a falar com o sacado."}
        >
          <CampoData id={`proximaAcao-${entryId}`} name="proximaAcao" min={hojeISO} required={resultado === "PROMETEU_PAGAR"} />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="Anotação interna" htmlFor={`notas-${entryId}`} helper="Só a equipe vê. O portal mostra data, canal e resultado.">
        <Textarea id={`notas-${entryId}`} name="notas" rows={2} maxLength={TAMANHO_MAXIMO_DA_ANOTACAO} />
      </CampoForm>
      <FormFooter
        pending={pendente}
        submitLabel="Registrar contato"
        pendingLabel="Registrando…"
        erro={erro}
        nota={salvo && <span className="text-success-fg">Contato registrado.</span>}
      />
    </form>
  );
}
