"use client";

import { startTransition, useActionState, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Aviso } from "@/components/ui/Aviso";
import type { SecaoState } from "@/app/(app)/candidatos/[id]/ficha-actions";
import type { SecaoDaFicha } from "@/lib/recrutamento/fichaDoCandidato";

type AcaoDaSecao = (prev: SecaoState, form: FormData) => Promise<SecaoState>;

export type DadosDoCandidato = {
  name: string;
  cpf: string | null;
  /** "AAAA-MM-DD", para o campo de data. */
  birthDate: string | null;
  /** "14/03/1996 · 30 anos" */
  nascimento: string | null;
  rg: string | null;
  education: string | null;
  email: string | null;
  phone: string | null;
  /** O telefone com máscara, para ler. */
  telefone: string | null;
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
  /** O endereço numa linha — `enderecoEmUmaLinha`. */
  endereco: string | null;
};

type Props = {
  dados: DadosDoCandidato;
  podeEditar: boolean;
  acoes: Record<SecaoDaFicha, AcaoDaSecao>;
};

const TITULO: Record<SecaoDaFicha, string> = {
  identificacao: "Identificação",
  contato: "Contato",
  endereco: "Endereço",
};

/** Par rótulo/valor da leitura, na largura da coluna lateral. */
function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="text-helper leading-5 text-fg-muted">{rotulo}</dt>
      <dd className="min-w-0 break-words text-ui leading-5 text-fg">{children ?? <span className="text-fg-muted">—</span>}</dd>
    </div>
  );
}

/** Os campos de cada bloco no modo de edição. */
function Campos({ secao, dados, prefixo, formRef }: { secao: SecaoDaFicha; dados: DadosDoCandidato; prefixo: string; formRef: React.RefObject<HTMLFormElement | null> }) {
  const id = (campo: string) => `${prefixo}-${campo}`;
  const ultimoCep = useRef<string | null>(null);

  // Autopreenchimento pelo CEP (ViaCEP), mesma fonte e mesmo gatilho do
  // cadastro de pessoa e de empresa: com 8 dígitos, uma vez por CEP. Só
  // escreve nos campos; quem confere e salva é a pessoa.
  async function buscarCep(valor: string) {
    const limpo = valor.replace(/\D/g, "");
    if (limpo.length !== 8 || limpo === ultimoCep.current) return;
    ultimoCep.current = limpo;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      if (!res.ok) return;
      const d = await res.json();
      const form = formRef.current;
      if (d.erro || !form) return;
      const escrever = (nome: string, v: string | undefined) => {
        const el = form.elements.namedItem(nome) as HTMLInputElement | null;
        if (el && v) el.value = v;
      };
      escrever("addressStreet", d.logradouro);
      escrever("neighborhood", d.bairro);
      escrever("city", d.localidade);
      escrever("stateCode", d.uf);
    } catch {
      // falha silenciosa — a pessoa preenche à mão
    }
  }

  if (secao === "identificacao") {
    return (
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <CampoForm label="Nome" htmlFor={id("name")} required className="@sm:col-span-2">
          <Input id={id("name")} name="name" required defaultValue={dados.name} autoComplete="off" />
        </CampoForm>
        <CampoForm label="Data de nascimento" htmlFor={id("birthDate")}>
          <CampoData id={id("birthDate")} name="birthDate" defaultValue={dados.birthDate ?? ""} />
        </CampoForm>
        <CampoForm label="CPF" htmlFor={id("cpf")}>
          <Input id={id("cpf")} name="cpf" defaultValue={dados.cpf ?? ""} placeholder="000.000.000-00" maxLength={14} inputMode="numeric" />
        </CampoForm>
        <CampoForm label="RG" htmlFor={id("rg")}>
          <Input id={id("rg")} name="rg" defaultValue={dados.rg ?? ""} />
        </CampoForm>
        <CampoForm label="Escolaridade" htmlFor={id("education")}>
          <Input id={id("education")} name="education" defaultValue={dados.education ?? ""} />
        </CampoForm>
      </div>
    );
  }

  if (secao === "contato") {
    return (
      <div className="grid grid-cols-1 gap-3">
        <CampoForm label="E-mail" htmlFor={id("email")}>
          <Input id={id("email")} name="email" type="email" defaultValue={dados.email ?? ""} placeholder="nome@email.com" />
        </CampoForm>
        <CampoForm label="Telefone" htmlFor={id("phone")}>
          <Input
            id={id("phone")}
            name="phone"
            type="tel"
            defaultValue={dados.phone ?? ""}
            placeholder="(41) 99999-9999"
            pattern="[\d\s()\-+]{8,20}"
            maxLength={20}
            title="Informe um número de telefone válido"
          />
        </CampoForm>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-[minmax(0,1fr)_6rem]">
      <CampoForm label="CEP" htmlFor={id("zipCode")} className="@sm:col-span-2">
        <Input
          id={id("zipCode")}
          name="zipCode"
          defaultValue={dados.zipCode ?? ""}
          inputMode="numeric"
          maxLength={9}
          placeholder="00000-000"
          className="@sm:w-40"
          onChange={(e) => buscarCep(e.target.value)}
        />
      </CampoForm>
      <CampoForm label="Logradouro" htmlFor={id("addressStreet")}>
        <Input id={id("addressStreet")} name="addressStreet" defaultValue={dados.addressStreet ?? ""} />
      </CampoForm>
      <CampoForm label="Número" htmlFor={id("addressNumber")}>
        <Input id={id("addressNumber")} name="addressNumber" defaultValue={dados.addressNumber ?? ""} />
      </CampoForm>
      <CampoForm label="Complemento" htmlFor={id("addressComplement")} className="@sm:col-span-2">
        <Input id={id("addressComplement")} name="addressComplement" defaultValue={dados.addressComplement ?? ""} />
      </CampoForm>
      <CampoForm label="Bairro" htmlFor={id("neighborhood")} className="@sm:col-span-2">
        <Input id={id("neighborhood")} name="neighborhood" defaultValue={dados.neighborhood ?? ""} />
      </CampoForm>
      <CampoForm label="Cidade" htmlFor={id("city")}>
        <Input id={id("city")} name="city" defaultValue={dados.city ?? ""} />
      </CampoForm>
      <CampoForm label="UF" htmlFor={id("stateCode")}>
        <Input id={id("stateCode")} name="stateCode" maxLength={2} defaultValue={dados.stateCode ?? ""} />
      </CampoForm>
    </div>
  );
}

/** O bloco aberto para edição: só os campos dele, com Salvar e Cancelar ali mesmo. */
function FormDaSecao({
  secao,
  dados,
  acao,
  onFechar,
}: {
  secao: SecaoDaFicha;
  dados: DadosDoCandidato;
  acao: AcaoDaSecao;
  onFechar: () => void;
}) {
  const prefixo = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, enviar, salvando] = useActionState<SecaoState, FormData>(async (anterior, form) => {
    const r = await acao(anterior, form);
    // Gravou: o bloco volta para a leitura, já com o dado novo (a action
    // revalida a ficha).
    if (r && "ok" in r) onFechar();
    return r;
  }, null);

  // Pelo `onSubmit`, e não pelo `action` do <form>: com `action`, o React
  // limpa o formulário ao terminar, e um CPF recusado apagaria o que a pessoa
  // acabou de digitar no bloco.
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    startTransition(() => enviar(form));
  }

  return (
    <form ref={formRef} onSubmit={salvar} className="space-y-3">
      {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}
      <Campos secao={secao} dados={dados} prefixo={prefixo} formRef={formRef} />
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={salvando}>
          Salvar {TITULO[secao].toLowerCase()}
        </Button>
      </div>
    </form>
  );
}

/**
 * "Dados pessoais" na coluna da direita da ficha do candidato (escolha 1A do
 * Kauan, 14/10/2026): identificação, contato e endereço num bloco só — eram
 * três cartões na largura toda, com o Contato ocupando duas de quatro colunas.
 *
 * Cada parte tem o seu lápis (escolha 5A): clicar troca só aquela parte por
 * campos, com Salvar e Cancelar ali mesmo, sem sair da ficha. O formulário
 * inteiro continua em "⋯ › Editar tudo".
 */
/** Uma parte do bloco — o título pequeno, o lápis e a leitura ou os campos. */
function Parte({
  secao,
  editando,
  podeEditar,
  onEditar,
  onFechar,
  dados,
  acao,
  children,
}: {
  secao: SecaoDaFicha;
  editando: SecaoDaFicha | null;
  podeEditar: boolean;
  onEditar: (secao: SecaoDaFicha) => void;
  onFechar: () => void;
  dados: DadosDoCandidato;
  acao: AcaoDaSecao;
  children: React.ReactNode;
}) {
  const aberta = editando === secao;
  return (
    <section
      aria-label={TITULO[secao]}
      className={`rounded-md ${aberta ? "-mx-3 border border-brand/40 p-3 shadow-[0_0_0_3px_var(--c41-focus-ring)]" : ""}`}
    >
      <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-micro font-semibold uppercase tracking-wide text-fg-muted">{TITULO[secao]}</h3>
        {/* Um bloco de cada vez: com um aberto, os outros lápis somem. */}
        {podeEditar && editando === null && (
          <IconButton size="sm" title={`Editar ${TITULO[secao].toLowerCase()}`} onClick={() => onEditar(secao)}>
            <Pencil size={13} />
          </IconButton>
        )}
      </div>
      {aberta ? <FormDaSecao secao={secao} dados={dados} acao={acao} onFechar={onFechar} /> : <dl className="space-y-2">{children}</dl>}
    </section>
  );
}

export function DadosPessoaisDoCandidato({ dados, podeEditar, acoes }: Props) {
  const [editando, setEditando] = useState<SecaoDaFicha | null>(null);
  const comum = { editando, podeEditar, onEditar: setEditando, onFechar: () => setEditando(null), dados };

  return (
    <Card className="@container p-5">
      <h2 className="mb-3 text-section font-semibold text-fg">Dados pessoais</h2>
      <div className="space-y-4 [&>section+section]:border-t [&>section+section]:border-border [&>section+section]:pt-4">
        <Parte secao="identificacao" acao={acoes.identificacao} {...comum}>
          <Linha rotulo="Nascimento">{dados.nascimento}</Linha>
          <Linha rotulo="RG">{dados.rg && <span className="tnum">{dados.rg}</span>}</Linha>
          <Linha rotulo="Escolaridade">{dados.education}</Linha>
        </Parte>
        <Parte secao="contato" acao={acoes.contato} {...comum}>
          <Linha rotulo="E-mail">
            {dados.email && (
              <a href={`mailto:${dados.email}`} className="text-brand hover:underline">
                {dados.email}
              </a>
            )}
          </Linha>
          <Linha rotulo="Telefone">{dados.telefone && <span className="tnum">{dados.telefone}</span>}</Linha>
        </Parte>
        <Parte secao="endereco" acao={acoes.endereco} {...comum}>
          <Linha rotulo="Endereço">{dados.endereco}</Linha>
        </Parte>
      </div>
    </Card>
  );
}
