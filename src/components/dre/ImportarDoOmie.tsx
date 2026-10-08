"use client";

import { useState } from "react";
import { Upload, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { FormFooter } from "@/components/ui/FormFooter";
import { formatarCompetencia } from "@/lib/format";
import { competenciaDe } from "@/lib/financeiro/periodo";
import { importarExportDoOmie, type ResultadoDaImportacao } from "@/app/(app)/dre/import-actions";

/** O mesmo teto da action. Conferido aqui para não subir o arquivo e só então ouvir "não". */
const MAXIMO_MB = 8;

export function ImportarDoOmie({ companyId }: { companyId: string }) {
  const [estado, setEstado] = useState<ResultadoDaImportacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  // Remonta o campo depois de importar, para ele esquecer o arquivo enviado.
  const [versao, setVersao] = useState(0);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando || !arquivo) return;
    setEnviando(true);
    setEstado(null);
    const r = await importarExportDoOmie(new FormData(e.currentTarget));
    setEstado(r);
    setEnviando(false);
    if ("ok" in r) {
      setArquivo(null);
      setVersao((v) => v + 1);
    }
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <h2 className="inline-flex items-center gap-1.5 text-card-title font-semibold text-fg">
        <Upload size={16} className="text-brand" />
        Importar do Omie
      </h2>
      <p className="text-helper text-fg-secondary max-w-[62ch]">
        A planilha de Contas a Pagar ou a Receber exportada do Omie, com as colunas como elas vêm.
        Cada linha vai para o mês da <strong>data de crédito ou débito no extrato</strong> — que é a
        data que o DRE de caixa usa. Importar de novo o mesmo mês substitui o que estava lá.
      </p>

      {/* O campo de arquivo do app, como no OFX e no CSV (08/10/2026): era o
          seletor nativo do navegador, "Choose File / No file chosen", com o
          texto no idioma do navegador. O "Importar" vai no rodapé, à direita. */}
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
        <FormFooter pending={enviando} submitLabel="Importar" pendingLabel="Lendo…" submitDisabled={!arquivo} size="sm" semDivisoria />
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
                  ` — ${estado.categoriasSemGrupo} sem grupo no DRE, para classificar acima`}
              </span>
            )}
            {estado.ignoradas > 0 && (
              <span className="text-warning-fg">
                {estado.ignoradas}{" "}
                {estado.ignoradas === 1 ? "linha ignorada" : "linhas ignoradas"} — sem data ou sem
                valor
              </span>
            )}
          </span>
        </Aviso>
      )}
    </Card>
  );
}
