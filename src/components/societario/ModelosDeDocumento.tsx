"use client";

import { useState, useTransition } from "react";
import { Download, FilePlus2, FileText, Pencil, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { CampoForm } from "@/components/ui/CampoForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { Input } from "@/components/ui/Input";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { CAMPOS, ROTULO_DO_TIPO, TIPOS_DE_MODELO, type TipoDeModelo } from "@/lib/societario/modelos/campos";
import {
  ativarModeloDeDocumento,
  baixarModeloDeDocumento,
  baixarModeloDeExemplo,
  excluirModeloDeDocumento,
  salvarModeloDeDocumento,
} from "@/app/(app)/processos/modelos/actions";
import { baixarDocx } from "./baixarDocx";

export type ModeloNaTela = {
  id: string;
  tipo: TipoDeModelo;
  nome: string;
  nomeArquivo: string;
  ativo: boolean;
  enviadoPor: string;
  atualizadoEm: string;
  gerados: number;
};

const GRUPOS = [...new Set(CAMPOS.map((c) => c.grupo))];

/** A lista dos campos, por grupo — a referência de quem monta o .docx. */
function CamposDoModelo() {
  return (
    <BlocoRecolhivel titulo="Campos do modelo" resumo={`${CAMPOS.length} campos entre chaves, como {EMPRESA_RAZAO_SOCIAL}`}>
      <div className="flex flex-col gap-4 text-fs-2">
        <p className="text-fg-secondary">
          No .docx, escreva o campo entre chaves onde o dado deve entrar. Campo sem dado no cadastro sai em branco. A lista de sócios repete o trecho para cada sócio:
          abra com <code className="text-fg">{"{#SOCIOS}"}</code> e feche com <code className="text-fg">{"{/SOCIOS}"}</code>; dentro dela vão os campos do sócio, como{" "}
          <code className="text-fg">{"{TEXTO}"}</code> e <code className="text-fg">{"{QUOTAS}"}</code>.
        </p>
        {GRUPOS.map((g) => (
          <div key={g} className="flex flex-col gap-1">
            <h3 className="text-label font-semibold text-fg">{g}</h3>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              {CAMPOS.filter((c) => c.grupo === g).map((c) => (
                <div key={c.nome} className="contents">
                  <dt>
                    <code className="break-all text-fg">{`{${c.nome}}`}</code>
                  </dt>
                  <dd className="text-fg-secondary">{c.descricao}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </BlocoRecolhivel>
  );
}

function FormularioDoModelo({ modelo, aoFechar }: { modelo: ModeloNaTela | null; aoFechar: () => void }) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [enviando, iniciar] = useTransition();

  function enviar(form: FormData) {
    setErro(null);
    setAvisos([]);
    iniciar(async () => {
      const r = await salvarModeloDeDocumento(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success(modelo ? "Modelo salvo." : "Modelo enviado.");
      if (r.avisos.length > 0) setAvisos(r.avisos);
      else aoFechar();
    });
  }

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {modelo && <input type="hidden" name="id" value={modelo.id} />}
      <CampoForm label="Tipo" htmlFor="modelo-tipo" required>
        <Select id="modelo-tipo" name="tipo" defaultValue={modelo?.tipo ?? "ALTERACAO_CONTRATUAL"} required>
          {TIPOS_DE_MODELO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_DO_TIPO[t]}
            </option>
          ))}
        </Select>
      </CampoForm>
      <CampoForm label="Nome" htmlFor="modelo-nome" required dica="Como aparece no processo, como “Alteração de endereço”.">
        <Input id="modelo-nome" name="nome" defaultValue={modelo?.nome ?? ""} maxLength={120} required />
      </CampoForm>
      <CampoForm label={modelo ? "Trocar o arquivo (opcional)" : "Arquivo .docx"} htmlFor="modelo-arquivo" required={!modelo}>
        <FileDropzoneField id="modelo-arquivo" name="arquivo" accept=".docx" maxSizeMb={5} required={!modelo} />
      </CampoForm>
      {modelo && (
        <p className="text-fs-2 text-fg-secondary">
          Atual: <strong className="text-fg">{modelo.nomeArquivo}</strong>, enviado por {modelo.enviadoPor} em {modelo.atualizadoEm}.
        </p>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      {avisos.length > 0 && (
        <Aviso tom="atencao">
          Salvo, com {avisos.length === 1 ? "um ponto" : "pontos"} para conferir: {avisos.join(" ")}
        </Aviso>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={aoFechar} disabled={enviando}>
          {avisos.length > 0 ? "Fechar" : "Cancelar"}
        </Button>
        <Button type="submit" loading={enviando} loadingLabel="Conferindo…">
          {modelo ? "Salvar" : "Enviar modelo"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Os modelos .docx do escritório (27/11/2026, funcionalidade-891): enviar,
 * trocar, baixar, desativar e excluir. Só a coordenação vê esta tela.
 */
export function ModelosDeDocumento({ modelos }: { modelos: ModeloNaTela[] }) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [editando, setEditando] = useState<ModeloNaTela | "novo" | null>(null);
  const [baixando, iniciarDownload] = useTransition();

  function baixar(acao: () => Promise<{ ok: true; nomeArquivo: string; conteudoBase64: string } | { ok: false; erro: string }>) {
    iniciarDownload(async () => {
      const r = await acao().catch(() => ({ ok: false as const, erro: "Não deu para baixar agora. Tente de novo." }));
      if (!r.ok) return toast.error(r.erro);
      baixarDocx(r.nomeArquivo, r.conteudoBase64);
    });
  }

  function ativar(m: ModeloNaTela) {
    requestConfirm(
      {
        title: m.ativo ? `Desativar "${m.nome}"?` : `Ativar "${m.nome}"?`,
        description: m.ativo ? "Sai da lista dos processos. Os documentos já gerados com ele continuam nos Arquivos." : "Volta para a lista dos processos.",
        confirmLabel: m.ativo ? "Desativar" : "Ativar",
      },
      async () => {
        const r = await ativarModeloDeDocumento(m.id, !m.ativo);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  function excluir(m: ModeloNaTela) {
    requestConfirm(
      {
        title: `Excluir "${m.nome}"?`,
        description:
          m.gerados > 0
            ? `O arquivo do modelo sai do Connect. Os ${m.gerados} documentos gerados com ele continuam nos Arquivos das empresas. Para só tirar da lista, desative.`
            : "O arquivo do modelo sai do Connect.",
        confirmLabel: "Excluir",
        destructive: true,
      },
      async () => {
        const r = await excluirModeloDeDocumento(m.id);
        return r.ok ? null : { error: r.erro };
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditando("novo")}>
          <FilePlus2 size={14} aria-hidden /> Enviar modelo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => baixar(baixarModeloDeExemplo)} disabled={baixando}>
          <Download size={14} aria-hidden /> Baixar a lista de campos (.docx)
        </Button>
      </div>

      <CamposDoModelo />

      {modelos.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhum modelo enviado"
          description="Envie o .docx do contrato social, da alteração ou do distrato com os campos entre chaves. Ele aparece em todo processo, em “Gerar documento”."
        />
      ) : (
        <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                {["Modelo", "Tipo", "Arquivo", "Gerados", "Atualizado", ""].map((c, i) => (
                  <th key={i} className="px-3 py-2">
                    {c || <span className="sr-only">Ações</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelos.map((m) => (
                <tr key={m.id} className={m.ativo ? undefined : "text-fg-muted"}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{m.nome}</span> {!m.ativo && <Selo tom="neutro">Desativado</Selo>}
                  </td>
                  <td className="px-3 py-2">{ROTULO_DO_TIPO[m.tipo]}</td>
                  <td className="px-3 py-2 break-all">{m.nomeArquivo}</td>
                  <td className="px-3 py-2 tabular-nums">{m.gerados}</td>
                  <td className="px-3 py-2">
                    {m.atualizadoEm} · {m.enviadoPor}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MenuDeMaisAcoes rotulo={`Ações do modelo ${m.nome}`} width={220}>
                      <ItemDoMenu icone={<Download />} onClick={() => baixar(() => baixarModeloDeDocumento(m.id))}>
                        Baixar o .docx
                      </ItemDoMenu>
                      <ItemDoMenu icone={<Pencil />} onClick={() => setEditando(m)}>
                        Editar ou trocar o arquivo
                      </ItemDoMenu>
                      <ItemDoMenu icone={<Power />} onClick={() => ativar(m)}>
                        {m.ativo ? "Desativar" : "Ativar"}
                      </ItemDoMenu>
                      <ItemDoMenu icone={<Trash2 />} danger onClick={() => excluir(m)}>
                        Excluir
                      </ItemDoMenu>
                    </MenuDeMaisAcoes>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editando !== null} onClose={() => setEditando(null)} title={editando === "novo" ? "Enviar modelo de documento" : "Editar modelo"} maxWidth="max-w-xl">
        {editando !== null && <FormularioDoModelo key={editando === "novo" ? "novo" : editando.id} modelo={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
      </Modal>
      {dialog}
    </div>
  );
}
