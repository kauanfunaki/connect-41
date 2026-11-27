"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { useToast } from "@/components/ui/Toast";
import { registrarNaJuntaPeloProcesso } from "@/app/(app)/processos/junta-actions";

type Props = {
  processId: string;
  /** O NIRE e a data que a empresa já tem. */
  nire: string | null;
  dataCampo: string;
  dataTexto: string | null;
  /** Já há foto do quadro guardada por este processo. */
  quadroGuardado: boolean;
  temSocios: boolean;
  hoje: string;
  sociosHref: string;
  podeAgir: boolean;
};

const TITULO_ID = "registro-na-junta";

/**
 * O registro na Junta pelo processo (27/11/2026, melhoria-892): com o ato
 * deferido, grava o NIRE e a data do registro na ficha da empresa e guarda a
 * foto do quadro societário com essa data. É o "Finalizado (NIRE, data)" da
 * Alteração Contratual do Domínio. Só aparece nos tipos que terminam na Junta.
 */
export function RegistroNaJunta({ processId, nire, dataCampo, dataTexto, quadroGuardado, temSocios, hoje, sociosHref, podeAgir }: Props) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, iniciar] = useTransition();

  function gravar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await registrarNaJuntaPeloProcesso(form).catch(() => ({ ok: false as const, erro: "Não deu para gravar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success(r.quadro ? "NIRE gravado na empresa e quadro societário guardado." : "NIRE gravado na empresa.");
    });
  }

  return (
    <Card as="section" aria-labelledby={TITULO_ID} className="p-4 flex flex-col gap-3">
      <h2 id={TITULO_ID} className="text-section font-semibold text-fg flex items-center gap-2">
        <Landmark size={16} aria-hidden className="text-fg-muted" /> Registro na Junta
      </h2>
      <p className="text-fs-2 text-fg-secondary">
        {nire ? (
          <>
            Na ficha: NIRE <span className="tabular-nums text-fg">{nire}</span>
            {dataTexto && <>, registrado em {dataTexto}</>}.
          </>
        ) : (
          "A empresa ainda não tem NIRE na ficha."
        )}
        {quadroGuardado && " O quadro societário deste processo já foi guardado."}
      </p>
      {podeAgir && (
        <form action={gravar} className="flex flex-col gap-3">
          <input type="hidden" name="processId" value={processId} />
          <FieldGrid>
            <CampoForm label="NIRE" htmlFor="junta-nire" required>
              <Input id="junta-nire" name="nire" defaultValue={nire ?? ""} inputMode="numeric" maxLength={30} required />
            </CampoForm>
            <CampoForm label="Data do registro" htmlFor="junta-data" required>
              <CampoData id="junta-data" name="data" defaultValue={dataCampo || hoje} max={hoje} required />
            </CampoForm>
          </FieldGrid>
          {temSocios ? (
            <Checkbox id="junta-quadro" name="guardarQuadro" defaultChecked={!quadroGuardado} label="Guardar o quadro societário de agora com esta data" />
          ) : (
            <p className="text-helper text-fg-muted">
              Sem sócio cadastrado, o quadro não é guardado.{" "}
              <Link href={sociosHref} className="text-brand underline">
                Cadastrar os sócios
              </Link>
            </p>
          )}
          <p className="text-helper text-fg-muted">
            Confira em{" "}
            <Link href={sociosHref} className="text-brand underline">
              Sócios
            </Link>{" "}
            se o quadro já está como ficou depois do ato antes de guardar.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <div>
            <Button type="submit" loading={gravando} loadingLabel="Gravando…">
              Gravar na empresa
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
