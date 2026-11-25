"use client";

// Lançar por rubrica e em grupo (25/11/2026, funcionalidade-767, parte 1.1):
// uma rubrica, a lista dos colaboradores da folha com um campo para cada um.
// "Em grupo" é marcar as pessoas e aplicar o mesmo valor a todas de uma vez;
// depois dá para ajustar uma a uma. Vai para `lancarPorRubricaAction` como
// campos `item_<personId>`; vazio = a pessoa fica de fora.

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { FormularioDoDp2, type AcaoDoDp2 } from "@/components/dp2/Formulario";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PREFIXO_DO_ITEM } from "@/lib/dp2/lancamentoPorRubrica";
import { TD, TH, TR } from "@/components/dp2/Secao";

const MANTER = ["rubricaId"];

export type RubricaParaLancar = {
  id: string;
  rotulo: string;
  unidade: "horas" | "dias" | null;
};
export type PessoaParaLancar = { id: string; nome: string };

export function LancarPorRubrica({
  acao,
  competenciaId,
  rubricas,
  pessoas,
}: {
  acao: AcaoDoDp2;
  competenciaId: string;
  rubricas: RubricaParaLancar[];
  pessoas: PessoaParaLancar[];
}) {
  const [rubricaId, setRubricaId] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [mesmo, setMesmo] = useState("");
  const todas = useRef<HTMLInputElement>(null);

  const rubrica = rubricas.find((r) => r.id === rubricaId);
  const unidade = rubrica?.unidade ?? null;
  const rotuloDoCampo =
    unidade === "dias" ? "Dias" : unidade === "horas" ? "Horas" : "Valor";
  const exemplo = unidade ? "10" : "0,00";
  const preenchidas = pessoas.filter(
    (p) => (valores[p.id] ?? "").trim() !== "",
  ).length;
  const marcouTodas = marcadas.size === pessoas.length && pessoas.length > 0;
  const algumas = marcadas.size > 0 && !marcouTodas;
  useEffect(() => {
    if (todas.current) todas.current.indeterminate = algumas;
  }, [algumas]);

  const marcar = (id: string, sim: boolean) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (sim) n.add(id);
      else n.delete(id);
      return n;
    });
  const aplicar = () =>
    setValores((v) => ({
      ...v,
      ...Object.fromEntries([...marcadas].map((id) => [id, mesmo])),
    }));
  const limpar = () => {
    setValores({});
    setMarcadas(new Set());
    setMesmo("");
  };

  return (
    // Depois de lançar, a rubrica fica (para conferir na lista) e os valores
    // limpam, para não lançar de novo sem querer; com erro, nada se perde.
    <FormularioDoDp2
      acao={acao}
      rotulo={preenchidas > 0 ? `Lançar para ${preenchidas}` : "Lançar"}
      rotuloEnviando="Lançando…"
      icone={<Plus size={14} aria-hidden="true" />}
      // Sem o reset automático do React (que desmarcava as caixas): a rubrica
      // fica e o resto limpa só no sucesso.
      manterAposEnviar={MANTER}
      aoConcluir={(estado) => {
        if (estado.ok) limpar();
      }}
    >
      <input type="hidden" name="competenciaId" value={competenciaId} />
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_1.4fr]">
          <CampoForm label="Rubrica" htmlFor="porRubrica-rubrica">
            <Select
              id="porRubrica-rubrica"
              name="rubricaId"
              required
              value={rubricaId}
              onChange={(e) => setRubricaId(e.target.value)}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {rubricas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.rotulo}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm
            label="Observação (vale para todos)"
            htmlFor="porRubrica-obs"
          >
            <Input id="porRubrica-obs" name="observacao" maxLength={300} />
          </CampoForm>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <CampoForm
            label={`Em grupo: ${rotuloDoCampo.toLowerCase()} para os marcados`}
            htmlFor="porRubrica-mesmo"
          >
            <Input
              id="porRubrica-mesmo"
              inputMode="decimal"
              prefix={unidade ? undefined : "R$"}
              placeholder={exemplo}
              value={mesmo}
              onChange={(e) => setMesmo(e.target.value)}
            />
          </CampoForm>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={marcadas.size === 0 || mesmo.trim() === ""}
            onClick={aplicar}
          >
            Aplicar a {marcadas.size}{" "}
            {marcadas.size === 1 ? "marcado" : "marcados"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={preenchidas === 0 && marcadas.size === 0}
            onClick={limpar}
          >
            Limpar
          </Button>
          <span className="text-fs-2 text-fg-muted" aria-live="polite">
            {preenchidas} de {pessoas.length}{" "}
            {preenchidas === 1 ? "preenchido" : "preenchidos"}
          </span>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[420px] text-fs-3">
            <thead>
              <tr>
                <th className={`${TH} w-10`}>
                  <Checkbox
                    ref={todas}
                    aria-label="Marcar todos"
                    checked={marcouTodas}
                    onChange={(e) =>
                      setMarcadas(
                        e.target.checked
                          ? new Set(pessoas.map((p) => p.id))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className={TH}>Colaborador</th>
                <th className={`${TH} w-48`}>{rotuloDoCampo}</th>
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => (
                <tr key={p.id} className={TR}>
                  <td className={TD}>
                    <Checkbox
                      aria-label={`Marcar ${p.nome}`}
                      checked={marcadas.has(p.id)}
                      onChange={(e) => marcar(p.id, e.target.checked)}
                    />
                  </td>
                  <td className={TD}>
                    <label htmlFor={`porRubrica-${p.id}`}>{p.nome}</label>
                  </td>
                  <td className={TD}>
                    <Input
                      id={`porRubrica-${p.id}`}
                      name={`${PREFIXO_DO_ITEM}${p.id}`}
                      inputMode="decimal"
                      compact
                      prefix={unidade ? undefined : "R$"}
                      placeholder={exemplo}
                      value={valores[p.id] ?? ""}
                      onChange={(e) =>
                        setValores((v) => ({ ...v, [p.id]: e.target.value }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FormularioDoDp2>
  );
}
