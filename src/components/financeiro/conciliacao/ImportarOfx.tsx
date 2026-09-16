"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { importarOfx, type ResumoDaImportacao } from "@/app/(app)/conciliacao/actions";
import { moeda } from "@/lib/financeiro/formato";
import { dataCurta } from "./data";

/** O mesmo teto da action. Conferido aqui para não subir 50 MB e só então ouvir "não". */
const MAXIMO_MB = 5;

export function ImportarOfx({ bankAccountId }: { bankAccountId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoDaImportacao | null>(null);
  const [pendente, startTransition] = useTransition();
  // Remonta o dropzone depois de importar, para ele esquecer o arquivo enviado.
  const [versao, setVersao] = useState(0);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Upload size={15} className="text-brand" />
        <h2 className="text-[14px] font-semibold text-fg">Importar extrato OFX</h2>
      </div>
      <p className="text-[12px] text-fg-secondary max-w-[70ch]">
        Exporte o extrato em OFX (Money/Quicken) no internet banking. O arquivo precisa ser desta conta. Reimportar o
        mesmo período não duplica nada: o que já entrou é reconhecido e pulado.
      </p>
      <form
        ref={formRef}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!arquivo) {
            setErro("Escolha o arquivo OFX.");
            return;
          }
          const dados = new FormData(e.currentTarget);
          setErro(null);
          setResumo(null);
          startTransition(async () => {
            const r = await importarOfx(dados);
            if ("error" in r) {
              setErro(r.error);
              return;
            }
            setResumo(r.resumo);
            setArquivo(null);
            setVersao((v) => v + 1);
          });
        }}
      >
        <input type="hidden" name="bankAccountId" value={bankAccountId} />
        <FileDropzoneField key={versao} name="arquivo" accept=".ofx" maxSizeMb={MAXIMO_MB} compacto onFileChange={setArquivo} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pendente || !arquivo}>
            {pendente ? "Importando…" : "Importar"}
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      </form>

      {resumo && (
        <div className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <p className="inline-flex items-center gap-1.5 text-[13px] text-success">
            <Check size={14} /> {resumo.novas} {resumo.novas === 1 ? "transação nova" : "transações novas"} de {resumo.lidas} lidas
            {resumo.repetidas > 0 && ` · ${resumo.repetidas} já estavam importadas`}
          </p>
          {(resumo.inicioKey || resumo.fimKey) && (
            <p>
              Período do arquivo: {resumo.inicioKey ? dataCurta(resumo.inicioKey) : "?"} a {resumo.fimKey ? dataCurta(resumo.fimKey) : "?"}
            </p>
          )}
          {resumo.saldoDoBancoCentavos !== null && (
            <p>
              Saldo do banco: <strong className="tabular-nums">{moeda(resumo.saldoDoBancoCentavos)}</strong>
              {resumo.saldoDoBancoKey && ` em ${dataCurta(resumo.saldoDoBancoKey)}`}
            </p>
          )}
          {resumo.zeradas > 0 && <p>{resumo.zeradas} com valor zero não foram importadas.</p>}
          {resumo.avisos.map((a) => (
            <p key={a} className="text-warning">
              {a}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
