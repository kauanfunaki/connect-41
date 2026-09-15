"use client";

import { useState, useTransition } from "react";
import { Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { previsualizarImportacao, confirmarImportacao } from "@/app/(app)/lancamentos/actions";
import type { PreviaDaImportacao } from "@/lib/financeiro/importacaoCsv";
import { moeda } from "@/lib/financeiro/formato";

const MODELO = "Tipo;Contraparte;Documento;Categoria;Competência;Vencimento;Valor;Descrição;Pago em";

export function ImportarLancamentosCsv({ companyId }: { companyId: string }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState("");
  const [previa, setPrevia] = useState<PreviaDaImportacao | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  async function ler(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPrevia(null);
    setResultado(null);
    setErro(null);
    if (!f) return;
    const conteudo = await f.text();
    setTexto(conteudo);
    setArquivo(f.name);
    startTransition(async () => setPrevia(await previsualizarImportacao(companyId, conteudo)));
  }

  function confirmar() {
    if (!texto) return;
    setErro(null);
    startTransition(async () => {
      // Manda o arquivo de novo: o servidor relê e revalida, não confia na prévia.
      const r = await confirmarImportacao(companyId, texto);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setResultado(
        `${r.criados} ${r.criados === 1 ? "lançamento criado" : "lançamentos criados"}` +
          (r.duplicadas ? ` · ${r.duplicadas} duplicadas ignoradas` : "") +
          (r.comErro ? ` · ${r.comErro} com erro não importadas` : "")
      );
      setPrevia(null);
      setTexto(null);
    });
  }

  const linhas = previa?.ok ? previa.linhas : [];
  const validas = linhas.filter((l) => l.situacao === "valida");

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Upload size={15} className="text-brand" />
        <h2 className="text-[14px] font-semibold text-fg">Importar lançamentos por CSV</h2>
      </div>
      <p className="text-[12px] text-fg-secondary max-w-[70ch]">
        Uma linha por conta. Vírgula ou ponto e vírgula, datas em <code>dd/mm/aaaa</code> ou <code>aaaa-mm-dd</code>.
        Competência em branco herda o mês do vencimento. A categoria precisa existir no plano de contas com o mesmo
        tipo. Nada é gravado antes de você confirmar, e linha igual a um lançamento que já existe é ignorada.
      </p>
      <pre className="text-[11px] bg-surface-hover border border-border rounded-md px-3 py-2 overflow-x-auto">{MODELO}</pre>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={ler}
        aria-label="Arquivo CSV de lançamentos"
        className="text-[12px] text-fg-secondary file:mr-3 file:h-8 file:px-3 file:rounded-md file:border file:border-border file:bg-surface file:text-fg file:text-[12px] file:cursor-pointer"
      />

      {pendente && <p className="text-[12px] text-fg-muted">Lendo…</p>}
      {previa && !previa.ok && <p className="text-[13px] text-danger">{previa.erro}</p>}
      {erro && <p className="text-[13px] text-danger">{erro}</p>}
      {resultado && (
        <p className="inline-flex items-center gap-1.5 text-[13px] text-success">
          <Check size={14} /> {resultado}
        </p>
      )}

      {previa?.ok && (
        <>
          <p className="text-[12px] text-fg-secondary">
            {arquivo}: {linhas.length} linhas · <strong>{validas.length} válidas</strong> ·{" "}
            {linhas.filter((l) => l.situacao === "duplicada").length} duplicadas ·{" "}
            {linhas.filter((l) => l.situacao === "erro").length} com erro
          </p>
          <div className="overflow-x-auto max-h-[420px] border border-border rounded-md">
            <table className="w-full min-w-[760px] text-[12px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 px-3 font-medium">Linha</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Contraparte</th>
                  <th className="py-2 pr-3 font-medium">Competência</th>
                  <th className="py-2 pr-3 font-medium">Vencimento</th>
                  <th className="py-2 pr-3 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.numero} className="border-b border-border-soft align-top">
                    <td className="py-2 px-3 tabular-nums text-fg-muted">{l.numero}</td>
                    <td className="py-2 pr-3">
                      {l.situacao === "valida" ? (
                        <Badge variant="success">{l.dados.kind === "PAGAR" ? "A pagar" : "A receber"}</Badge>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <Badge variant={l.situacao === "erro" ? "danger" : "warning"}>
                            {l.situacao === "erro" ? "Erro" : "Duplicada"}
                          </Badge>
                          <span className="text-[11px] text-fg-muted max-w-[260px]">{l.erro}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">{l.situacao === "erro" ? "—" : l.dados.contraparteNome}</td>
                    <td className="py-2 pr-3 tabular-nums">{l.situacao === "erro" ? "—" : l.dados.competencia}</td>
                    <td className="py-2 pr-3 tabular-nums">{l.situacao === "erro" ? "—" : l.dados.vencimentoKey}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.situacao === "erro" ? "—" : moeda(l.dados.centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <Button size="sm" onClick={confirmar} disabled={pendente || validas.length === 0}>
              Importar {validas.length} {validas.length === 1 ? "linha válida" : "linhas válidas"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
