"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Modal } from "@/components/ui/Modal";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { criarContraparte, atualizarContraparte } from "@/app/(app)/fornecedores-e-sacados/actions";
import { FormFooter } from "@/components/ui/FormFooter";
import { useBuscaDoCnpj, ajudaDaBusca, AvisoDaSituacao, type AchadoNaReceita } from "./BuscaDoCnpj";
import { completarComReceita, fichaNoFormulario, type CampoDaFicha } from "@/lib/financeiro/fichaDaContraparte";
import { CamposDosEncargos, resumoDosEncargos, type EncargosNoCampo } from "./FormEncargos";

type Categoria = { id: string; nome: string };
/** Centros ativos da empresa — o que se pode escolher como padrão. */
type Centro = { id: string; nome: string };

/** A ficha como a tela de cadastros a lê do banco. */
export type ContraparteDaFicha = {
  id: string;
  nome: string;
  documento: string | null;
  email: string | null;
  defaultCategoryId: string | null;
  ativo: boolean;
  defaultCostCenterId?: string | null;
  /** Nome do centro padrão atual — aparece mesmo se ele foi inativado. */
  centroPadraoNome?: string | null;
  /** Juros e multa pelo atraso só desta ficha (22/10/2026); vazios seguem a da empresa. */
  encargos?: EncargosNoCampo;
} & Partial<Record<CampoDaFicha, string | null>>;

// Cadastro e edição num modal, como a conta bancária da conciliação. Até 30/09
// o cadastro abria um cartão no meio da barra de filtros e a edição empilhava
// seis campos sem rótulo dentro da célula da tabela — só o placeholder dizia
// o que era cada um, e ele some quando o campo tem valor.
//
// 19/10: a ficha do Omie — fantasia, telefone, endereço, banco e PIX — e a
// busca pelo CNPJ, que preenche o que a Receita tem (pedido 2 do BPO). O
// endereço e os dados bancários ficam em blocos que recolhem, fechados, com o
// resumo na linha; a busca abre o do endereço para a pessoa ver o que veio.

const SEM_ENCARGOS: EncargosNoCampo = { multa: "", juros: "", desconto: "" };

function resumoDoEndereco(f: Record<CampoDaFicha, string>): string {
  const cidade = [f.city, f.stateCode].filter(Boolean).join("/");
  return cidade || (f.addressStreet ? f.addressStreet : "Não informado");
}

function resumoDoBanco(f: Record<CampoDaFicha, string>): string {
  const partes = [f.pixKey && "PIX", f.bankCode && `Banco ${f.bankCode}`].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Não informado";
}

function FormularioDaContraparte({
  companyId,
  contraparte,
  categorias,
  centros,
  onFechar,
  aoMudarPendente,
}: {
  companyId: string;
  /** O modal não fecha no meio de um envio. */
  aoMudarPendente: (pendente: boolean) => void;
  /** Ausente no cadastro novo. */
  contraparte?: ContraparteDaFicha;
  categorias: Categoria[];
  centros: Centro[];
  onFechar: () => void;
}) {
  const id = useId();
  const editando = !!contraparte;
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  useEffect(() => aoMudarPendente(pendente), [pendente, aoMudarPendente]);
  const [documento, setDocumento] = useState("");
  const [nome, setNome] = useState(contraparte?.nome ?? "");
  const [email, setEmail] = useState(contraparte?.email ?? "");
  const [ficha, setFicha] = useState(() => fichaNoFormulario(contraparte ?? {}));
  const [enderecoAberto, setEnderecoAberto] = useState(false);
  // O nome que a própria Receita escreveu: trocar o CNPJ troca o nome se a
  // pessoa não mexeu nele depois.
  const nomeDaReceita = useRef<string | null>(null);

  function aoAchar(achado: AchadoNaReceita) {
    if (achado.existente && achado.existente.id !== contraparte?.id) return;
    const f = achado.ficha;
    setNome((atual) => (atual.trim() === "" || atual === nomeDaReceita.current ? f.nome : atual));
    nomeDaReceita.current = f.nome;
    setEmail((atual) => atual || f.email || "");
    setFicha((atual) => completarComReceita(atual, f));
    if (f.logradouro || f.cidade) setEnderecoAberto(true);
  }
  const busca = useBuscaDoCnpj(companyId, aoAchar);

  const campo = (c: CampoDaFicha) => ({
    id: `${id}-${c}`,
    name: c,
    value: ficha[c],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFicha((f) => ({ ...f, [c]: e.target.value })),
  });

  // Documento só se preenche: trocar o CNPJ de ficha com histórico desfaria o
  // casamento com as notas — ver `atualizarContraparte`.
  const pedeDocumento = !contraparte?.documento;
  const cnpjDaFicha = contraparte?.documento?.length === 14 ? contraparte.documento : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = editando ? await atualizarContraparte(dados) : await criarContraparte(dados);
          if ("error" in r) setErro(r.error);
          else onFechar();
        });
      }}
    >
      {contraparte ? <input type="hidden" name="id" value={contraparte.id} /> : <input type="hidden" name="companyId" value={companyId} />}

      <FieldGrid columns={pedeDocumento ? "sm:grid-cols-[200px_minmax(0,1fr)]" : "sm:grid-cols-1"}>
        {pedeDocumento && (
          <CampoForm label="CPF ou CNPJ" htmlFor={`${id}-documento`} {...ajudaDaBusca(busca.estado, { padrao: "Com CNPJ, a Receita preenche o resto." })}>
            <Input
              id={`${id}-documento`}
              name="documento"
              inputMode="numeric"
              value={documento}
              onChange={(e) => {
                setDocumento(e.target.value);
                busca.aoDigitar(e.target.value);
              }}
            />
          </CampoForm>
        )}
        <CampoForm
          label="Nome"
          htmlFor={`${id}-nome`}
          required
          // A ficha que já tem CNPJ não mostra o campo de documento; a busca
          // vem por este botão, e completa só o que estiver vazio.
          acao={
            cnpjDaFicha ? (
              <button
                type="button"
                className="text-brand hover:underline disabled:opacity-60"
                disabled={busca.estado.tipo === "buscando"}
                onClick={() => busca.buscarAgora(cnpjDaFicha)}
              >
                Completar pela Receita
              </button>
            ) : undefined
          }
          {...(pedeDocumento ? {} : ajudaDaBusca(busca.estado, { proprioId: contraparte?.id }))}
        >
          <Input id={`${id}-nome`} name="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={180} required />
        </CampoForm>
      </FieldGrid>

      <AvisoDaSituacao estado={busca.estado} />

      <FieldGrid>
        <CampoForm label="Nome fantasia" htmlFor={`${id}-tradeName`}>
          <Input {...campo("tradeName")} maxLength={180} />
        </CampoForm>
        <CampoForm label="Telefone" htmlFor={`${id}-phone`}>
          <Input {...campo("phone")} inputMode="tel" maxLength={30} />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="E-mail" htmlFor={`${id}-email`} helper="Para onde vão os lembretes da régua de cobrança.">
        <Input id={`${id}-email`} name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={180} />
      </CampoForm>

      <BlocoRecolhivel titulo="Endereço" resumo={resumoDoEndereco(ficha)} aberto={enderecoAberto} onAbertoChange={setEnderecoAberto}>
        <div className="flex flex-col gap-4 pt-1">
          <FieldGrid columns="sm:grid-cols-[140px_minmax(0,1fr)_110px]">
            <CampoForm label="CEP" htmlFor={`${id}-zipCode`}>
              <Input {...campo("zipCode")} inputMode="numeric" maxLength={10} />
            </CampoForm>
            <CampoForm label="Logradouro" htmlFor={`${id}-addressStreet`}>
              <Input {...campo("addressStreet")} maxLength={180} />
            </CampoForm>
            <CampoForm label="Número" htmlFor={`${id}-addressNumber`}>
              <Input {...campo("addressNumber")} maxLength={20} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CampoForm label="Complemento" htmlFor={`${id}-addressComplement`}>
              <Input {...campo("addressComplement")} maxLength={80} />
            </CampoForm>
            <CampoForm label="Bairro" htmlFor={`${id}-neighborhood`}>
              <Input {...campo("neighborhood")} maxLength={80} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_80px]">
            <CampoForm label="Cidade" htmlFor={`${id}-city`}>
              <Input {...campo("city")} maxLength={80} />
            </CampoForm>
            <CampoForm label="UF" htmlFor={`${id}-stateCode`}>
              <Input {...campo("stateCode")} maxLength={2} />
            </CampoForm>
          </FieldGrid>
        </div>
      </BlocoRecolhivel>

      <BlocoRecolhivel titulo="Dados bancários e PIX" resumo={resumoDoBanco(ficha)}>
        <div className="flex flex-col gap-4 pt-1">
          <FieldGrid columns="sm:grid-cols-[100px_120px_minmax(0,1fr)]">
            <CampoForm label="Banco" htmlFor={`${id}-bankCode`} helper="Código, ex.: 341">
              <Input {...campo("bankCode")} inputMode="numeric" maxLength={3} />
            </CampoForm>
            <CampoForm label="Agência" htmlFor={`${id}-bankAgency`}>
              <Input {...campo("bankAgency")} maxLength={10} />
            </CampoForm>
            <CampoForm label="Conta" htmlFor={`${id}-bankAccount`}>
              <Input {...campo("bankAccount")} maxLength={30} />
            </CampoForm>
          </FieldGrid>
          <CampoForm label="Chave PIX" htmlFor={`${id}-pixKey`}>
            <Input {...campo("pixKey")} maxLength={140} />
          </CampoForm>
        </div>
      </BlocoRecolhivel>

      {/* Juros e multa pelo atraso (22/10/2026): por cima da regra da empresa,
          que mora na aba "Juros e multa". Vazio segue a da empresa. */}
      <BlocoRecolhivel titulo="Juros e multa por atraso" resumo={resumoDosEncargos(contraparte?.encargos ?? SEM_ENCARGOS)}>
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-helper text-fg-muted">
            Só deste cadastro. Vazio segue a regra da empresa; com algum campo preenchido, a regra é esta, e o vazio vale zero.
          </p>
          <CamposDosEncargos valores={contraparte?.encargos ?? SEM_ENCARGOS} prefixo="encargos" />
        </div>
      </BlocoRecolhivel>

      <FieldGrid>
        <CampoForm
          label="Categoria padrão"
          htmlFor={`${id}-categoria`}
          helper="Vale para contas a pagar."
          className={centros.length > 0 ? "" : "sm:col-span-2"}
        >
          <Select id={`${id}-categoria`} name="defaultCategoryId" defaultValue={contraparte?.defaultCategoryId ?? ""}>
            <option value="">{editando ? "Sem categoria padrão" : "Nenhuma"}</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoForm>
        {centros.length > 0 && (
          <CampoForm label="Centro de custo padrão" htmlFor={`${id}-centro`}>
            <Select id={`${id}-centro`} name="defaultCostCenterId" defaultValue={contraparte?.defaultCostCenterId ?? ""}>
              <option value="">{editando ? "Sem centro de custo padrão" : "Nenhum"}</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>
        )}
      </FieldGrid>

      {contraparte && (
        // Liga/desliga no interruptor do Connect (15/10/2026): era uma lista
        // de duas opções, Ativo/Inativo. Envia "1" ou "0", como a lista.
        <CampoForm label="Situação" htmlFor={`${id}-ativo`}>
          <div className="flex min-h-9 items-center">
            <Switch id={`${id}-ativo`} name="ativo" value="1" valorDesligado="0" defaultChecked={contraparte.ativo} rotulo="Ativo" />
          </div>
        </CampoForm>
      )}

      <FormFooter pending={pendente} submitLabel={editando ? "Salvar" : "Cadastrar"} onCancel={onFechar} erro={erro} />
    </form>
  );
}

export function NovaContraparte({ companyId, categorias, centros = [] }: { companyId: string; categorias: Categoria[]; centros?: Centro[] }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState(false);
  // Uma chave por abertura: o formulário nasce limpo a cada "Novo cadastro".
  const [vez, setVez] = useState(0);

  return (
    <>
      {/* No cabeçalho da tela, no tamanho dos outros botões de criar (5A, 08/10/2026). */}
      <Button
        onClick={() => {
          setVez((v) => v + 1);
          setAberto(true);
        }}
      >
        <Plus size={14} /> Novo cadastro
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Novo cadastro" maxWidth="max-w-2xl">
        <FormularioDaContraparte
          key={vez}
          companyId={companyId}
          categorias={categorias}
          centros={centros}
          onFechar={() => setAberto(false)}
          aoMudarPendente={setPendente}
        />
      </Modal>
    </>
  );
}

export function EditarContraparte({
  companyId,
  contraparte,
  categorias,
  centros = [],
}: {
  companyId: string;
  contraparte: ContraparteDaFicha;
  categorias: Categoria[];
  centros?: Centro[];
}) {
  // O centro atual continua na lista mesmo inativo: salvar a ficha por outro
  // motivo não pode apagar o padrão sem a pessoa ter escolhido isso.
  const opcoesDeCentro =
    contraparte.defaultCostCenterId && !centros.some((c) => c.id === contraparte.defaultCostCenterId)
      ? [...centros, { id: contraparte.defaultCostCenterId, nome: `${contraparte.centroPadraoNome ?? "Centro atual"} (inativo)` }]
      : centros;
  const [aberto, setAberto] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [vez, setVez] = useState(0);

  return (
    <>
      <Button
        variant="secondary"
        size="xs"
        onClick={() => {
          setVez((v) => v + 1);
          setAberto(true);
        }}
      >
        Editar
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Editar cadastro" maxWidth="max-w-2xl">
        <FormularioDaContraparte
          key={vez}
          companyId={companyId}
          contraparte={contraparte}
          categorias={categorias}
          centros={opcoesDeCentro}
          onFechar={() => setAberto(false)}
          aoMudarPendente={setPendente}
        />
      </Modal>
    </>
  );
}
