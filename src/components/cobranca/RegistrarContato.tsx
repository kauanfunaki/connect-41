"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
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
      className="flex flex-col gap-3"
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <CampoForm label="Data do contato" htmlFor={`contatoEm-${entryId}`} required>
          <Input id={`contatoEm-${entryId}`} type="date" name="contatoEm" defaultValue={hojeISO} max={hojeISO} required />
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
        <CampoForm
          label={resultado === "PROMETEU_PAGAR" ? "Pagamento prometido para" : "Próxima ação"}
          htmlFor={`proximaAcao-${entryId}`}
          required={resultado === "PROMETEU_PAGAR"}
        >
          <Input
            id={`proximaAcao-${entryId}`}
            type="date"
            name="proximaAcao"
            min={hojeISO}
            required={resultado === "PROMETEU_PAGAR"}
          />
        </CampoForm>
      </div>
      <CampoForm label="Anotação interna" htmlFor={`notas-${entryId}`} helper="Só a equipe vê. O portal mostra data, canal e resultado.">
        <Textarea id={`notas-${entryId}`} name="notas" rows={2} maxLength={TAMANHO_MAXIMO_DA_ANOTACAO} />
      </CampoForm>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Registrando…" : "Registrar contato"}
        </Button>
        {erro && <span className="text-[12px] text-danger">{erro}</span>}
        {salvo && <span className="text-[12px] text-success">Contato registrado.</span>}
      </div>
    </form>
  );
}
