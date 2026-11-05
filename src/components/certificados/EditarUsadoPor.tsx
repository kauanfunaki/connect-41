"use client";

import { useId, useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import { MAXIMO_DA_DESCRICAO, USO_OUTRO, USOS_DECLARAVEIS } from "@/lib/certificados/usos";
import { salvarUsadoPor } from "@/app/(app)/certificados/actions";

type Props = {
  documento: string;
  titular: string;
  /** Os usos marcados à mão hoje. */
  declarados: { uso: string; descricao: string | null }[];
  /** Os registrados pelo sistema, só para mostrar ("Robô · IE, último uso 05/11"). */
  registrados: string[];
};

/**
 * O "Usado por" à mão (05/11/2026), só para quem coordena: marca onde o
 * certificado é usado quando o Connect não tem como ver sozinho — a NFS-e, a
 * procuração no e-CAC, um uso fora do Connect. O que o robô e o Serpro
 * registram aparece aqui só para leitura: não se desmarca o que o sistema viu.
 */
export function EditarUsadoPor({ documento, titular, declarados, registrados }: Props) {
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(declarados.map((d) => d.uso)));
  const [outro, setOutro] = useState(() => declarados.find((d) => d.uso === USO_OUTRO)?.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [erroDoOutro, setErroDoOutro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const base = useId();

  function abrir() {
    setMarcados(new Set(declarados.map((d) => d.uso)));
    setOutro(declarados.find((d) => d.uso === USO_OUTRO)?.descricao ?? "");
    setErro(null);
    setErroDoOutro(null);
    setAberto(true);
  }

  function alternar(uso: string, sim: boolean) {
    setMarcados((m) => {
      const n = new Set(m);
      if (sim) n.add(uso);
      else n.delete(uso);
      return n;
    });
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (marcados.has(USO_OUTRO) && !outro.trim()) {
      setErroDoOutro("Escreva qual é o outro uso, ou desmarque “Outro”.");
      document.getElementById(`${base}-texto`)?.focus();
      return;
    }
    setErro(null);
    setErroDoOutro(null);
    const usos = [...marcados].map((uso) => ({ uso, descricao: uso === USO_OUTRO ? outro.trim() : null }));
    startTransition(async () => {
      const r = await salvarUsadoPor(documento, usos);
      if ("error" in r) setErro(r.error);
      else {
        toast.success("“Usado por” salvo.");
        setAberto(false);
      }
    });
  }

  return (
    <>
      <Button size="xs" variant="ghost" onClick={abrir} aria-label={`Editar onde o certificado de ${titular} é usado`}>
        <Pencil size={12} aria-hidden />
        Editar
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Onde este certificado é usado" maxWidth="max-w-lg">
        <form onSubmit={salvar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-muted">
            {titular}. Marque o que depende deste certificado e o Connect não vê sozinho. Vale também para o certificado
            que vier na renovação.
          </p>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-label font-medium text-fg">Usado por</legend>
            {USOS_DECLARAVEIS.map((u) => (
              <Checkbox
                key={u.uso}
                id={`${base}-${u.uso}`}
                label={u.rotulo}
                checked={marcados.has(u.uso)}
                onChange={(e) => alternar(u.uso, e.target.checked)}
              />
            ))}
          </fieldset>
          {marcados.has(USO_OUTRO) && (
            <CampoForm label="Qual é o outro uso" htmlFor={`${base}-texto`} required error={erroDoOutro ?? undefined}>
              <Input
                id={`${base}-texto`}
                value={outro}
                maxLength={MAXIMO_DA_DESCRICAO}
                onChange={(e) => {
                  setOutro(e.target.value);
                  if (e.target.value.trim()) setErroDoOutro(null);
                }}
                placeholder="Ex.: login no portal da prefeitura"
                error={!!erroDoOutro}
                aria-invalid={!!erroDoOutro}
              />
            </CampoForm>
          )}
          {registrados.length > 0 && (
            <div className="rounded-md border border-border-soft bg-surface-hover px-3 py-2 text-helper text-fg-secondary">
              <span className="font-medium text-fg">Registrado pelo Connect:</span> {registrados.join("; ")}. Esses
              usos aparecem sozinhos e saem quando param há 90 dias.
            </div>
          )}
          {erro && (
            <p role="alert" className="text-helper text-danger">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button type="submit" loading={pendente} disabled={pendente}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
