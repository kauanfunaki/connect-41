"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { formatCpf } from "@/lib/format";
import type { ContatoDoTermo, EnderecoDoTermo, Falta, PapelDoContato } from "@/lib/honorarios/termo/contratante";
import type { SocioNaTela } from "@/lib/honorarios/termo/servidor";
import { gerarTermoAditivo, salvarDadosDoTermo } from "@/app/(app)/honorarios/termo/actions";

type Props = {
  companyId: string;
  endereco: EnderecoDoTermo;
  socios: SocioNaTela[];
  /** O sócio que assina, ou "novo" para cadastrar um. */
  socioId: string | null;
  contatos: Record<PapelDoContato, ContatoDoTermo | null>;
  faltas: Falta[];
  /** O parágrafo do contratante como sai no termo; null quando falta o obrigatório. */
  previa: string | null;
  temModelo: boolean;
  podeAgir: boolean;
  historico: { id: string; nomeArquivo: string; geradoPor: string; geradoEm: string; nosArquivos: boolean }[];
};

/** Como vão escritos no texto do termo; o campo segue livre. */
const NACIONALIDADES = ["brasileiro", "brasileira"] as const;
const ESTADOS_CIVIS = ["solteiro", "solteira", "casado", "casada", "divorciado", "divorciada", "viúvo", "viúva", "em união estável"] as const;

const vazio: EnderecoDoTermo ={ logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, cep: null };

function baixar(nome: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Os campos de endereço, com o mesmo desenho para a empresa e o sócio. */
function CamposDeEndereco({ prefixo, valor, desabilitado }: { prefixo: string; valor: EnderecoDoTermo; desabilitado: boolean }) {
  const id = (c: string) => `${prefixo}${c}`;
  return (
    <>
      <FieldGrid columns="sm:grid-cols-[1fr_120px]">
        <CampoForm label="Logradouro" htmlFor={id("logradouro")}>
          <Input id={id("logradouro")} name={id("logradouro")} defaultValue={valor.logradouro ?? ""} maxLength={180} disabled={desabilitado} />
        </CampoForm>
        <CampoForm label="Número" htmlFor={id("numero")}>
          <Input id={id("numero")} name={id("numero")} defaultValue={valor.numero ?? ""} maxLength={20} disabled={desabilitado} />
        </CampoForm>
      </FieldGrid>
      <FieldGrid>
        <CampoForm label="Complemento" htmlFor={id("complemento")}>
          <Input id={id("complemento")} name={id("complemento")} defaultValue={valor.complemento ?? ""} maxLength={80} disabled={desabilitado} />
        </CampoForm>
        <CampoForm label="Bairro" htmlFor={id("bairro")}>
          <Input id={id("bairro")} name={id("bairro")} defaultValue={valor.bairro ?? ""} maxLength={80} disabled={desabilitado} />
        </CampoForm>
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_80px_140px]">
        <CampoForm label="Cidade" htmlFor={id("cidade")}>
          <Input id={id("cidade")} name={id("cidade")} defaultValue={valor.cidade ?? ""} maxLength={80} disabled={desabilitado} />
        </CampoForm>
        <CampoForm label="UF" htmlFor={id("uf")}>
          <Input id={id("uf")} name={id("uf")} defaultValue={valor.uf ?? ""} maxLength={2} disabled={desabilitado} />
        </CampoForm>
        <CampoForm label="CEP" htmlFor={id("cep")}>
          <Input id={id("cep")} name={id("cep")} defaultValue={valor.cep ?? ""} maxLength={9} inputMode="numeric" disabled={desabilitado} />
        </CampoForm>
      </FieldGrid>
    </>
  );
}

/**
 * A tela do termo de uma empresa (funcionalidade-643): a prévia do parágrafo
 * do contratante, o que falta, os dados do contrato (gravados no cadastro) e
 * o histórico do que foi gerado.
 */
export function TermoDaEmpresa({ companyId, endereco, socios, socioId, contatos, faltas, previa, temModelo, podeAgir, historico }: Props) {
  const toast = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarSalvar] = useTransition();
  const [gerando, iniciarGerar] = useTransition();
  const socio = socios.find((s) => s.id === socioId) ?? null;
  const ocupado = salvando || gerando;
  const desabilitado = !podeAgir || ocupado;

  function salvar(form: FormData) {
    setErro(null);
    iniciarSalvar(async () => {
      const r = await salvarDadosDoTermo(form).catch(() => ({ ok: false as const, erro: "Não deu para salvar agora. Tente de novo." }));
      if (!r.ok) return setErro(r.erro);
      toast.success("Dados do contrato salvos no cadastro.");
      if (r.socioId !== socioId) router.replace(`/honorarios/termo/${companyId}?socio=${r.socioId}`);
      else router.refresh();
    });
  }

  function gerar() {
    iniciarGerar(async () => {
      const r = await gerarTermoAditivo(companyId, socioId === "novo" ? null : socioId).catch(() => ({ ok: false as const, erro: "Não deu para gerar agora. Tente de novo." }));
      if (!r.ok) return toast.error(r.erro);
      baixar(r.nomeArquivo, r.conteudoBase64);
      toast.success(r.guardadoNosArquivos ? "Termo gerado e guardado nos Arquivos da empresa (pasta Societário)." : "Termo gerado. Não foi para os Arquivos: a empresa não tem a pasta Societário.");
      router.refresh();
    });
  }

  function copiarEnderecoDaEmpresa() {
    const f = formRef.current;
    if (!f) return;
    for (const c of ["logradouro", "numero", "complemento", "bairro", "cidade", "uf", "cep"]) {
      const de = f.elements.namedItem(`empresa_${c}`) as HTMLInputElement | null;
      const para = f.elements.namedItem(`socio_${c}`) as HTMLInputElement | null;
      if (de && para) para.value = de.value;
    }
  }

  const obrigatorias = faltas.filter((f) => f.obrigatoria);
  const opcionais = faltas.filter((f) => !f.obrigatoria);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="c41-rotulo">Parágrafo do contratante</h2>
            <p className="text-helper text-fg-secondary">Como sai no termo, com o cadastro de agora. Salve as mudanças antes de gerar.</p>
          </div>
          {podeAgir && (
            <Button onClick={gerar} disabled={!previa || !temModelo || salvando} loading={gerando} loadingLabel="Gerando…" title={!temModelo ? "O escritório ainda não enviou o modelo do termo." : undefined}>
              <Download size={14} /> Gerar termo (.docx)
            </Button>
          )}
        </div>
        {previa ? (
          <p className="rounded-md border border-border-soft bg-surface-2/50 px-3 py-2 text-ui leading-relaxed text-fg">{previa}</p>
        ) : (
          <Aviso>Para gerar falta: {obrigatorias.map((f) => f.campo.toLowerCase()).join(", ") || "salvar o sócio"}.</Aviso>
        )}
        {!temModelo && <Aviso tom="atencao">O escritório ainda não enviou o modelo do termo. Quem gerencia o módulo envia em “Modelo do termo”, na lista.</Aviso>}
        {opcionais.length > 0 && (
          <p className="text-micro text-fg-muted">
            Ficam fora do texto até serem preenchidos: {opcionais.map((f) => f.campo.toLowerCase()).join("; ")}.
          </p>
        )}
      </Card>

      <form ref={formRef} action={salvar} className="flex flex-col gap-6">
        <input type="hidden" name="companyId" value={companyId} />

        <FormSection title="Endereço da empresa" descricao="É o do cadastro da empresa: mudar aqui muda a ficha.">
          <CamposDeEndereco prefixo="empresa_" valor={endereco} desabilitado={desabilitado} />
        </FormSection>

        <FormSection title="Sócio que assina" descricao="O sócio administrador, em Sócios da empresa. Os dados pessoais saem no texto como escritos aqui.">
          <CampoForm label="Quem assina" htmlFor="socioId" helper={socios.length === 0 ? "A empresa não tem sócio pessoa física cadastrado: preencha para cadastrar." : undefined}>
            <Select
              id="socioId"
              name="socioId"
              defaultValue={socioId ?? "novo"}
              disabled={ocupado}
              onChange={(e) => router.replace(`/honorarios/termo/${companyId}?socio=${(e.target as HTMLSelectElement).value}`)}
            >
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                  {s.cpf ? ` · ${formatCpf(s.cpf)}` : " · sem CPF"}
                  {s.administrador ? "" : " (não administrador)"}
                </option>
              ))}
              <option value="novo">Cadastrar outro sócio administrador</option>
            </Select>
          </CampoForm>
          <FieldGrid>
            <CampoForm label="Nome" htmlFor="socioNome" required>
              <Input id="socioNome" name="socioNome" defaultValue={socio?.nome ?? ""} maxLength={180} required disabled={desabilitado} />
            </CampoForm>
            <CampoForm label="CPF" htmlFor="socioCpf" required>
              <Input id="socioCpf" name="socioCpf" defaultValue={socio?.cpf ? formatCpf(socio.cpf) : ""} maxLength={14} inputMode="numeric" required disabled={desabilitado} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Nacionalidade" htmlFor="socioNacionalidade">
              <CampoComSugestoes
                id="socioNacionalidade"
                name="socioNacionalidade"
                sugestoes={NACIONALIDADES}
                defaultValue={socio?.nacionalidade ?? ""}
                maxLength={60}
                placeholder="brasileiro"
                disabled={desabilitado}
              />
            </CampoForm>
            <CampoForm label="Estado civil" htmlFor="socioEstadoCivil">
              <CampoComSugestoes
                id="socioEstadoCivil"
                name="socioEstadoCivil"
                sugestoes={ESTADOS_CIVIS}
                defaultValue={socio?.estadoCivil ?? ""}
                maxLength={40}
                placeholder="casado"
                disabled={desabilitado}
              />
            </CampoForm>
            <CampoForm label="Profissão" htmlFor="socioProfissao">
              <Input id="socioProfissao" name="socioProfissao" defaultValue={socio?.profissao ?? ""} maxLength={120} placeholder="empresário" disabled={desabilitado} />
            </CampoForm>
          </FieldGrid>
          <div className="flex items-center justify-between gap-2">
            <p className="c41-rotulo">Endereço do sócio</p>
            {podeAgir && (
              <Button type="button" variant="link" size="sm" onClick={copiarEnderecoDaEmpresa} disabled={ocupado}>
                Usar o endereço da empresa
              </Button>
            )}
          </div>
          <CamposDeEndereco prefixo="socio_" valor={socio?.endereco ?? vazio} desabilitado={desabilitado} />
        </FormSection>

        <FormSection title="Contatos do contrato" descricao="Entram no fim do parágrafo. Só aparecem com nome, telefone e e-mail.">
          {(["ADMINISTRATIVO", "FINANCEIRO"] as const).map((papel) => {
            const p = papel.toLowerCase();
            const c = contatos[papel];
            return (
              <FieldGrid key={papel} columns="sm:grid-cols-3">
                <CampoForm label={papel === "ADMINISTRATIVO" ? "Contato administrativo" : "Contato financeiro"} htmlFor={`${p}_nome`}>
                  <Input id={`${p}_nome`} name={`${p}_nome`} defaultValue={c?.nome ?? ""} maxLength={180} placeholder="Nome" disabled={desabilitado} />
                </CampoForm>
                <CampoForm label="Telefone" htmlFor={`${p}_telefone`}>
                  <Input id={`${p}_telefone`} name={`${p}_telefone`} defaultValue={c?.telefone ?? ""} maxLength={30} inputMode="tel" disabled={desabilitado} />
                </CampoForm>
                <CampoForm label="E-mail" htmlFor={`${p}_email`}>
                  <Input id={`${p}_email`} name={`${p}_email`} type="email" defaultValue={c?.email ?? ""} maxLength={120} disabled={desabilitado} />
                </CampoForm>
              </FieldGrid>
            );
          })}
        </FormSection>

        {erro && <Aviso>{erro}</Aviso>}
        {podeAgir && (
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={salvando} loadingLabel="Salvando…" disabled={gerando}>
              <Save size={14} /> Salvar no cadastro
            </Button>
          </div>
        )}
      </form>

      <FormSection title="Termos gerados">
        {historico.length === 0 ? (
          <p className="text-helper text-fg-muted">Nenhum termo gerado no Connect para esta empresa.</p>
        ) : (
          <ul className="divide-y divide-border-soft rounded-md border border-border">
            {historico.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-ui">
                <FileText size={14} className="text-fg-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-fg">{h.nomeArquivo}</span>
                <span className="text-label text-fg-muted">
                  {h.geradoEm} · {h.geradoPor}
                </span>
                {h.nosArquivos ? <Selo tom="sucesso">Nos Arquivos</Selo> : <Selo tom="neutro">Só baixado</Selo>}
              </li>
            ))}
          </ul>
        )}
      </FormSection>
    </div>
  );
}
