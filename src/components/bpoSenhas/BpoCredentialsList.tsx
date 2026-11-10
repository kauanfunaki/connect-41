"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { Button } from "@/components/ui/Button";
import { Eye, EyeOff, Copy, Pencil, Trash2, Plus, KeyRound, Lock, Users, UserX } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { ItemDoMenu } from "@/components/ui/Popover";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoDeSenha } from "@/components/ui/CampoDeSenha";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { RadioGroup } from "@/components/ui/RadioGroup";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import type { BpoCredencialState } from "@/app/(app)/senhas/actions";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { FormFooter } from "@/components/ui/FormFooter";
import type { QuemVe, VisibilidadeDaSenha } from "@/lib/apoio/regrasDasSenhas";

type Pessoa = { id: string; name: string };

export type CredentialRow = {
  id: string;
  title: string;
  companyId: string | null;
  companyName: string | null;
  username: string | null;
  url: string | null;
  notes: string | null;
  createdById: string;
  createdByName: string;
  createdAtLabel: string;
  /** Quem vê (10/11/2026): a do setor ou a pessoal de quem cadastrou. */
  visibilidade: VisibilidadeDaSenha;
  /**
   * O administrador vendo a pessoal de outra pessoa: chega só título, dono e
   * data — usuário, URL, notas e empresa vêm vazios do servidor, e a senha
   * nunca é revelável.
   */
  soExistencia: boolean;
  /** Quem do setor não vê ("menos…"). Só chega para quem coordena; vazio para os demais. */
  restritos: Pessoa[];
  /** O que esta pessoa pode fazer nesta linha — decidido no servidor, e conferido de novo em cada action. */
  pode: { revelar: boolean; editar: boolean; excluir: boolean };
  /** As escolhas de "Quem pode ver a senha" ao editar. */
  opcoesDeQuemVe: QuemVe[];
};

type CompanyOption = EmpresaParaEscolher & { name: string };

type Props = {
  credentials: CredentialRow[];
  companies: CompanyOption[];
  /** Quem coordena o setor da tela: muda o texto do vazio (as do setor são dela). */
  canManage: boolean;
  /** O setor que opera o módulo neste escritório — nem sempre o BPO (05/10/2026). */
  setorRotulo: string;
  /** Quem pode ser marcado em "menos…" — já sem a própria pessoa (10/11/2026). */
  pessoas: Pessoa[];
  createAction: (prev: BpoCredencialState, form: FormData) => Promise<BpoCredencialState>;
  updateAction: (id: string, prev: BpoCredencialState, form: FormData) => Promise<BpoCredencialState>;
  /** Cada linha diz se pode excluir (`pode.excluir`): o administrador, e o dono da pessoal. */
  deleteAction: (id: string) => Promise<void>;
  revealAction: (id: string) => Promise<{ error: string } | { password: string }>;
};

// ─── "Quem pode ver a senha" (10/11/2026, pedido do Kauan) ─────────────────

const ROTULO_DE_QUEM_VE: Record<QuemVe, string> = {
  SETOR: "Todos do setor",
  RESTRITA: "Todos do setor, menos…",
  PESSOAL: "Só eu (pessoal)",
};

const ICONE_DE_QUEM_VE: Record<QuemVe, React.ReactNode> = {
  SETOR: <Users />,
  RESTRITA: <UserX />,
  PESSOAL: <Lock />,
};

/** A escolha de agora de uma linha — RESTRITA quando há alguém marcado. */
function quemVeDaLinha(row: Pick<CredentialRow, "visibilidade" | "restritos">): QuemVe {
  if (row.visibilidade === "PESSOAL") return "PESSOAL";
  return row.restritos.length > 0 ? "RESTRITA" : "SETOR";
}

/**
 * A escolha em cartões (o `RadioGroup` de escolha que importa: quem vê uma
 * senha). "Menos…" abre o seletor de pessoas logo abaixo; quem só usa o
 * Repositório vê a opção pessoal sozinha, com a linha que diz por quê.
 */
function CampoDeQuemVe({
  opcoes,
  inicial,
  pessoas,
  marcados,
  setorRotulo,
}: {
  opcoes: QuemVe[];
  inicial: QuemVe;
  pessoas: Pessoa[];
  marcados: string[];
  setorRotulo: string;
}) {
  const [quemVe, setQuemVe] = useState<QuemVe>(opcoes.includes(inicial) ? inicial : opcoes[0]);
  const descricao: Record<QuemVe, string> = {
    SETOR: `Quem usa o Repositório de ${setorRotulo} vê e revela.`,
    RESTRITA: "Escolha quem do setor não vê esta senha.",
    PESSOAL: "Só você vê e revela. O administrador vê só que ela existe.",
  };
  const soPessoal = opcoes.length === 1 && opcoes[0] === "PESSOAL";

  return (
    <div className="flex flex-col gap-3">
      <RadioGroup<QuemVe>
        name="quemVe"
        legenda="Quem pode ver a senha"
        valor={quemVe}
        onChange={setQuemVe}
        opcoes={opcoes.map((v) => ({ valor: v, rotulo: ROTULO_DE_QUEM_VE[v], descricao: descricao[v], icone: ICONE_DE_QUEM_VE[v] }))}
      />
      {soPessoal && (
        <p className="text-helper text-fg-muted">
          As credenciais do setor são cadastradas pela coordenação de {setorRotulo}; esta fica só para você.
        </p>
      )}
      {quemVe === "RESTRITA" &&
        (pessoas.length > 0 ? (
          <AttendeePicker
            users={pessoas}
            name="restritos"
            label="Quem não vê a senha"
            defaultSelectedIds={marcados}
            placeholder="Buscar pessoa do setor…"
            vazio="Ninguém do setor com esse nome."
          />
        ) : (
          // O campo pedido aparece sempre: sem ninguém para marcar, diz por quê.
          <p className="text-helper text-fg-muted">
            Ninguém mais no setor para marcar. O administrador, quem cadastrou e você ficam sempre de fora da lista.
          </p>
        ))}
    </div>
  );
}

function CredentialFormFields({
  companies,
  defaults,
  quemVe,
}: {
  companies: CompanyOption[];
  defaults?: Partial<CredentialRow>;
  quemVe: React.ComponentProps<typeof CampoDeQuemVe>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <CampoForm label="Título" htmlFor="title" required>
        <Input id="title" name="title" required defaultValue={defaults?.title} placeholder="Ex: e-CAC, Simples Nacional, Banco Inter" />
      </CampoForm>
      <CampoForm label="Empresa" htmlFor="companyId" helper="Deixe em branco para uma credencial geral do setor.">
        <SearchableSelect
          id="companyId"
          name="companyId"
          defaultValue={defaults?.companyId ?? ""}
          options={opcoesDeEmpresa(companies)}
          avatar
          lembrarRecentes="empresas"
          vazioLabel="Geral (sem empresa)"
          placeholder="Buscar empresa…"
        />
      </CampoForm>
      {/* Usuário e senha são o par que se consulta junto: lado a lado. */}
      <FieldGrid>
        <CampoForm label="Usuário" htmlFor="username">
          <Input id="username" name="username" defaultValue={defaults?.username ?? ""} />
        </CampoForm>
        <CampoForm
          label="Senha"
          htmlFor="password"
          required={!defaults}
          helper={defaults ? "Deixe em branco para manter a senha atual." : undefined}
        >
          <CampoDeSenha id="password" name="password" required={!defaults} autoComplete="new-password" />
        </CampoForm>
      </FieldGrid>
      <CampoForm label="URL" htmlFor="url">
        <Input id="url" name="url" type="url" defaultValue={defaults?.url ?? ""} placeholder="https://…" />
      </CampoForm>
      <CampoForm label="Notas" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaults?.notes ?? ""} />
      </CampoForm>
      {/* Por último, como o "compartilhar" de um documento: primeiro o que é, depois quem vê. */}
      <CampoDeQuemVe {...quemVe} />
    </div>
  );
}

/**
 * "Nova credencial", no `action` do PageHeader da tela (08/10/2026) — a ação
 * da tela inteira fica no cabeçalho, como em pendências e no resto do app; era
 * um botão à direita da busca.
 *
 * Desde 10/11/2026 aparece para todo mundo que usa o Repositório do setor: quem
 * não coordena cadastra só a pessoal (`opcoes` = ["PESSOAL"]).
 */
export function NewCredentialModal({
  companies,
  createAction,
  opcoes,
  pessoas,
  setorRotulo,
}: {
  companies: CompanyOption[];
  createAction: Props["createAction"];
  opcoes: QuemVe[];
  pessoas: Pessoa[];
  setorRotulo: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(createAction, null);
  const wasPending = useRef(false);
  const toast = useToast();

  // useActionState não distingue "ainda não submeteu" de "submeteu com
  // sucesso" (os dois são `null`) — detecta sucesso pela transição
  // pending=true -> false sem erro, em vez de inferir do valor de state.
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setOpen(false);
      toast.success("Credencial criada.");
    }
    wasPending.current = isPending;
  }, [isPending, state, toast]);

  return (
    <>
      {/* No tamanho dos outros botões de criar do cabeçalho (5A, 08/10/2026). */}
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus size={14} /> Nova credencial
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova credencial" maxWidth="max-w-md">
        <form action={formAction} className="flex flex-col gap-4">
          <CredentialFormFields
            companies={companies}
            quemVe={{ opcoes, inicial: opcoes[0] ?? "PESSOAL", pessoas, marcados: [], setorRotulo }}
          />
          <FormFooter
            pending={isPending}
            submitLabel="Criar"
            pendingLabel="Criando…"
            onCancel={() => setOpen(false)}
            erro={state?.error}
          />
        </form>
      </Modal>
    </>
  );
}

function EditCredentialModal({
  row, companies, pessoas, setorRotulo, updateAction, onClose,
}: {
  row: CredentialRow;
  companies: CompanyOption[];
  pessoas: Pessoa[];
  setorRotulo: string;
  updateAction: Props["updateAction"];
  onClose: () => void;
}) {
  const boundAction = updateAction.bind(null, row.id);
  const [state, formAction, isPending] = useActionState(boundAction, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) onClose();
    wasPending.current = isPending;
  }, [isPending, state, onClose]);

  // Quem cadastrou não entra em "menos…" (a própria pessoa já veio de fora).
  const marcaveis = pessoas.filter((p) => p.id !== row.createdById);

  return (
    <Modal open onClose={onClose} title={`Editar — ${row.title}`} maxWidth="max-w-md">
      <form action={formAction} className="flex flex-col gap-4">
        <CredentialFormFields
          companies={companies}
          defaults={row}
          quemVe={{
            opcoes: row.opcoesDeQuemVe,
            inicial: quemVeDaLinha(row),
            pessoas: marcaveis,
            marcados: row.restritos.map((p) => p.id),
            setorRotulo,
          }}
        />
        <FormFooter
          pending={isPending}
          onCancel={onClose}
          erro={state?.error}
        />
      </form>
    </Modal>
  );
}

/**
 * Editar e excluir a credencial: "Editar" em botão, e o Excluir no "⋯" — era
 * um par de ícones soltos (até 30/09), e a lixeira ficava a um clique
 * acidental do lápis. Mesmo desenho das linhas de Cadastros.
 *
 * Desde 10/11/2026 cada um aparece pela regra da linha: a pessoal de outra
 * pessoa, para o administrador, só tem o Excluir.
 */
function AcoesDaCredencial({ onEditar, onExcluir }: { onEditar?: () => void; onExcluir?: () => void }) {
  if (!onEditar && !onExcluir) return null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {onEditar && (
        <Button variant="secondary" size="xs" onClick={onEditar}>
          <Pencil size={12} /> Editar
        </Button>
      )}
      {/* O gatilho do `MenuDeMaisAcoes` (08/10/2026): estava copiado à mão.
          Só com o Excluir, que é do administrador (13/10/2026). */}
      {onExcluir && (
      <MenuDeMaisAcoes rotulo="Mais ações" aria-label="Mais ações da credencial" width={180}>
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              onExcluir();
            }}
          >
            Excluir
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      )}
    </span>
  );
}

/** O valor de "Quem vê" no funil da coluna. A restrita só aparece assim para quem coordena. */
const VALOR_DO_FUNIL: Record<QuemVe, string> = {
  SETOR: "Do setor",
  RESTRITA: "Do setor, menos…",
  PESSOAL: "Pessoal",
};

/**
 * O selo de quem vê (10/11/2026): na coluna "Quem vê" da tabela e embaixo do
 * título no cartão do celular. "Restrita" só chega para quem coordena, com os
 * nomes na dica (e para o leitor de tela, no texto oculto). A do setor
 * inteiro, que é quase toda, não ganha selo: na tabela fica o texto simples,
 * no cartão nada.
 */
function SeloDeQuemVe({ row, comTextoDoSetor = false }: { row: CredentialRow; comTextoDoSetor?: boolean }) {
  if (row.visibilidade === "PESSOAL") {
    return (
      <Badge variant="neutral" className="gap-1">
        <Lock size={11} aria-hidden />
        {row.soExistencia ? `Pessoal de ${row.createdByName}` : "Pessoal"}
      </Badge>
    );
  }
  const n = row.restritos.length;
  if (n === 0) return comTextoDoSetor ? <>{VALOR_DO_FUNIL.SETOR}</> : null;
  const nomes = row.restritos.map((p) => p.name).join(", ");
  return (
    <span
      tabIndex={0}
      data-dica={`Não ${n === 1 ? "vê" : "veem"}: ${nomes}`}
      className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Badge variant="neutral" className="gap-1">
        <EyeOff size={11} aria-hidden />
        Restrita: {n} {n === 1 ? "pessoa não vê" : "pessoas não veem"}
        <span className="sr-only"> ({nomes})</span>
      </Badge>
    </span>
  );
}

/** Onde a senha ficaria, na linha que não se revela: diz por quê, sem olho. */
function SemRevelar() {
  return <span className="text-helper text-fg-muted">Só quem cadastrou revela</span>;
}

function PasswordCell({ credentialId, revealAction }: { credentialId: string; revealAction: Props["revealAction"] }) {
  const [password, setPassword] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function reveal() {
    startTransition(async () => {
      const res = await revealAction(credentialId);
      if ("password" in res) setPassword(res.password);
      else toast.error(res.error);
    });
  }

  function copy() {
    if (!password) return;
    navigator.clipboard.writeText(password).then(() => toast.success("Senha copiada."));
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="tnum text-fg-secondary">{password ?? "••••••••"}</span>
      <IconButton
        size="sm"
        onClick={() => (password ? setPassword(null) : reveal())}
        disabled={isPending}
        aria-label={password ? "Ocultar senha" : "Revelar senha"}
        title={password ? "Ocultar senha" : "Revelar senha"}
      >
        {password ? <EyeOff size={13} /> : <Eye size={13} />}
      </IconButton>
      {password && (
        <IconButton size="sm" onClick={copy} aria-label="Copiar senha" title="Copiar senha">
          <Copy size={13} />
        </IconButton>
      )}
    </div>
  );
}

export function BpoCredentialsList({ credentials, companies, canManage, setorRotulo, pessoas, updateAction, deleteAction, revealAction }: Omit<Props, "createAction">) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const editingRow = credentials.find((c) => c.id === editingId) ?? null;

  // Filtro só no cliente — lista inteira já vem carregada da página (sem
  // paginação/busca no servidor, mesmo espírito de listas pequenas do BPO).
  const normalizedSearch = search.trim().toLowerCase();
  const filteredCredentials = normalizedSearch
    ? credentials.filter((c) =>
        [c.title, c.companyName, c.username].some((field) => field?.toLowerCase().includes(normalizedSearch))
      )
    : credentials;
  const temAcoes = credentials.some((c) => c.pode.editar || c.pode.excluir);

  function handleDelete(row: CredentialRow) {
    requestConfirm(
      {
        title: `Excluir a credencial "${row.title}"?`,
        description: row.soExistencia
          ? `Só ${row.createdByName} conhece esta senha. Ela sai do cofre e não pode ser recuperada.`
          : "Esta ação não pode ser desfeita.",
        destructive: true,
        confirmLabel: "Excluir",
      },
      async () => {
        await deleteAction(row.id);
        toast.success("Credencial excluída.");
      }
    );
  }

  function acoesDaLinha(row: CredentialRow) {
    return (
      <AcoesDaCredencial
        onEditar={row.pode.editar ? () => setEditingId(row.id) : undefined}
        onExcluir={row.pode.excluir ? () => handleDelete(row) : undefined}
      />
    );
  }

  // No casco das listas irmãs do BPO, com a contagem e a busca na barra e o
  // vazio dentro (08/10/2026). A busca ficava solta acima da tabela, ao lado
  // do "Nova credencial", que foi para o cabeçalho da tela.
  return (
    <>
      <CascoDaTabela
        contagem={contarItens(filteredCredentials.length, "credencial", "credenciais")}
        busca={
          credentials.length > 0 ? (
            // A caixa de busca do Connect, com o "limpar" próprio (15/10/2026).
            <CampoDeBusca
              compact
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, empresa ou usuário…"
              aria-label="Buscar credenciais"
              className="w-72 max-w-full"
            />
          ) : undefined
        }
      >
      {credentials.length === 0 ? (
        <EmptyState
          icon={<KeyRound />}
          title="Nenhuma credencial cadastrada ainda"
          description={
            canManage
              ? "Use “+ Nova credencial”, no alto da tela, para cadastrar a primeira do setor."
              : `Use “+ Nova credencial” para guardar uma senha só sua. As do setor são cadastradas pela coordenação de ${setorRotulo}.`
          }
        />
      ) : filteredCredentials.length === 0 ? (
        <EmptyState icon={<KeyRound />} title="Nenhuma credencial encontrada" description="Tente ajustar a busca." />
      ) : (
      // Tabela no casco padrão, com funil em Empresa e Criada por (30/09) — a
      // lista inteira já está aqui, então o funil filtra no navegador, junto
      // com a busca. No celular, cartões: a tabela de 760px rolava de lado.
      // "Quem vê" (10/11/2026) é mais uma coluna com funil: ver só as pessoais
      // ou só as do setor sem um filtro novo na barra (regra de 30/09: filtro
      // da lista é o "Filtros" ou o funil da coluna).
      <>
        <CartoesNoCelular>
          {filteredCredentials.map((row) => (
            <Cartao key={row.id}>
              <TopoDoCartao nome={row.title} />
              <div className="mt-1 flex flex-wrap gap-1.5 empty:hidden">
                <SeloDeQuemVe row={row} />
              </div>
              {!row.soExistencia && (
                <InfoDoCartao>
                  {row.companyName ?? "Geral"}
                  {row.username ? ` · ${row.username}` : ""}
                </InfoDoCartao>
              )}
              {row.url && (
                <a href={row.url} target="_blank" rel="noopener noreferrer" className="block text-micro text-brand hover:underline truncate">
                  {row.url}
                </a>
              )}
              <div className="mt-1.5">
                {row.pode.revelar ? <PasswordCell credentialId={row.id} revealAction={revealAction} /> : <SemRevelar />}
              </div>
              <PeDoCartao>
                <span className="text-micro text-fg-muted">
                  {row.createdByName} · {row.createdAtLabel}
                </span>
                {(row.pode.editar || row.pode.excluir) && <span className="ml-auto">{acoesDaLinha(row)}</span>}
              </PeDoCartao>
            </Cartao>
          ))}
        </CartoesNoCelular>

        <TabelaFiltravel
          linhas={filteredCredentials.map((row) => ({
            id: row.id,
            // A pessoal dos outros não diz a empresa: fica no "(vazio)" do funil.
            valores: {
              empresa: row.soExistencia ? null : (row.companyName ?? "Geral"),
              quemVe: VALOR_DO_FUNIL[quemVeDaLinha(row)],
              criador: row.createdByName,
            },
          }))}
        >
          <TabelaNoDesktop padrao>
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Empresa" chave="empresa" />
                  </th>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Senha</th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Quem vê" chave="quemVe" />
                  </th>
                  <th className="px-4 py-3">
                    <FiltroDaColuna rotulo="Criada por" chave="criador" align="right" />
                  </th>
                  {temAcoes && (
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredCredentials.map((row) => (
                  <LinhaFiltravel key={row.id} id={row.id} className="border-b border-border">
                    <td className="px-4 py-3 font-medium text-fg">
                      {row.title}
                      {row.url && (
                        <a href={row.url} target="_blank" rel="noopener noreferrer" className="block text-micro font-normal text-brand hover:underline truncate max-w-[220px]" title={row.url}>
                          {row.url}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{row.soExistencia ? "—" : (row.companyName ?? "Geral")}</td>
                    <td className="px-4 py-3 text-fg-secondary">{row.username ?? "—"}</td>
                    <td className="px-4 py-3">
                      {row.pode.revelar ? <PasswordCell credentialId={row.id} revealAction={revealAction} /> : <SemRevelar />}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      <SeloDeQuemVe row={row} comTextoDoSetor />
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {row.createdByName}
                      <span className="block text-micro text-fg-muted">{row.createdAtLabel}</span>
                    </td>
                    {temAcoes && <td className="px-4 py-3">{acoesDaLinha(row)}</td>}
                  </LinhaFiltravel>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
        </TabelaFiltravel>
      </>
      )}
      </CascoDaTabela>

      {editingRow && (
        <EditCredentialModal
          row={editingRow}
          companies={companies}
          pessoas={pessoas}
          setorRotulo={setorRotulo}
          updateAction={updateAction}
          onClose={() => setEditingId(null)}
        />
      )}
      {dialog}
    </>
  );
}
