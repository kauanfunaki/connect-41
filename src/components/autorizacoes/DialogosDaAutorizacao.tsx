"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Copy, ListChecks } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { atualizarAutorizacao, atualizarEmLote, definirQuemRecebeAction } from "@/app/(app)/autorizacoes/actions";
import { prazoParaValidar, ROTULO_DO_STATUS, STATUS, type EntradaDaAutorizacao, type StatusDaAutorizacao } from "@/lib/autorizacoes/regras";
import type { AutorizacaoNaTela, ResumoDoLote } from "@/lib/autorizacoes/servidor";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

type Campos = Required<{ [K in keyof EntradaDaAutorizacao]: NonNullable<EntradaDaAutorizacao[K]> }>;

/** O passo seguinte é a sugestão: quem pediu, marca o cadastro; quem cadastrou, a validação. */
function camposIniciais(registro: AutorizacaoNaTela | null, hoje: string): Campos {
  const proximo: Record<StatusDaAutorizacao, StatusDaAutorizacao> = {
    REQUESTED: "PENDING_VALIDATION",
    PENDING_VALIDATION: "ACTIVE",
    ACTIVE: "ACTIVE",
    CANCELLED: "REQUESTED",
    NOT_APPLICABLE: "NOT_APPLICABLE",
  };
  return {
    status: registro ? proximo[registro.status] : "REQUESTED",
    requestedAt: registro?.requestedAt ?? hoje,
    receivedAt: registro?.receivedAt ?? hoje,
    validatedAt: registro?.validatedAt ?? hoje,
    expiresAt: registro?.expiresAt ?? "",
    allServices: registro?.allServices ?? true,
    services: registro?.services ?? "",
    notes: registro?.notes ?? "",
  };
}

/** Só o que vale para a situação escolhida segue para o servidor. */
function entradaDos(c: Campos): EntradaDaAutorizacao {
  return {
    status: c.status,
    requestedAt: c.status === "REQUESTED" ? c.requestedAt : null,
    receivedAt: c.status === "PENDING_VALIDATION" || c.status === "ACTIVE" ? c.receivedAt : null,
    validatedAt: c.status === "ACTIVE" ? c.validatedAt : null,
    expiresAt: c.status === "ACTIVE" ? c.expiresAt : null,
    allServices: c.allServices,
    services: c.status === "ACTIVE" && !c.allServices ? c.services : null,
    notes: c.notes,
  };
}

function CamposDaSituacao({ id, campos, mudar, comObservacao = true }: { id: string; campos: Campos; mudar: (c: Partial<Campos>) => void; comObservacao?: boolean }) {
  const s = campos.status as StatusDaAutorizacao;
  return (
    <>
      <CampoForm label="Situação" htmlFor={`${id}-status`}>
        <Select id={`${id}-status`} value={campos.status} onChange={(e) => mudar({ status: e.target.value })}>
          {STATUS.map((st) => (
            <option key={st} value={st}>
              {ROTULO_DO_STATUS[st]}
            </option>
          ))}
        </Select>
      </CampoForm>

      {s === "REQUESTED" && (
        <CampoForm label="Pedida em" htmlFor={`${id}-pedida`}>
          <CampoData id={`${id}-pedida`} value={campos.requestedAt} onChange={(v) => mudar({ requestedAt: v })} />
        </CampoForm>
      )}

      {s === "PENDING_VALIDATION" && (
        <CampoForm
          label="Cliente cadastrou em"
          htmlFor={`${id}-cadastro`}
          helper={campos.receivedAt ? `Validar no Portal até ${dataBr(prazoParaValidar(campos.receivedAt))}, ou ela cai.` : undefined}
        >
          <CampoData id={`${id}-cadastro`} value={campos.receivedAt} onChange={(v) => mudar({ receivedAt: v })} />
        </CampoForm>
      )}

      {s === "ACTIVE" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoForm label="Validada em" htmlFor={`${id}-validada`}>
              <CampoData id={`${id}-validada`} value={campos.validatedAt} onChange={(v) => mudar({ validatedAt: v })} />
            </CampoForm>
            <CampoForm label="Válida até" htmlFor={`${id}-validade`} helper="Está no Portal, na aba “Recebidas”.">
              <CampoData id={`${id}-validade`} value={campos.expiresAt} onChange={(v) => mudar({ expiresAt: v })} />
            </CampoForm>
          </div>
          <Checkbox
            id={`${id}-todos`}
            checked={campos.allServices}
            onChange={(e) => mudar({ allServices: e.target.checked })}
            label="Todos os serviços"
            helper="Inclui os que a Receita criar depois. Desmarque se o cliente escolheu só alguns."
          />
          {!campos.allServices && (
            <CampoForm label="Códigos dos serviços" htmlFor={`${id}-servicos`} helper="Os códigos de 5 dígitos do Portal, ex.: 00146, 00103.">
              <Input id={`${id}-servicos`} value={campos.services} onChange={(e) => mudar({ services: e.target.value })} />
            </CampoForm>
          )}
        </>
      )}

      {comObservacao && (
        <CampoForm label="Observação" htmlFor={`${id}-obs`}>
          <Textarea id={`${id}-obs`} rows={2} value={campos.notes} onChange={(e) => mudar({ notes: e.target.value })} />
        </CampoForm>
      )}
    </>
  );
}

function Rodape({ onClose, pendente, rotulo }: { onClose: () => void; pendente: boolean; rotulo: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={pendente}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" loading={pendente}>
        {rotulo}
      </Button>
    </div>
  );
}

/** Botão "Atualizar" de um cliente, na lista e na ficha. */
export function BotaoDaAutorizacao({
  chave,
  nome,
  documento,
  registro,
  hoje,
  rotulo = "Atualizar",
}: {
  chave: string;
  nome: string;
  documento: string;
  registro: AutorizacaoNaTela | null;
  hoje: string;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [campos, setCampos] = useState<Campos>(() => camposIniciais(registro, hoje));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function abrir() {
    setCampos(camposIniciais(registro, hoje));
    setErro(null);
    setAberto(true);
  }

  return (
    <>
      <Button size="xs" variant="secondary" onClick={abrir}>
        {rotulo}
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Autorização de acesso">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await atualizarAutorizacao(chave, entradaDos(campos));
              if (!r.ok) {
                setErro(r.erro);
                return;
              }
              toast.success("Autorização atualizada.");
              setAberto(false);
              router.refresh();
            });
          }}
        >
          <div className="text-ui">
            <p className="font-semibold text-fg truncate">{nome}</p>
            <p className="text-fs-1 text-fg-muted tabular-nums">{chave.length === 11 ? `CPF ${documento}` : `Raiz do CNPJ ${documento} · vale para matriz e filiais`}</p>
          </div>
          <CamposDaSituacao id={`aut-${chave}`} campos={campos} mudar={(c) => setCampos((a) => ({ ...a, ...c }))} />
          {erro && (
            <p className="text-fs-3 text-danger" role="alert">
              {erro}
            </p>
          )}
          <Rodape onClose={() => setAberto(false)} pendente={pendente} rotulo="Salvar" />
        </form>
      </Modal>
    </>
  );
}

/** A mesma situação para vários clientes: cola a lista de CNPJs (do Portal, de uma planilha). */
export function AtualizarEmLote({ hoje }: { hoje: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [campos, setCampos] = useState<Campos>(() => ({ ...camposIniciais(null, hoje), status: "ACTIVE" }));
  const [resumo, setResumo] = useState<ResumoDoLote | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function abrir() {
    setTexto("");
    setCampos({ ...camposIniciais(null, hoje), status: "ACTIVE" });
    setResumo(null);
    setAberto(true);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={abrir}>
        <ListChecks size={14} /> Atualizar em lote
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Atualizar em lote" maxWidth="max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setResumo(null);
            startTransition(async () => {
              const r = await atualizarEmLote(texto, entradaDos(campos));
              setResumo(r);
              if (r.atualizadas > 0) router.refresh();
            });
          }}
        >
          <CampoForm
            label="CNPJs ou CPFs"
            htmlFor="aut-lote-lista"
            helper="Cole a lista como estiver: um por linha ou não, com ou sem pontuação, com o nome ao lado. Matriz e filial contam uma vez."
          >
            <Textarea id="aut-lote-lista" rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </CampoForm>
          <CamposDaSituacao id="aut-lote" campos={campos} mudar={(c) => setCampos((a) => ({ ...a, ...c }))} comObservacao={false} />
          {resumo && (
            <Aviso tom={resumo.erro ? "perigo" : "sucesso"}>
              {resumo.erro && <p>{resumo.erro}</p>}
              {resumo.atualizadas > 0 && (
                <p>
                  {resumo.atualizadas} cliente{resumo.atualizadas === 1 ? "" : "s"} atualizado{resumo.atualizadas === 1 ? "" : "s"}.
                </p>
              )}
              {resumo.semEmpresa.length > 0 && <p>Sem empresa no Connect: {resumo.semEmpresa.join(", ")}.</p>}
              {resumo.invalidos.length > 0 && <p>Não são CNPJ ou CPF válidos: {resumo.invalidos.join(", ")}.</p>}
            </Aviso>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAberto(false)} disabled={pendente}>
              {resumo && resumo.atualizadas > 0 ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" size="sm" loading={pendente} disabled={!texto.trim()}>
              Atualizar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Quem recebe as autorizações — o CNPJ que vai no texto. Só a coordenação do setor muda. */
function QuemRecebe({
  atual,
  sugestao,
  podeConfigurar,
}: {
  atual: { nome: string; cnpj: string } | null;
  sugestao: { nome: string; cnpj: string };
  podeConfigurar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();

  function abrir() {
    // Sem definição, o formulário sugere o cadastro do workspace — para conferir,
    // não para aceitar sem olhar: pode não ser o escritório contábil.
    setNome(atual?.nome ?? sugestao.nome);
    setCnpj(atual?.cnpj ?? sugestao.cnpj);
    setErro(null);
    setEditando(true);
  }

  if (editando) {
    return (
      <form
        className="flex flex-col gap-3 rounded-md border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          startTransition(async () => {
            const r = await definirQuemRecebeAction(nome, cnpj);
            if (!r.ok) {
              setErro(r.erro);
              return;
            }
            setEditando(false);
            router.refresh();
          });
        }}
      >
        <p className="text-ui text-fg-secondary">O escritório contábil que valida as autorizações no Portal — o mesmo que vai consultar a Receita pelo Serpro.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CampoForm label="Nome" htmlFor="aut-recebe-nome">
            <Input id="aut-recebe-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </CampoForm>
          <CampoForm label="CNPJ" htmlFor="aut-recebe-cnpj">
            <Input id="aut-recebe-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} inputMode="numeric" />
          </CampoForm>
        </div>
        {erro && (
          <p className="text-fs-3 text-danger" role="alert">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditando(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" loading={pendente}>
            Salvar
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <div className="text-ui min-w-0">
        <span className="block text-micro uppercase tracking-wide text-fg-muted">Quem recebe as autorizações</span>
        {atual ? (
          <span className="text-fg">
            {atual.nome} · <span className="tabular-nums">{atual.cnpj}</span>
          </span>
        ) : (
          <span className="text-warning-fg">Ainda não definido</span>
        )}
      </div>
      {podeConfigurar && (
        <Button size="xs" variant="secondary" onClick={abrir}>
          {atual ? "Alterar" : "Definir"}
        </Button>
      )}
    </div>
  );
}

/** O passo a passo para mandar ao cliente, com botão de copiar. */
export function PedidoAoCliente({
  texto,
  quemRecebe,
  sugestao,
  podeConfigurar,
}: {
  texto: string | null;
  quemRecebe: { nome: string; cnpj: string } | null;
  sugestao: { nome: string; cnpj: string };
  podeConfigurar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
        <ClipboardList size={14} /> Como pedir ao cliente
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Como pedir ao cliente" maxWidth="max-w-lg">
        <div className="flex flex-col gap-4">
          <QuemRecebe atual={quemRecebe} sugestao={sugestao} podeConfigurar={podeConfigurar} />
          {texto ? (
            <>
              <p className="text-ui text-fg-secondary">
                Copie e mande pelo WhatsApp ou por e-mail. Quando o cliente avisar que cadastrou, marque “Cliente cadastrou” — a contagem dos 30 dias
                começa ali.
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface-2 p-3 text-fs-2 text-fg font-sans">{texto}</pre>
            </>
          ) : (
            <Aviso tom="atencao">
              O texto sai com o CNPJ de quem recebe.{" "}
              {podeConfigurar ? "Defina acima antes de pedir aos clientes." : "Peça à coordenação do setor para definir."}
            </Aviso>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            {texto && (
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(texto);
                    setCopiado(true);
                    toast.success("Texto copiado.");
                  } catch {
                    toast.error("Não deu para copiar. Selecione o texto e copie com Ctrl+C.");
                  }
                }}
              >
                <Copy size={14} /> {copiado ? "Copiado" : "Copiar texto"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
