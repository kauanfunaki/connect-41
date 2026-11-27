"use client";

import { useRef, useState, useTransition } from "react";
import { Pencil, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Textarea } from "@/components/ui/Textarea";
import { TextoRecolhivel } from "@/components/ui/TextoRecolhivel";
import { useToast } from "@/components/ui/Toast";
import { formatCpf, formatarReais } from "@/lib/format";
import { aIntegralizar, LIMITE_DO_OBJETO_SOCIAL } from "@/lib/societario/quadro";
import { salvarDadosSocietariosDaEmpresa } from "@/app/(app)/empresas/[id]/socios/dados-actions";

export type DadosNaTela = {
  nire: string | null;
  /** "aaaa-mm-dd" para o campo, e o texto para mostrar. */
  juntaRegistradoEmCampo: string;
  juntaRegistradoEmTexto: string | null;
  objetoSocial: string | null;
  capitalSocial: number | null;
  capitalIntegralizado: number | null;
  responsavelLegalNome: string | null;
  responsavelLegalCpf: string | null;
  responsavelLegalRg: string | null;
  responsavelLegalCargo: string | null;
  responsavelLegalEmail: string | null;
};

type Props = {
  companyId: string;
  dados: DadosNaTela;
  /** O sócio administrador, para preencher o responsável legal com um clique. */
  administrador: { nome: string; cpf: string | null; cargo: string | null } | null;
  podeEditar: boolean;
};

const reaisNoCampo = (v: number | null) => (v === null ? "" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v));

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="text-fg-muted sm:w-44 sm:shrink-0">{rotulo}</dt>
      <dd className="min-w-0 break-words text-fg">{valor ?? <span className="text-fg-muted">—</span>}</dd>
    </div>
  );
}

/**
 * Os dados societários da ficha (27/11/2026, melhoria-892): NIRE e data do
 * registro, capital, objeto social e responsável legal — o que o Domínio
 * guarda nas abas Atividades, Responsável Legal e Quadro Societário. Fica em
 * Sócios porque é o mesmo assunto e alimenta os modelos de documento.
 */
export function DadosSocietariosDaEmpresa({ companyId, dados, administrador, podeEditar }: Props) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const falta = aIntegralizar(dados.capitalSocial, dados.capitalIntegralizado);

  function salvar(form: FormData) {
    setErro(null);
    iniciar(async () => {
      const r = await salvarDadosSocietariosDaEmpresa(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Dados societários salvos.");
      setAberto(false);
    });
  }

  function usarAdministrador() {
    const f = formRef.current;
    if (!f || !administrador) return;
    const preencher = (nome: string, valor: string) => {
      const campo = f.elements.namedItem(nome) as HTMLInputElement | null;
      if (campo) campo.value = valor;
    };
    preencher("responsavelLegalNome", administrador.nome);
    preencher("responsavelLegalCpf", administrador.cpf ? formatCpf(administrador.cpf) : "");
    preencher("responsavelLegalCargo", administrador.cargo ?? "Sócio administrador");
  }

  const tituloId = "dados-societarios";
  return (
    <Card as="section" aria-labelledby={tituloId} className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={tituloId} className="text-section font-semibold text-fg">
          Dados societários
        </h2>
        {podeEditar && (
          <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
            <Pencil size={13} aria-hidden /> Editar
          </Button>
        )}
      </div>
      <dl className="flex flex-col gap-1.5 text-fs-2">
        <Linha rotulo="NIRE" valor={dados.nire ? `${dados.nire}${dados.juntaRegistradoEmTexto ? ` · registrado em ${dados.juntaRegistradoEmTexto}` : ""}` : null} />
        <Linha rotulo="Capital social" valor={dados.capitalSocial !== null ? formatarReais(dados.capitalSocial) : null} />
        <Linha
          rotulo="Capital integralizado"
          valor={dados.capitalIntegralizado !== null ? `${formatarReais(dados.capitalIntegralizado)}${falta !== null && falta > 0 ? ` · a integralizar ${formatarReais(falta)}` : ""}` : null}
        />
        <Linha
          rotulo="Responsável legal"
          valor={
            dados.responsavelLegalNome
              ? [dados.responsavelLegalNome, dados.responsavelLegalCargo, dados.responsavelLegalCpf ? `CPF ${formatCpf(dados.responsavelLegalCpf)}` : null].filter(Boolean).join(" · ")
              : null
          }
        />
        <Linha rotulo="Objeto social" valor={dados.objetoSocial ? <TextoRecolhivel texto={dados.objetoSocial} /> : null} />
      </dl>

      <Modal open={aberto} onClose={() => !salvando && setAberto(false)} title="Dados societários" maxWidth="max-w-2xl">
        <form ref={formRef} action={salvar} className="flex flex-col gap-5">
          <input type="hidden" name="companyId" value={companyId} />
          <FormSection title="Registro na Junta">
            <FieldGrid>
              <CampoForm label="NIRE" htmlFor="ds-nire">
                <Input id="ds-nire" name="nire" defaultValue={dados.nire ?? ""} inputMode="numeric" maxLength={30} />
              </CampoForm>
              <CampoForm label="Data do registro" htmlFor="ds-data" dica="Do último ato registrado.">
                <CampoData id="ds-data" name="juntaRegistradoEm" defaultValue={dados.juntaRegistradoEmCampo} />
              </CampoForm>
            </FieldGrid>
          </FormSection>
          <FormSection title="Capital">
            <FieldGrid>
              <CampoForm label="Capital social (R$)" htmlFor="ds-capital">
                <Input id="ds-capital" name="capitalSocial" defaultValue={reaisNoCampo(dados.capitalSocial)} inputMode="decimal" placeholder="10.000,00" maxLength={30} />
              </CampoForm>
              <CampoForm label="Capital integralizado (R$)" htmlFor="ds-integralizado">
                <Input id="ds-integralizado" name="capitalIntegralizado" defaultValue={reaisNoCampo(dados.capitalIntegralizado)} inputMode="decimal" placeholder="10.000,00" maxLength={30} />
              </CampoForm>
            </FieldGrid>
          </FormSection>
          <FormSection title="Objeto social">
            <CampoForm label="Objeto social" htmlFor="ds-objeto" dica="Como está no contrato.">
              <Textarea id="ds-objeto" name="objetoSocial" defaultValue={dados.objetoSocial ?? ""} rows={4} maxLength={LIMITE_DO_OBJETO_SOCIAL} />
            </CampoForm>
          </FormSection>
          <FormSection title="Responsável legal">
            {administrador && (
              <div>
                <Button type="button" variant="secondary" size="xs" onClick={usarAdministrador}>
                  <UserCheck size={12} aria-hidden /> Usar o sócio administrador
                </Button>
              </div>
            )}
            <CampoForm label="Nome" htmlFor="ds-resp-nome">
              <Input id="ds-resp-nome" name="responsavelLegalNome" defaultValue={dados.responsavelLegalNome ?? ""} maxLength={180} />
            </CampoForm>
            <FieldGrid>
              <CampoForm label="CPF" htmlFor="ds-resp-cpf">
                <Input id="ds-resp-cpf" name="responsavelLegalCpf" defaultValue={dados.responsavelLegalCpf ? formatCpf(dados.responsavelLegalCpf) : ""} inputMode="numeric" maxLength={14} />
              </CampoForm>
              <CampoForm label="RG" htmlFor="ds-resp-rg">
                <Input id="ds-resp-rg" name="responsavelLegalRg" defaultValue={dados.responsavelLegalRg ?? ""} maxLength={30} />
              </CampoForm>
              <CampoForm label="Cargo" htmlFor="ds-resp-cargo">
                <Input id="ds-resp-cargo" name="responsavelLegalCargo" defaultValue={dados.responsavelLegalCargo ?? ""} maxLength={80} placeholder="Sócio administrador" />
              </CampoForm>
              <CampoForm label="E-mail" htmlFor="ds-resp-email">
                <Input id="ds-resp-email" name="responsavelLegalEmail" type="email" defaultValue={dados.responsavelLegalEmail ?? ""} maxLength={120} />
              </CampoForm>
            </FieldGrid>
          </FormSection>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando} loadingLabel="Salvando…">
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
