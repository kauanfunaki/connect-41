"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { FileText, Plus, ScanText, Sparkles, TriangleAlert, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { empresasParaNovaLicenca, lerPdfDaLicenca, salvarLicenca, type LicencaState } from "@/app/(app)/licencas/actions";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import type { LeituraDaLicenca } from "@/lib/societario/leituraDaLicenca";
import { TIPOS_SUGERIDOS, MAX_TIPO, MAX_NUMERO, MAX_OBSERVACOES } from "@/lib/societario/licenca-form";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

export type OrgaoDaLicenca = { id: string; nome: string };

/** Uma licença pronta para o formulário de edição — datas já como "AAAA-MM-DD". */
export type LicencaParaEditar = {
  id: string;
  companyId: string;
  empresaNome: string;
  kind: string;
  organId: string | null;
  number: string | null;
  issuedAt: string;
  expiresAt: string;
  notes: string | null;
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  orgaos: OrgaoDaLicenca[];
  /** Obrigatório para criar; na edição a empresa é fixa. */
  empresas?: Opcao[];
  licenca?: LicencaParaEditar;
};

export function LicencaModal({ open, onClose, orgaos, empresas, licenca }: ModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={licenca ? "Editar licença" : "Nova licença"} maxWidth="max-w-lg">
      {/* Montado só quando aberto: o estado da ação zera a cada abertura, e o
          "salvo" da vez anterior não reaparece num formulário novo. */}
      {open && <Formulario onClose={onClose} orgaos={orgaos} empresas={empresas} licenca={licenca} />}
    </Modal>
  );
}

/** O que a IA leu do PDF, e o próprio PDF, que vai para os Arquivos com o "Salvar". */
type Lido = { leitura: LeituraDaLicenca; arquivo: File };

function Formulario({ onClose, orgaos, empresas, licenca }: Omit<ModalProps, "open">) {
  const formRef = useRef<HTMLFormElement>(null);
  const [lido, setLido] = useState<Lido | null>(null);
  // A ação do formulário lê o PDF por aqui: o estado capturado nela pode ser o de antes da leitura.
  const lidoRef = useRef<Lido | null>(null);
  // Os campos que a leitura preenche são remontados a cada leitura, com o lido como valor inicial.
  const [versao, setVersao] = useState(0);
  const [estado, action, isPending] = useActionState(async (prev: LicencaState, form: FormData) => {
    if (lidoRef.current) form.set("pdf", lidoRef.current.arquivo);
    const r = await salvarLicenca(prev, form);
    if (r && "success" in r) onClose();
    return r;
  }, null);

  const prefixo = licenca ? `lic-${licenca.id}` : "lic-nova";
  const l = lido?.leitura;
  const confira = (c: LeituraDaLicenca["conferir"][number]) => (l?.conferir.includes(c) ? "A IA não achou no PDF: confira." : undefined);
  // Lido vence o que estava; o que a IA não achou fica como estava.
  const numero = l?.numero ?? licenca?.number ?? "";
  const emissao = l?.emissaoKey ?? licenca?.issuedAt ?? "";
  const validade = l?.semValidade ? "" : (l?.validadeKey ?? licenca?.expiresAt ?? "");
  // O tipo só vem da leitura na licença nova: na edição, o nome que o setor deu fica.
  const tipo = licenca?.kind ?? l?.tipo ?? "";

  return (
    <div className="flex flex-col gap-4">
    <LerPdf
      lido={lido}
      empresaDoFormulario={() => licenca?.companyId ?? String(new FormData(formRef.current ?? undefined).get("companyId") ?? "")}
      aoLer={(novo) => {
        lidoRef.current = novo;
        setLido(novo);
        setVersao((v) => v + 1);
      }}
      aoDescartar={() => {
        lidoRef.current = null;
        setLido(null);
        setVersao((v) => v + 1);
      }}
    />
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      {licenca && <input type="hidden" name="id" value={licenca.id} />}

      {licenca ? (
        // Na edição a empresa é fixa: campo só de leitura, com o mesmo rótulo e
        // a mesma altura dos outros, em vez de um texto solto de outro tamanho.
        <CampoForm label="Empresa" htmlFor={`${prefixo}-empresa`}>
          <Input id={`${prefixo}-empresa`} value={licenca.empresaNome} readOnly />
          <input type="hidden" name="companyId" value={licenca.companyId} />
        </CampoForm>
      ) : (
        <CampoForm label="Empresa" htmlFor={`${prefixo}-empresa`} required>
          <SearchableSelect id={`${prefixo}-empresa`} name="companyId" options={empresas ?? []} placeholder="Buscar empresa…" avatar lembrarRecentes="empresas" />
        </CampoForm>
      )}

      <CampoForm
        label="Licença"
        htmlFor={`${prefixo}-tipo`}
        required
        helper="Escolha uma sugestão ou escreva como o órgão chama."
      >
        {/* Sugestões próprias (08/10/2026), no lugar do `<datalist>`: a lista
            do navegador vinha misturada ao histórico do Chrome e sem o tema. */}
        <CampoComSugestoes
          id={`${prefixo}-tipo`}
          name="kind"
          sugestoes={TIPOS_SUGERIDOS}
          maxLength={MAX_TIPO}
          key={`tipo-${versao}`}
          defaultValue={tipo}
          required
        />
      </CampoForm>

      {/* Número é curto: coluna estreita, e o órgão fica com o resto. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_11rem]">
        <CampoForm label="Órgão" htmlFor={`${prefixo}-orgao`}>
          <Select id={`${prefixo}-orgao`} name="organId" defaultValue={licenca?.organId ?? ""}>
            <option value="">Sem órgão cadastrado</option>
            {orgaos.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Número" htmlFor={`${prefixo}-numero`} helper={confira("numero")}>
          <Input key={`numero-${versao}`} id={`${prefixo}-numero`} name="number" maxLength={MAX_NUMERO} defaultValue={numero} />
        </CampoForm>
      </FieldGrid>

      <FieldGrid>
        <CampoForm label="Emissão" htmlFor={`${prefixo}-emissao`} helper={confira("emissao")}>
          <CampoData key={`emissao-${versao}`} id={`${prefixo}-emissao`} name="issuedAt" defaultValue={emissao} />
        </CampoForm>
        <CampoForm
          label="Validade"
          htmlFor={`${prefixo}-validade`}
          helper={confira("validade") ?? (l?.semValidade ? "O PDF diz que não vence: fica em branco." : "Em branco quando não vence — inscrição municipal, por exemplo.")}
        >
          <CampoData key={`validade-${versao}`} id={`${prefixo}-validade`} name="expiresAt" defaultValue={validade} />
        </CampoForm>
      </FieldGrid>

      <CampoForm label="Observações" htmlFor={`${prefixo}-obs`}>
        <Textarea id={`${prefixo}-obs`} name="notes" rows={3} maxLength={MAX_OBSERVACOES} defaultValue={licenca?.notes ?? ""} />
      </CampoForm>

      {estado && "error" in estado && (
        <Aviso>{estado.error}</Aviso>
      )}

      <FormFooter
        pending={isPending}
        submitLabel={licenca ? "Salvar" : "Cadastrar"}
        onCancel={onClose}
      />
    </form>
    </div>
  );
}

/**
 * "Ler do PDF" (04/11/2026): a pessoa escolhe o PDF do alvará ou da licença, a
 * IA lê e o formulário se preenche. Fica FORA do `<form>`: o PDF vai no "Salvar"
 * uma vez só, anexado pelo formulário, e nada é gravado antes disso.
 */
function LerPdf({
  lido,
  empresaDoFormulario,
  aoLer,
  aoDescartar,
}: {
  lido: Lido | null;
  empresaDoFormulario: () => string;
  aoLer: (lido: Lido) => void;
  aoDescartar: () => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, startTransition] = useTransition();
  const [escolha, setEscolha] = useState(0);

  function ler() {
    if (!arquivo) return;
    setErro(null);
    const dados = new FormData();
    dados.set("companyId", empresaDoFormulario());
    dados.set("pdf", arquivo);
    startTransition(async () => {
      const r = await lerPdfDaLicenca(dados);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      aoLer({ leitura: r.leitura, arquivo });
      setArquivo(null);
      setEscolha((v) => v + 1);
    });
  }

  if (lido) {
    const { leitura } = lido;
    return (
      <div className="flex flex-col gap-2">
        <Aviso tom={leitura.avisos.length > 0 ? "atencao" : "info"} icone={leitura.avisos.length > 0 ? <TriangleAlert /> : <Sparkles />}>
          <div className="flex flex-col gap-1.5">
            <p className="text-fg">
              <strong>Lido pela IA</strong> de {lido.arquivo.name}. Confira antes de salvar: o PDF vai para Arquivos › Societário junto com a licença.
            </p>
            {leitura.avisos.length > 0 && (
              <ul className="list-disc pl-4 text-fg-secondary">
                {leitura.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
          </div>
        </Aviso>
        <Button type="button" variant="ghost" size="xs" className="self-start" onClick={aoDescartar}>
          <X size={12} /> Descartar a leitura e o PDF
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-3">
      <div className="flex items-center gap-2 text-fs-2 text-fg">
        <ScanText size={16} className="flex-shrink-0 text-brand" />
        <span>
          <strong>Ler do PDF</strong> — a IA lê o alvará ou a licença e preenche número, emissão e validade. Nada é gravado antes de você conferir e salvar.
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <FileDropzoneField key={escolha} name="pdf-para-ler" accept=".pdf" maxSizeMb={10} compacto onFileChange={setArquivo} />
        </div>
        <Button type="button" variant="secondary" onClick={ler} disabled={!arquivo} loading={lendo} loadingLabel="Lendo…">
          <FileText size={14} /> Ler do PDF
        </Button>
      </div>
      {erro && <p className="text-helper text-danger">{erro}</p>}
    </div>
  );
}

/**
 * O botão de cadastrar, com o formulário. As empresas do seletor são pedidas
 * na primeira abertura (12/11/2026, bug-645) e guardadas para as próximas; o
 * pedido já sai quando o mouse passa no botão, para a janela abrir pronta.
 */
export function NovaLicenca({ orgaos }: { orgaos: OrgaoDaLicenca[] }) {
  const [aberto, setAberto] = useState(false);
  const [empresas, setEmpresas] = useState<Opcao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O pedido em andamento (ou já resolvido): passar o mouse e clicar não pedem duas vezes.
  const pedido = useRef<Promise<boolean> | null>(null);
  const [carregando, startCarregar] = useTransition();

  function pedirEmpresas(): Promise<boolean> {
    pedido.current ??= empresasParaNovaLicenca()
      .then((r) => {
        if ("error" in r) throw new Error(r.error);
        setErro(null);
        setEmpresas(r.empresas);
        return true;
      })
      .catch((e: unknown) => {
        // Falhou: o próximo clique tenta de novo.
        pedido.current = null;
        setErro(e instanceof Error && e.message ? e.message : "Não deu para carregar as empresas. Tente de novo.");
        return false;
      });
    return pedido.current;
  }

  function abrir() {
    startCarregar(async () => {
      if (await pedirEmpresas()) setAberto(true);
    });
  }

  return (
    <>
      <Button variant="primary" onClick={abrir} onMouseEnter={() => void pedirEmpresas()} onFocus={() => void pedirEmpresas()} loading={carregando} loadingLabel="Abrindo…">
        <Plus size={14} /> Nova licença
      </Button>
      <LicencaModal open={aberto} onClose={() => setAberto(false)} empresas={empresas ?? []} orgaos={orgaos} />
      {erro && <span className="text-helper text-danger">{erro}</span>}
    </>
  );
}
