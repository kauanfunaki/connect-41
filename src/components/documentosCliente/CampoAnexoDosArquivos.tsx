"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Search, X } from "lucide-react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { buscarArquivosParaOEnvio } from "@/app/(app)/solicitacoes/envios/actions";
import type { ArquivoParaOEnvio } from "@/lib/envios/anexoDosArquivos";

/**
 * "Ou um arquivo dos Arquivos" (lote 2, 28/10/2026): o anexo do envio tirado
 * de uma pasta da empresa — a guia que o Serpro pôs em Guias, por exemplo —
 * sem baixar e subir de novo. Vai como `arquivoId`; o servidor copia.
 */
export function CampoAnexoDosArquivos({ companyId, inicial }: { companyId: string | null; inicial?: ArquivoParaOEnvio | null }) {
  const [escolhido, setEscolhido] = useState<ArquivoParaOEnvio | null>(inicial ?? null);
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<ArquivoParaOEnvio[] | null>(null);
  const [buscando, startTransition] = useTransition();
  // O foco segue a troca (auditoria de UX, 30/10/2026): o botão clicado some —
  // a opção da lista vira o arquivo escolhido, e o "Tirar" volta à busca — e o
  // foco caía no `body`. Escolher leva ao "Tirar"; tirar, de volta à busca.
  const tirarRef = useRef<HTMLButtonElement>(null);
  const focoDepois = useRef<"tirar" | "busca" | null>(null);
  useEffect(() => {
    const alvo = focoDepois.current;
    focoDepois.current = null;
    if (alvo === "tirar") tirarRef.current?.focus();
    else if (alvo === "busca") document.getElementById("buscarArquivo")?.focus();
  }, [escolhido]);

  if (!companyId) return null;

  function buscar() {
    const t = termo.trim();
    if (t.length < 2) return;
    startTransition(async () => setAchados(await buscarArquivosParaOEnvio(companyId!, t)));
  }

  if (escolhido) {
    return (
      <CampoForm label="Anexo dos Arquivos" htmlFor="tirarArquivo" helper="Uma cópia vai com o envio. Um anexo novo, acima, vale no lugar deste.">
        <input type="hidden" name="arquivoId" value={escolhido.id} />
        <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-ui">
          <FileText size={14} className="shrink-0 text-fg-muted" />
          <span className="min-w-0 flex-1 truncate" data-dica={`${escolhido.nome} · ${escolhido.pasta}`}>
            {escolhido.nome} <span className="text-fg-muted">· {escolhido.pasta}</span>
          </span>
          <Button
            ref={tirarRef}
            id="tirarArquivo"
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              focoDepois.current = "busca";
              setEscolhido(null);
            }}
            aria-label={`Tirar o arquivo escolhido, ${escolhido.nome}`}
          >
            <X size={12} /> Tirar
          </Button>
        </div>
      </CampoForm>
    );
  }

  return (
    <CampoForm label="Ou um arquivo dos Arquivos" htmlFor="buscarArquivo" helper="PDF ou imagem até 10 MB, de uma pasta desta empresa. Busque pelo nome.">
      <div className="flex gap-2">
        <Input
          id="buscarArquivo"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            // Enter busca em vez de mandar o formulário do envio.
            if (e.key === "Enter") {
              e.preventDefault();
              buscar();
            }
          }}
          placeholder="Ex.: DAS 09/2026"
        />
        <Button type="button" variant="secondary" onClick={buscar} loading={buscando} disabled={termo.trim().length < 2}>
          <Search size={14} /> Buscar
        </Button>
      </div>
      {achados && (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {achados.length === 0 && <li className="px-3 py-2 text-ui text-fg-muted">Nenhum PDF ou imagem com esse nome nos Arquivos da empresa.</li>}
          {achados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-ui hover:bg-surface-hover"
                onClick={() => {
                  focoDepois.current = "tirar";
                  setEscolhido(a);
                  setAchados(null);
                }}
              >
                <FileText size={14} className="shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                <span className="shrink-0 text-fg-muted">{a.pasta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CampoForm>
  );
}
