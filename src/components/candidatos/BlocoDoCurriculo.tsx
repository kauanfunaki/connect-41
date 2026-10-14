"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Paperclip, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import { formatInstantDate } from "@/lib/format";
import { listaNatural } from "@/lib/recrutamento/fichaDoCandidato";
import type { AiExtractState } from "@/app/(app)/candidatos/[id]/ai-actions";
import { IconeDoArquivo } from "./IconeDoArquivo";

export type ArquivoDoCurriculo = {
  nome: string;
  /** Rota que abre o arquivo (`/api/resumes/…` ou `/api/documents/…`). */
  href: string;
  /** No canto do título: "veio pelo portal em 04/10", "anexado em 04/10". */
  origem: string;
  /** Embaixo do nome: "Candidatura Auxiliar de produção", "Anexado por Helena Prado". */
  contexto: string | null;
  /** A IA só lê PDF. */
  pdf: boolean;
};

export type ResumoDoCurriculo = {
  texto: string;
  /** "14/10" */
  lidoEm: string;
  preencheu: string[];
  /** O resumo foi lido de outro arquivo — um currículo anterior ao que está no bloco. */
  deOutroArquivo: boolean;
};

type Props = {
  personId: string;
  arquivo: ArquivoDoCurriculo | null;
  resumo: ResumoDoCurriculo | null;
  /** Gerir o Recrutamento: ler com IA e anexar. */
  podeEditar: boolean;
  ler: () => Promise<AiExtractState>;
};

/**
 * O bloco Currículo da ficha do candidato (escolha 3B do Kauan, 14/10/2026):
 * o arquivo, o "Ler com IA" ao lado dele e o resumo logo abaixo. Era um bloco
 * inteiro só para o botão "Analisar currículo", solto entre Candidaturas e
 * Documentos — e o resumo sumia ao recarregar; agora fica guardado.
 *
 * "Ler com IA" é o mesmo de antes: lê o PDF, preenche os campos vazios da
 * ficha e escreve um resumo profissional. O nome mudou para não confundir com
 * a "Triagem de currículos" da vaga, que dá nota.
 */
export function BlocoDoCurriculo({ personId, arquivo, resumo, podeEditar, ler }: Props) {
  const [lendo, startLer] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [lidoAgora, setLidoAgora] = useState<ResumoDoCurriculo | null>(null);
  const [anexando, setAnexando] = useState(false);

  function lerComIa() {
    setErro(null);
    startLer(async () => {
      const r = await ler();
      if (!r) return;
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setLidoAgora({
        texto: r.summary,
        lidoEm: formatInstantDate(new Date(r.readAt), { day: "2-digit", month: "2-digit" }),
        preencheu: r.filled,
        deOutroArquivo: false,
      });
    });
  }

  // O que acabou de ser lido vale sobre o guardado: sem a tabela nova (deploy
  // antes da migration) o guardado não vem, e o resumo fica na tela até
  // recarregar — como era antes.
  const mostrado = lidoAgora ?? resumo;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-section font-semibold text-fg">Currículo</h2>
        {arquivo && <span className="text-helper text-fg-muted">{arquivo.origem}</span>}
      </div>

      {arquivo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
          <IconeDoArquivo nome={arquivo.nome} />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-ui font-semibold text-fg" title={arquivo.nome}>
              {arquivo.nome}
            </p>
            {arquivo.contexto && <p className="truncate text-helper text-fg-muted">{arquivo.contexto}</p>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button href={arquivo.href} nativo target="_blank" rel="noreferrer" variant="secondary" size="sm">
              <ExternalLink size={13} /> Abrir
            </Button>
            {podeEditar && arquivo.pdf && (
              <Button type="button" variant="primary" size="sm" onClick={lerComIa} loading={lendo} loadingLabel="Lendo…">
                <Sparkles size={13} /> Ler com IA
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border-strong p-3">
          <p className="min-w-0 flex-1 basis-56 text-ui text-fg-muted">
            Nenhum currículo na ficha. Com o currículo em PDF, a IA lê o arquivo, preenche os campos vazios e escreve um resumo.
          </p>
          {podeEditar && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setAnexando(true)}>
              <Paperclip size={13} /> Anexar currículo
            </Button>
          )}
        </div>
      )}

      {arquivo && !arquivo.pdf && podeEditar && (
        <p className="mt-2 text-helper text-fg-muted">
          A IA só lê currículo em PDF.{" "}
          <Button type="button" variant="link" onClick={() => setAnexando(true)}>
            Anexar o currículo em PDF
          </Button>
        </p>
      )}

      {erro && <Aviso className="mt-3">{erro}</Aviso>}

      {mostrado && (
        <div className="mt-3 space-y-1.5 rounded-md border border-brand/20 bg-brand/5 p-3">
          <p className="flex items-center gap-1.5 text-helper font-semibold text-brand">
            <Sparkles size={13} aria-hidden /> Resumo da IA · lido em <span className="tnum">{mostrado.lidoEm}</span>
            {mostrado.deOutroArquivo && <span className="font-normal text-fg-muted">· de um currículo anterior</span>}
          </p>
          <p className="whitespace-pre-wrap text-ui leading-relaxed text-fg">{mostrado.texto}</p>
          <p className="text-helper text-fg-muted">
            {mostrado.preencheu.length > 0
              ? `Preencheu na ficha: ${listaNatural(mostrado.preencheu)}.`
              : "Não havia campo vazio para preencher na ficha."}
          </p>
        </div>
      )}

      {podeEditar && (
        <Modal open={anexando} onClose={() => setAnexando(false)} title="Anexar currículo" maxWidth="max-w-xl">
          <p className="mb-4 text-ui text-fg-secondary">O arquivo entra nos documentos da ficha, na categoria Currículo.</p>
          <DocumentUploadForm
            entityType="PERSON"
            entityId={personId}
            categoriaInicial="CURRICULO"
            accept=".pdf"
            onEnviado={() => setAnexando(false)}
          />
        </Modal>
      )}
    </Card>
  );
}
