"use client";

import { useRef, useState, useTransition } from "react";
import { Check, RefreshCw, Upload } from "lucide-react";
import { FormFooter } from "@/components/ui/FormFooter";
import { Card } from "@/components/ui/Card";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { importarExtratoDoOmie, importarOfx, type ResumoDaImportacao } from "@/app/(app)/conciliacao/actions";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { CampoMes } from "@/components/ui/CampoMes";
import { moeda } from "@/lib/financeiro/formato";
import { dataCurta } from "./data";

/** O mesmo teto da action. Conferido aqui para não subir 50 MB e só então ouvir "não". */
const MAXIMO_MB = 5;

/**
 * `omie` (lote 4, 28/10/2026): a conta ligada a uma conta corrente do Omie
 * ganha "Trazer do Omie" — o extrato do mês espelhado do que o BPO conciliou
 * lá, para quem não tem OFX.
 */
export function ImportarOfx({ bankAccountId, omie }: { bankAccountId: string; omie?: { rotulo: string | null; mesInicial: string } | null }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoDaImportacao | null>(null);
  const [pendente, startTransition] = useTransition();
  // Remonta o dropzone depois de importar, para ele esquecer o arquivo enviado.
  const [versao, setVersao] = useState(0);
  const [mesDoOmie, setMesDoOmie] = useState(omie?.mesInicial ?? "");
  const [trazendo, startTrazer] = useTransition();
  // Um erro para cada caminho (auditoria de UX, 30/10/2026): o do Omie saía no
  // rodapé do formulário do OFX, acima do bloco do Omie, longe do botão que o
  // causou. E os dois envios se travam um ao outro enquanto um corre.
  const [erroDoOmie, setErroDoOmie] = useState<string | null>(null);
  const ocupado = pendente || trazendo;

  function trazerDoOmie() {
    if (!mesDoOmie) {
      setErroDoOmie("Escolha o mês do extrato do Omie.");
      return;
    }
    setErroDoOmie(null);
    setErro(null);
    setResumo(null);
    startTrazer(async () => {
      const r = await importarExtratoDoOmie(bankAccountId, mesDoOmie);
      if ("error" in r) setErroDoOmie(r.error);
      else setResumo(r.resumo);
    });
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Upload size={16} className="text-brand" />
        <h2 className="text-card-title font-semibold text-fg">Importar extrato OFX</h2>
      </div>
      <p className="text-helper text-fg-secondary max-w-[70ch]">
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
          if (ocupado) return;
          const dados = new FormData(e.currentTarget);
          setErro(null);
          setErroDoOmie(null);
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
        {/* O rodapé padrão, à direita como o "Lançar" e o "Criar versão"
            (08/10/2026): o "Importar" ficava à esquerda, embaixo do campo. */}
        <FormFooter pending={pendente} submitLabel="Importar" pendingLabel="Importando…" submitDisabled={!arquivo || trazendo} erro={erro} size="sm" semDivisoria />
      </form>

      {omie && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-helper text-fg-secondary max-w-[70ch]">
            Sem OFX? Esta conta é a {omie.rotulo ? `"${omie.rotulo}"` : "conta corrente"} no Omie. Traga do Omie o que o BPO já conciliou lá no mês — é um
            espelho: só entra o lançamento conciliado no Omie, e conta com OFX no mesmo mês é recusada.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <CampoMes id={`omie-mes-${bankAccountId}`} value={mesDoOmie} onChange={setMesDoOmie} compact aria-label="Mês do extrato do Omie" />
            <Button type="button" variant="secondary" size="sm" onClick={trazerDoOmie} disabled={pendente} loading={trazendo} loadingLabel="Lendo o Omie…">
              <RefreshCw size={14} /> Trazer do Omie
            </Button>
          </div>
          {erroDoOmie && <Aviso>{erroDoOmie}</Aviso>}
        </div>
      )}

      {resumo && (
        // Anunciado: o resumo aparece sem o foco sair do botão que importou.
        <div role="status" className="flex flex-col gap-1 text-fs-2 text-fg-secondary">
          <p className="inline-flex items-center gap-1.5 text-ui text-success-fg">
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
          {resumo.conciliadasPeloOmie > 0 && (
            <p>
              {resumo.conciliadasPeloOmie} {resumo.conciliadasPeloOmie === 1 ? "já estava conciliada" : "já estavam conciliadas"} no Omie e
              {resumo.conciliadasPeloOmie === 1 ? " saiu" : " saíram"} da fila.
            </p>
          )}
          {resumo.lancadasPorRegra > 0 && (
            <p>
              {resumo.lancadasPorRegra} {resumo.lancadasPorRegra === 1 ? "foi lançada e conciliada" : "foram lançadas e conciliadas"} pelas
              regras de conciliação — desfaça no registro das regras se alguma não for.
            </p>
          )}
          {resumo.zeradas > 0 && <p>{resumo.zeradas} com valor zero não foram importadas.</p>}
          {resumo.avisos.map((a) => (
            <p key={a} className="text-warning-fg">
              {a}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}
