import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * O relatório da execução mostrada: o Markdown que vai para o cliente ou para
 * o arquivo, com a prévia aqui, e os três arquivos do original (relatório,
 * pendências em CSV e a execução em JSON).
 */
export function AbaRelatorio({ execucaoId, markdown, valida }: { execucaoId: string | null; markdown: string | null; valida: boolean }) {
  if (!execucaoId || !markdown) return <EmptyState title="Ainda não analisado" description="O relatório sai da análise: execute-a na aba Análise." />;
  const link = (formato: string) => `/api/revisao-contabil/execucoes/${execucaoId}?formato=${formato}`;
  return (
    <div className="flex flex-col gap-4">
      {!valida && (
        <Aviso tom="atencao">
          Este relatório é de uma análise anterior às últimas mudanças no fechamento ou nos documentos. Execute a análise de novo antes de entregar.
        </Aviso>
      )}
      <div className="flex flex-wrap gap-2">
        <Button href={link("md")} download variant="primary" size="sm">
          <Download size={14} aria-hidden /> Relatório (.md)
        </Button>
        <Button href={link("csv")} download variant="secondary" size="sm">
          <Download size={14} aria-hidden /> Pendências (.csv)
        </Button>
        <Button href={link("json")} download variant="secondary" size="sm">
          <Download size={14} aria-hidden /> Execução (.json)
        </Button>
      </div>
      <Card as="section" className="p-4">
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-helper text-fg">{markdown}</pre>
      </Card>
    </div>
  );
}
