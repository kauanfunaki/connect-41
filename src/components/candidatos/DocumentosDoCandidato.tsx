"use client";

import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Selo } from "@/components/ui/Selo";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import { IconeDoArquivo } from "./IconeDoArquivo";

export type DocumentoDaFicha = {
  id: string;
  fileName: string;
  /** "Currículo" */
  categoria: string;
  /** "04/10" */
  enviadoEm: string;
  enviadoPor: string;
  sensitive: boolean;
  expiresAtLabel: string | null;
  expired: boolean;
};

type Props = {
  personId: string;
  documentos: DocumentoDaFicha[];
  /** A linha do bloco fechado — `resumoDosDocumentos`. */
  resumo: string;
  podeAnexar: boolean;
};

/**
 * Documentos da ficha do candidato, recolhidos (escolha 4A do Kauan,
 * 14/10/2026): o bloco começa fechado e a linha já diz quantos arquivos há,
 * de que tipo e quantos são sensíveis. A área de soltar arquivo e os campos do
 * envio — que ficavam abertos o tempo todo — só aparecem ao clicar em
 * "Anexar", numa janela pequena. O envio é o mesmo das outras fichas.
 */
export function DocumentosDoCandidato({ personId, documentos, resumo, podeAnexar }: Props) {
  const [anexando, setAnexando] = useState(false);

  return (
    <div className="relative rounded-lg border border-border bg-surface shadow-xs">
      {/* Fora do cabeçalho: o cabeçalho já é um botão, e um botão não mora
          dentro de outro (o mesmo arranjo do `BlocoRecolhivel`). */}
      {podeAnexar && (
        <div className="absolute right-4 top-4 flex h-7 items-center">
          <Button type="button" variant="secondary" size="xs" onClick={() => setAnexando(true)}>
            <Plus size={13} /> Anexar
          </Button>
        </div>
      )}
      <Accordion
        classeDoCabecalho={`w-full px-5 py-4 text-section leading-7 ${podeAnexar ? "pr-28" : ""}`.trim()}
        classeDoConteudo="px-5 pb-4"
        titulo={
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-semibold text-fg">Documentos</span>
            <span className="text-ui text-fg-muted tabular-nums">{resumo}</span>
          </span>
        }
      >
        {documentos.length === 0 ? (
          <p className="text-ui text-fg-muted">Nenhum documento anexado ainda.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {documentos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
                <IconeDoArquivo nome={d.fileName} />
                <div className="min-w-0 flex-1 basis-40">
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-ui font-medium text-fg hover:text-brand hover:underline"
                    title={d.fileName}
                  >
                    {d.fileName}
                  </a>
                  <p className="truncate text-helper text-fg-muted">
                    {d.categoria} · <span className="tnum">{d.enviadoEm}</span> · {d.enviadoPor}
                  </p>
                </div>
                {(d.sensitive || d.expiresAtLabel) && (
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                    {d.expiresAtLabel && (
                      <Selo tom={d.expired ? "perigo" : "atencao"}>
                        {d.expired ? `Vencido em ${d.expiresAtLabel}` : `Vence em ${d.expiresAtLabel}`}
                      </Selo>
                    )}
                    {d.sensitive && (
                      <Selo tom="atencao" className="gap-1">
                        <Lock size={10} aria-hidden /> Sensível
                      </Selo>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Accordion>

      {podeAnexar && (
        <Modal open={anexando} onClose={() => setAnexando(false)} title="Anexar documento" maxWidth="max-w-xl">
          <DocumentUploadForm entityType="PERSON" entityId={personId} onEnviado={() => setAnexando(false)} />
        </Modal>
      )}
    </div>
  );
}
