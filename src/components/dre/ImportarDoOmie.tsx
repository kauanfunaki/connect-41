"use client";

import { useRef, useState } from "react";
import { Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { importarExportDoOmie, type ResultadoDaImportacao } from "@/app/(app)/dre/import-actions";

const MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function ImportarDoOmie({ companyId }: { companyId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, setEstado] = useState<ResultadoDaImportacao | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setEstado(null);
    const r = await importarExportDoOmie(new FormData(e.currentTarget));
    setEstado(r);
    setEnviando(false);
    if ("ok" in r) formRef.current?.reset();
  }

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Upload size={15} className="text-brand" />
        <h2 className="text-[14px] font-semibold text-fg">Importar do Omie</h2>
      </div>
      <p className="text-[12px] text-fg-secondary max-w-[62ch]">
        A planilha de Contas a Pagar ou a Receber exportada do Omie, com as colunas como elas vêm.
        Cada linha vai para o mês da <strong>data de crédito ou débito no extrato</strong> — que é a
        data que o DRE de caixa usa. Importar de novo o mesmo mês substitui o que estava lá.
      </p>

      <form ref={formRef} onSubmit={enviar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="companyId" value={companyId} />
        <input
          type="file"
          name="arquivo"
          accept=".xlsx"
          required
          aria-label="Planilha exportada do Omie"
          className="text-[12px] text-fg-secondary file:mr-3 file:h-8 file:px-3 file:rounded-md file:border file:border-border file:bg-surface file:text-fg file:text-[12px] file:cursor-pointer"
        />
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? "Lendo…" : "Importar"}
        </Button>
      </form>

      {estado && "error" in estado && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {estado.error}
        </p>
      )}

      {estado && "ok" in estado && (
        <div className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2 flex flex-col gap-1">
          <span className="flex items-center gap-1.5 font-medium">
            <Check size={14} />
            {estado.lidas} {estado.lidas === 1 ? "linha" : "linhas"} de{" "}
            {estado.origem === "pagamento" ? "pagamentos" : "recebimentos"}
          </span>
          {/* O arquivo cobrir mais de um mês é normal e precisa ser dito: quem
              importa espera um mês, e dois meses mudam dois relatórios. */}
          {estado.meses.map((m) => (
            <span key={`${m.ano}-${m.mes}`} className="text-fg-secondary">
              {m.linhas} em {MES[m.mes - 1]} de {m.ano}
            </span>
          ))}
          {estado.ignoradas > 0 && (
            <span className="text-warning">
              {estado.ignoradas}{" "}
              {estado.ignoradas === 1 ? "linha ignorada" : "linhas ignoradas"} — sem data ou sem
              valor
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
