"use client";

import { useState, useTransition } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useToast } from "@/components/ui/Toast";
import { salvarModeloDoTermo } from "@/app/(app)/honorarios/termo/actions";

type Props = {
  /** O modelo atual, ou null quando o escritório ainda não enviou. */
  modelo: { nomeArquivo: string; cidade: string; enviadoPor: string; atualizadoEm: string } | null;
};

/**
 * "Modelo do termo" (gerir): o .docx do escritório com os campos
 * {CONTRATANTE_TEXTO}, {DATA_DOCUMENTO} e {NOME_SOCIO_ASSINATURA} — os do
 * Aditiva Pronto, então o modelo de lá serve como está.
 */
export function ModeloDoTermo({ modelo }: Props) {
  const toast = useToast();
  const [aberta, setAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [enviando, iniciar] = useTransition();

  function enviar(form: FormData) {
    setErro(null);
    setAvisos([]);
    iniciar(async () => {
      const r = await salvarModeloDoTermo(form).catch(() => ({ ok: false as const, erro: "Não deu para enviar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Modelo do termo salvo.");
      if (r.avisos.length > 0) setAvisos(r.avisos);
      else setAberta(false);
    });
  }

  return (
    <>
      <Button variant={modelo ? "secondary" : "primary"} size="sm" onClick={() => setAberta(true)}>
        <FileUp size={14} /> Modelo do termo
      </Button>
      <Modal open={aberta} onClose={() => !enviando && setAberta(false)} title="Modelo do termo aditivo" maxWidth="max-w-xl">
        <form action={enviar} className="flex flex-col gap-4">
          <p className="text-helper text-fg-secondary">
            O arquivo do Word com o texto do termo. Onde vão os dados da empresa, escreva os campos entre chaves:{" "}
            <code className="text-fg">{"{CONTRATANTE_TEXTO}"}</code> (o parágrafo do contratante),{" "}
            <code className="text-fg">{"{DATA_DOCUMENTO}"}</code> e <code className="text-fg">{"{NOME_SOCIO_ASSINATURA}"}</code>. O modelo do Aditiva Pronto já
            vem assim.
          </p>
          {modelo && (
            <p className="rounded-md border border-border-soft px-3 py-2 text-fs-2 text-fg">
              Atual: <strong>{modelo.nomeArquivo}</strong> — enviado por {modelo.enviadoPor} em {modelo.atualizadoEm}.
            </p>
          )}
          <FileDropzoneField id="modelo-do-termo" name="modelo" accept=".docx" maxSizeMb={5} required={!modelo} />
          <CampoForm label="Cidade da data" htmlFor="cidade-do-termo" required helper="Sai no fim do termo: “Curitiba, 12 de novembro de 2026.”">
            <Input id="cidade-do-termo" name="cidade" defaultValue={modelo?.cidade ?? "Curitiba"} maxLength={80} required />
          </CampoForm>
          {erro && <Aviso>{erro}</Aviso>}
          {avisos.length > 0 && (
            <Aviso tom="atencao">
              Salvo, com {avisos.length === 1 ? "um ponto" : "pontos"} para conferir: {avisos.join(" ")}
            </Aviso>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberta(false)} disabled={enviando}>
              {avisos.length > 0 ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" loading={enviando} loadingLabel="Conferindo…">
              Salvar modelo
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
