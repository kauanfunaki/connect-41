"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useToast } from "@/components/ui/Toast";
import { importarLicencas, type ResultadoDaImportacao } from "@/app/(app)/licencas/actions";

type Conferencia = Extract<ResultadoDaImportacao, { ok: true }>;

const dataBr = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? k.split("-").reverse().join("/") : k);

/**
 * "Importar planilha" em Licenças (lote B dos ajustes de 03/11/2026): baixar o
 * modelo do Connect, subir a planilha preenchida, conferir linha a linha e só
 * então importar. Nada é gravado na conferência.
 */
export function ImportarLicencas() {
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function fechar() {
    if (pendente) return;
    setAberta(false);
    setArquivo(null);
    setConferencia(null);
    setErro(null);
  }

  function enviar(confirmar: boolean) {
    if (!arquivo) return;
    const form = new FormData();
    form.set("planilha", arquivo);
    if (confirmar) form.set("confirmar", "1");
    setErro(null);
    startTransition(async () => {
      const r = await importarLicencas(form).catch(() => ({ error: "Não deu para enviar agora. Tente de novo." }) as const);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      if (confirmar) {
        toast.success(`${r.criadas} ${r.criadas === 1 ? "licença importada" : "licenças importadas"}.`);
        fechar();
        return;
      }
      setConferencia(r);
    });
  }

  const novas = conferencia?.linhas.filter((l) => l.situacao === "nova").length ?? 0;
  const repetidas = conferencia?.linhas.filter((l) => l.situacao === "repetida").length ?? 0;
  const erros = conferencia?.linhas.filter((l) => l.situacao === "erro").length ?? 0;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberta(true)}>
        <FileSpreadsheet size={14} /> Importar planilha
      </Button>
      <Modal open={aberta} onClose={fechar} title="Importar licenças de uma planilha" maxWidth="max-w-3xl">
        <div className="flex flex-col gap-4">
          {!conferencia ? (
            <>
              <p className="text-helper text-fg-secondary">
                Preencha o modelo do Connect — uma licença por linha, com o CNPJ da empresa — e suba aqui. Antes de gravar, a tela mostra o que entra, o
                que já está cadastrado e o que tem erro.
              </p>
              <div>
                <Button href="/licencas/modelo" download variant="secondary" size="sm">
                  <Download size={14} /> Baixar o modelo (.xlsx)
                </Button>
              </div>
              <FileDropzoneField
                id="planilha-de-licencas"
                name="planilha"
                accept=".xlsx"
                maxSizeMb={5}
                onFileChange={(f) => {
                  setArquivo(f);
                  setErro(null);
                }}
              />
              {erro && <Aviso>{erro}</Aviso>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={fechar} disabled={pendente}>
                  Cancelar
                </Button>
                <Button onClick={() => enviar(false)} disabled={!arquivo} loading={pendente} loadingLabel="Conferindo…">
                  <Upload size={14} /> Conferir
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-ui text-fg">
                <strong>{novas}</strong> {novas === 1 ? "entra" : "entram"} · {repetidas} já {repetidas === 1 ? "cadastrada" : "cadastradas"} · {erros}{" "}
                com erro. Só as novas são gravadas.
              </p>
              <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
                <ul className="divide-y divide-border-soft">
                  {conferencia.linhas.map((l) => (
                    <li key={l.linha} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2 text-fs-2">
                      <span className="w-14 shrink-0 tabular-nums text-fg-muted">linha {l.linha}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-fg">{l.empresa ?? l.documento ?? "—"}</span>
                        <span className="block text-micro text-fg-muted">
                          {[l.tipo || "sem tipo", l.validade && `validade ${dataBr(l.validade)}`].filter(Boolean).join(" · ")}
                        </span>
                        {(l.motivo || l.aviso) && (
                          <span className={`block text-micro ${l.situacao === "erro" ? "text-danger" : "text-warning-fg"}`}>{l.motivo ?? l.aviso}</span>
                        )}
                      </span>
                      <Selo tom={l.situacao === "nova" ? "sucesso" : l.situacao === "repetida" ? "neutro" : "perigo"}>
                        {l.situacao === "nova" ? "Entra" : l.situacao === "repetida" ? "Já existe" : "Erro"}
                      </Selo>
                    </li>
                  ))}
                </ul>
              </div>
              {erros > 0 && <p className="text-micro text-fg-muted">As linhas com erro ficam de fora. Corrija na planilha e importe de novo: as que já entraram aparecem como “Já existe”.</p>}
              {erro && <Aviso>{erro}</Aviso>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setConferencia(null)} disabled={pendente}>
                  Trocar a planilha
                </Button>
                <Button onClick={() => enviar(true)} disabled={novas === 0} loading={pendente} loadingLabel="Importando…">
                  Importar {novas} {novas === 1 ? "licença" : "licenças"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
