import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { EnvioDeDocumentos } from "@/components/revisao-contabil/EnvioDeDocumentos";
import { DocumentoNaAnalise, ExcluirDocumento } from "@/components/revisao-contabil/AcoesDaRevisao";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDateTime } from "@/lib/format";

type Documento = {
  id: string;
  nome: string;
  tipo: string;
  interpretado: boolean;
  tamanho: number;
  ativo: boolean;
  createdAt: Date;
};

/**
 * Os documentos do fechamento: o envio e a lista, com o que o motor
 * reconheceu em cada arquivo. "Na análise" é a seleção de versões do
 * original: o documento desligado fica guardado e não entra na execução.
 */
export function AbaDocumentos({ fechamentoId, documentos, quarentena, podeAgir }: { fechamentoId: string; documentos: Documento[]; quarentena: ReadonlySet<string>; podeAgir: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {podeAgir && (
        <Card as="section" className="p-4">
          <h2 className="text-label font-semibold text-fg">Enviar documentos</h2>
          <p className="mb-3 text-helper text-fg-muted">
            PDF com texto, Excel (.xlsx), CSV, TXT ou ZIP, até 10 MB por arquivo: balancete, balanço, DRE, razão, faturamento, relatórios de serviços e de
            entradas e comprovantes do e-CAC. PDF escaneado precisa de OCR antes.
          </p>
          <EnvioDeDocumentos fechamentoId={fechamentoId} />
        </Card>
      )}

      {documentos.length === 0 ? (
        <EmptyState icon={<FileText size={28} aria-hidden />} title="Nenhum documento enviado" description="Envie os documentos do fechamento para conferir a leitura e executar a análise." />
      ) : (
        <Card as="section" className="overflow-x-auto p-4">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-border text-left text-micro uppercase tracking-wide text-fg-muted">
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="py-2 pr-3 font-medium">Reconhecido como</th>
                <th className="py-2 pr-3 font-medium">Leitura</th>
                <th className="py-2 pr-3 font-medium text-right">Tamanho</th>
                <th className="py-2 pr-3 font-medium">Enviado em</th>
                <th className="py-2 pr-3 font-medium">Na análise</th>
                <th className="py-2 font-medium sr-only">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id} className={`border-b border-border last:border-0 align-top${d.ativo ? "" : " text-fg-muted"}`}>
                  <td className="py-2.5 pr-3 max-w-[280px]">
                    <a href={`/api/revisao-contabil/documentos/${d.id}`} target="_blank" rel="noopener" className="break-words text-brand hover:underline">
                      {d.nome}
                    </a>
                  </td>
                  <td className="py-2.5 pr-3">{d.tipo}</td>
                  <td className="py-2.5 pr-3">
                    {quarentena.has(d.nome) ? (
                      <Selo tom="perigo">Em quarentena (R01)</Selo>
                    ) : d.interpretado ? (
                      <Selo tom="sucesso">Interpretado</Selo>
                    ) : (
                      <Selo tom="neutro">Só arquivado</Selo>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">{formatarBytes(d.tamanho)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{formatInstantDateTime(d.createdAt)}</td>
                  <td className="py-2.5 pr-3">
                    <DocumentoNaAnalise fechamentoId={fechamentoId} documentoId={d.id} ativo={d.ativo} nome={d.nome} podeAgir={podeAgir} />
                  </td>
                  <td className="py-2.5">
                    <div className="flex justify-end gap-1">
                      <Link href={`/revisao-contabil/${fechamentoId}/documentos/${d.id}`} className="rounded-md px-2 py-1 text-button-sm text-brand hover:bg-surface-hover">
                        Conferir leitura
                      </Link>
                      {podeAgir && <ExcluirDocumento fechamentoId={fechamentoId} documentoId={d.id} nome={d.nome} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
