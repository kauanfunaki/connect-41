"use client";

import { useState, useTransition } from "react";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
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

/**
 * Registrar um contato com o sacado.
 *
 * A data do contato abre em hoje e aceita dias passados (a ligação de ontem
 * registrada hoje). "Prometeu pagar" pede a data prometida como próxima ação —
 * a validação é a mesma no servidor (`validarContato`).
 */
export function RegistrarContato({ entryId, hojeISO }: { entryId: string; hojeISO: string }) {
  const [resultado, setResultado] = useState<ResultadoDoContato>("SEM_RESPOSTA");
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
            setSalvo(true);
          }
        });
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
        <CampoForm label="Data do contato" htmlFor={`contatoEm-${entryId}`} required>
          <CampoData id={`contatoEm-${entryId}`} name="contatoEm" defaultValue={hojeISO} max={hojeISO} required />
        </CampoForm>
        <CampoForm label="Canal" htmlFor={`canal-${entryId}`} required>
          <Select id={`canal-${entryId}`} name="canal" defaultValue="TELEFONE">
            {(Object.keys(ROTULO_DO_CANAL) as CanalDeContato[]).map((c) => (
              <option key={c} value={c}>
                {ROTULO_DO_CANAL[c]}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Resultado" htmlFor={`resultado-${entryId}`} required>
          <Select
            id={`resultado-${entryId}`}
            name="resultado"
            value={resultado}
            onChange={(e) => setResultado(e.target.value as ResultadoDoContato)}
          >
            {(Object.keys(ROTULO_DO_RESULTADO) as ResultadoDoContato[]).map((r) => (
              <option key={r} value={r}>
                {ROTULO_DO_RESULTADO[r]}
              </option>
            ))}
          </Select>
        </CampoForm>
        {/* "Pagamento prometido para" quebrava em duas linhas numa coluna de
            quatro e descia o campo; o rótulo curto cabe, e o resto vai no helper. */}
        <CampoForm
          label={resultado === "PROMETEU_PAGAR" ? "Data prometida" : "Próxima ação"}
          htmlFor={`proximaAcao-${entryId}`}
          required={resultado === "PROMETEU_PAGAR"}
          helper={resultado === "PROMETEU_PAGAR" ? "Quando o sacado prometeu pagar." : undefined}
        >
          <CampoData
            id={`proximaAcao-${entryId}`}
           
            name="proximaAcao"
            min={hojeISO}
            required={resultado === "PROMETEU_PAGAR"}
          />
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
