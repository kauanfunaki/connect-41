"use client";

import { useState } from "react";
import { Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { FormFooter } from "@/components/ui/FormFooter";
import { formatarCompetencia } from "@/lib/format";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { importarExportDoOmie, type ResultadoDaImportacao } from "@/app/(app)/dre/import-actions";

/** O mesmo teto da action. Conferido aqui para não subir o arquivo e só então ouvir "não". */
const MAXIMO_MB = 8;

/**
 * "Importar do Omie" no topo da DRE, ao lado do "Exportar no modelo do BPO",
 * abrindo um diálogo pequeno (13/10/2026, print do Kauan). Era um cartão no pé
 * da tela, com o texto à esquerda e uma área de arquivo de largura inteira
 * quase vazia. A ação e as validações são as mesmas (`importarExportDoOmie`).
 */
export function ImportarDoOmie({ companyId }: { companyId: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<ResultadoDaImportacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Remonta o campo depois de importar, para ele esquecer o arquivo enviado.
  const [versao, setVersao] = useState(0);

  function abrir() {
    setEstado(null);
    setArquivo(null);
    setVersao((v) => v + 1);
    setAberto(true);
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando || !arquivo) return;
    const dados = new FormData(e.currentTarget);
    setEnviando(true);
    setEstado(null);
    let r: ResultadoDaImportacao;
    try {
      r = await importarExportDoOmie(dados);
    } catch {
      r = { error: "Não consegui enviar o arquivo. Tente de novo." };
    }
    setEstado(r);
    setEnviando(false);
    if ("ok" in r) {
      setArquivo(null);
      setVersao((v) => v + 1);
    }
  }

  const importou = estado !== null && "ok" in estado;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={abrir}>
        <Upload size={14} /> Importar do Omie
      </Button>
      <Modal open={aberto} onClose={() => !enviando && setAberto(false)} title="Importar do Omie">
        <div className="flex flex-col gap-3">
          <p className="text-helper text-fg-secondary">
            A planilha de Contas a Pagar ou a Receber exportada do Omie. Cada linha vai para o mês da data de
            crédito ou débito no extrato, e importar de novo o mesmo mês substitui o que estava lá.
          </p>

          {/* O campo de arquivo do app, como no OFX e no CSV (08/10/2026): era o
              seletor nativo do navegador, "Choose File / No file chosen", com o
              texto no idioma do navegador. */}
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <input type="hidden" name="companyId" value={companyId} />
            <FileDropzoneField
              key={versao}
              name="arquivo"
              accept=".xlsx"
              maxSizeMb={MAXIMO_MB}
              required
              compacto
              onFileChange={setArquivo}
            />
            <FormFooter
              pending={enviando}
              submitLabel="Importar"
              pendingLabel="Lendo…"
              submitDisabled={!arquivo}
              onCancel={() => setAberto(false)}
              cancelLabel={importou ? "Fechar" : "Cancelar"}
              size="sm"
              semDivisoria
            />
          </form>

          {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}

          {estado && "ok" in estado && (
            <Aviso tom="sucesso" icone={<Check />}>
              <span className="flex flex-col gap-1">
                <span className="font-medium">
                  {estado.lidas} {estado.lidas === 1 ? "linha" : "linhas"} de{" "}
                  {estado.origem === "pagamento" ? "pagamentos" : "recebimentos"}
                </span>
                {/* O arquivo cobrir mais de um mês é normal e precisa ser dito: quem
                    importa espera um mês, e dois meses mudam dois relatórios. */}
                {estado.meses.map((m) => (
                  <span key={`${m.ano}-${m.mes}`} className="text-fg-secondary">
                    {m.linhas} em {formatarCompetencia(competenciaDe(m.ano, m.mes))}
                  </span>
                ))}
                {estado.categoriasCriadas > 0 && (
                  <span className="text-fg-secondary">
                    {estado.categoriasCriadas}{" "}
                    {estado.categoriasCriadas === 1 ? "categoria nova" : "categorias novas"} no plano de contas
                    {estado.categoriasSemGrupo > 0 &&
                      ` — ${estado.categoriasSemGrupo} sem grupo no DRE, para classificar em "Classificar", no topo da DRE`}
                  </span>
                )}
                {estado.ignoradas > 0 && (
                  <span className="text-warning-fg">
                    {estado.ignoradas} {estado.ignoradas === 1 ? "linha ignorada" : "linhas ignoradas"} — sem data ou
                    sem valor
                  </span>
                )}
              </span>
            </Aviso>
          )}
        </div>
      </Modal>
    </>
  );
}
