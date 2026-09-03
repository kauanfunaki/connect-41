"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, XCircle, Building2, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { nomeExibicao } from "@/lib/companyName";
import type { EstadoDaEntrada, Veredito } from "@/app/(app)/documentos-fiscais/entrada/actions";

type Empresa = { id: string; name: string; displayName: string | null };

type Props = {
  empresas: Empresa[];
  action: (anterior: EstadoDaEntrada, form: FormData) => Promise<EstadoDaEntrada>;
};

const APARENCIA: Record<
  Veredito["situacao"],
  { icone: React.ReactNode; classe: string; rotulo: string }
> = {
  aceito: { icone: <CheckCircle2 size={15} />, classe: "text-success", rotulo: "Aceito" },
  duplicata: { icone: <Copy size={15} />, classe: "text-warning", rotulo: "Duplicata" },
  invalido: { icone: <XCircle size={15} />, classe: "text-danger", rotulo: "Inválido" },
  empresa_nao_cadastrada: { icone: <Building2 size={15} />, classe: "text-danger", rotulo: "Empresa não cadastrada" },
  ambigua: { icone: <HelpCircle size={15} />, classe: "text-warning", rotulo: "Ambígua" },
};

export function EntradaXmlForm({ empresas, action }: Props) {
  const [estado, formAction, pendente] = useActionState<EstadoDaEntrada, FormData>(action, null);
  const [arquivos, setArquivos] = useState<ArquivoNaFila[]>([]);
  const [empresaId, setEmpresaId] = useState("");

  const vereditos = estado && "vereditos" in estado ? estado.vereditos : null;
  const erro = estado && "erro" in estado ? estado.erro : null;

  // O FormData é montado à mão porque a fila do FileDropzone vive em estado do
  // React, não em `<input>` do DOM — um `<form action={...}>` não teria o que
  // serializar. `formAction` aceita a carga direto, então o caminho continua
  // sendo o da Server Action, sem rota de upload paralela.
  function enviar() {
    if (arquivos.length === 0) return;
    const fd = new FormData();
    for (const a of arquivos) fd.append("xmls", a.file);
    if (empresaId) fd.set("companyId", empresaId);
    formAction(fd);
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="space-y-4">
          <CampoForm
            label="Arquivos XML"
            htmlFor="xmls"
            helper="NF-e, NFC-e, CT-e e NFS-e (ABRASF e padrão nacional). Município com layout próprio pode ser recusado — o veredito diz qual campo faltou."
          >
            <FileDropzone
              accept=".xml,text/xml,application/xml"
              maxSizeMb={5}
              multiple
              arquivos={arquivos}
              desabilitado={pendente}
              onAdicionar={(files) =>
                setArquivos((atual) => [
                  ...atual,
                  ...files.map((file) => ({
                    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
                    file,
                    progresso: 0,
                    estado: "pendente" as const,
                  })),
                ])
              }
              onRemover={(id) => setArquivos((atual) => atual.filter((a) => a.id !== id))}
            />
          </CampoForm>

          <CampoForm
            label="Empresa"
            htmlFor="companyId"
            helper="Em branco, a empresa é deduzida do CNPJ do XML. Escolha só quando as duas pontas do documento forem empresas do escritório."
          >
            <Select
              id="companyId"
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              disabled={pendente}
            >
              <option value="">Deduzir do XML</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {nomeExibicao(e)}
                </option>
              ))}
            </Select>
          </CampoForm>

          {erro && <p className="text-[length:var(--fs-helper)] text-danger">{erro}</p>}

          <Button type="button" onClick={enviar} disabled={pendente || arquivos.length === 0}>
            {pendente ? "Lendo…" : `Importar${arquivos.length > 0 ? ` ${arquivos.length}` : ""}`}
          </Button>
        </div>
      </Card>

      {vereditos && (
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Resultado</h2>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
            {vereditos.filter((v) => v.situacao === "aceito").length} de {vereditos.length} entraram no acervo.
            Cada arquivo tem seu veredito — nada é aceito ou recusado em bloco.
          </p>
          <ul className="divide-y divide-border">
            {vereditos.map((v, i) => {
              const ap = APARENCIA[v.situacao];
              return (
                <li key={`${v.arquivo}-${i}`} className="flex items-start gap-3 py-2.5">
                  <span className={`flex-shrink-0 mt-0.5 ${ap.classe}`}>{ap.icone}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[length:var(--fs-ui)] text-fg truncate">{v.arquivo}</p>
                    <p className="text-[length:var(--fs-micro)] text-fg-muted">
                      <span className={ap.classe}>{ap.rotulo}</span>
                      {" · "}
                      {v.situacao === "aceito" ? `em ${v.empresa}` : v.detalhe}
                    </p>
                  </div>
                  {v.situacao === "aceito" && (
                    <Link
                      href={`/documentos-fiscais/${v.documentoId}`}
                      className="flex-shrink-0 text-[length:var(--fs-ui)] font-medium text-brand hover:underline"
                    >
                      Abrir
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
