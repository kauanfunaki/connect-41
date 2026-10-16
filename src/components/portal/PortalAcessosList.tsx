"use client";

import { useActionState, useState, useTransition } from "react";
import { Pencil, Power, PowerOff, Send, Trash2, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { ItemDoMenu } from "@/components/ui/Popover";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { StatusDot } from "@/components/shared/StatusDot";
import { ExclusaoConfirmada, ListaDaExclusao } from "@/components/ui/ExclusaoConfirmada";
import { listaDeNomes, mensagemDoEmailRepetido, saidaParaOEmailRepetido } from "@/lib/portal/acessoExistente";
import { EscolhaDeEmpresas, type EmpresaParaEscolher, type EscolhaDeEmpresa } from "@/components/portal/EscolhaDeEmpresas";
import type { EstadoDoAcesso, ResumoDoAcessoParaExcluir } from "@/app/(app)/admin/portal/actions";

/** Uma empresa ligada direto ao acesso (as que vêm pela matriz seguem a matriz). */
export type EmpresaDoAcesso = { id: string; nome: string; incluiFiliais: boolean; filiais: number };

/** O mínimo de um acesso para as ações de linha (link, ligar/desligar, excluir). */
export type AcessoDaLinha = { id: string; nome: string; email: string; ativo: boolean };

type Acesso = AcessoDaLinha & {
  empresas: EmpresaDoAcesso[];
  ultimoAcesso: string | null;
};

type AcaoDoFormulario = (anterior: EstadoDoAcesso, form: FormData) => Promise<EstadoDoAcesso>;

/** As ações de linha que a lista da Administração e a ficha da empresa dividem. */
export type AcoesDaLinha = {
  enviarLinkAction: (id: string) => Promise<{ error: string } | { ok: true }>;
  alternarAction: (id: string, ativo: boolean) => Promise<void>;
  resumoParaExcluirAction: (id: string) => Promise<{ erro: string } | ResumoDoAcessoParaExcluir>;
  excluirAction: (id: string, confirmacao: string) => Promise<{ erro: string } | { ok: true }>;
};

type Props = AcoesDaLinha & {
  acessos: Acesso[];
  /** As empresas do escritório — as opções do "Editar". */
  empresas: EmpresaParaEscolher[];
  editarAction: AcaoDoFormulario;
  /** Só ADMIN e SUPER_ADMIN veem o "Excluir" (a action confere de novo). */
  podeExcluir: boolean;
};

/** "BLD MATRIZ + filiais, IRRIGA" — a coluna Empresas da lista. */
export function textoDasEmpresas(empresas: EmpresaDoAcesso[]): string {
  if (empresas.length === 0) return "Nenhuma empresa";
  return empresas.map((e) => (e.incluiFiliais && e.filiais > 0 ? `${e.nome} + filiais` : e.nome)).join(", ");
}

/**
 * O "+ Novo acesso" do cabeçalho de /admin/portal, que abre o formulário numa
 * janela (escolha 5A, 08/10/2026). Desde 14/10/2026 o acesso nasce ligado às
 * empresas escolhidas, e não mais a um Cliente.
 */
export function NovoAcessoDoPortal({ empresas, criarAction }: { empresas: EmpresaParaEscolher[]; criarAction: AcaoDoFormulario }) {
  return (
    <JanelaDeCadastro rotulo="Novo acesso" maxWidth="max-w-xl">
      {(fechar) => <FormularioDoAcesso escolha={{ tipo: "varias", empresas }} criarAction={criarAction} fechar={fechar} />}
    </JanelaDeCadastro>
  );
}

/**
 * De onde vêm as empresas do formulário: várias, escolhidas na lista
 * (Administração), ou uma só, fixa — a da ficha, onde só se decide o
 * "incluir filiais".
 */
export type EscolhaDoFormulario =
  | { tipo: "varias"; empresas: EmpresaParaEscolher[] }
  | { tipo: "fixa"; empresa: { id: string; nome: string; filiais: number } };

/**
 * O formulário de criar acesso — o da Administração e o da ficha da empresa.
 *
 * Campos controlados: depois do aviso de e-mail repetido, o "Reativar" ou
 * "Ligar" reenvia o formulário com o que está na tela — o React 19 limpa os
 * campos não controlados ao fim de cada envio.
 */
export function FormularioDoAcesso({
  escolha,
  criarAction,
  fechar,
}: {
  escolha: EscolhaDoFormulario;
  criarAction: AcaoDoFormulario;
  fechar: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [varias, setVarias] = useState<EscolhaDeEmpresa[]>([]);
  const [comFiliais, setComFiliais] = useState(true);

  const valor: EscolhaDeEmpresa[] =
    escolha.tipo === "fixa" ? [{ companyId: escolha.empresa.id, incluiFiliais: escolha.empresa.filiais > 0 ? comFiliais : true }] : varias;
  const nomes = new Map(
    escolha.tipo === "fixa" ? [[escolha.empresa.id, escolha.empresa.nome]] : escolha.empresas.map((e) => [e.id, e.nome] as const)
  );
  const escolhidas = valor.map((v) => ({ id: v.companyId, nome: nomes.get(v.companyId) ?? "Empresa" }));

  // Deu certo: a janela fecha e o retorno vai para o aviso que some sozinho
  // — quando o e-mail não sai, o aviso diz isso e o que fazer.
  const [estado, formAction, criando] = useActionState<EstadoDoAcesso, FormData>(async (anterior, form) => {
    const r = await criarAction(anterior, form);
    if (r && "ok" in r) {
      if (r.aviso) toast.show(r.aviso, "info");
      else toast.success(r.mensagem ?? "Acesso criado e link enviado.");
      fechar();
    }
    return r;
  }, null);

  // O aviso do e-mail repetido vale para o e-mail que foi conferido; trocou o
  // e-mail no campo, ele sai e o envio volta a ser o de criar.
  const existente =
    estado && "erro" in estado && estado.existente && estado.existente.email === email.trim().toLowerCase()
      ? estado.existente
      : undefined;
  const saida = existente ? saidaParaOEmailRepetido(existente, escolhidas) : null;
  const erroComum = estado && "erro" in estado && !estado.existente ? estado.erro : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {/* Com o aviso de e-mail repetido na tela, o Enter num campo enviaria
          pelo primeiro botão de envio do formulário — o "Reativar" ou o
          "Ligar". Um botão desligado antes dele faz o Enter não fazer nada:
          reaproveitar um acesso é sempre um clique de propósito. */}
      {existente && <button type="submit" disabled hidden aria-hidden tabIndex={-1} />}
      <p className="text-helper text-fg-muted">
        A conta nasce <span className="font-medium text-fg">sem senha</span> — nem quem cria sabe
        qual é. O cliente recebe por e-mail um link para definir a dele.
      </p>
      <FieldGrid>
        <CampoForm label="Nome" htmlFor="nome" required>
          <Input id="nome" name="nome" required placeholder="Quem vai acessar" value={nome} onChange={(e) => setNome(e.target.value)} />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </CampoForm>
        {escolha.tipo === "varias" ? (
          <CampoForm
            label="Empresas"
            htmlFor="novo-acesso-empresas"
            helper="O que esta conta enxerga no portal. Com “incluir filiais”, a filial cadastrada depois aparece sozinha."
            required
            className="sm:col-span-2"
          >
            <EscolhaDeEmpresas id="novo-acesso-empresas" empresas={escolha.empresas} valor={varias} onChange={setVarias} />
          </CampoForm>
        ) : (
          <div className="sm:col-span-2 space-y-2">
            <input type="hidden" name="empresas" value={JSON.stringify(valor)} />
            <p className="text-ui text-fg-secondary">
              A conta vê <span className="font-medium text-fg">{escolha.empresa.nome}</span> no portal.
            </p>
            {escolha.empresa.filiais > 0 && (
              <Checkbox
                id="novo-acesso-filiais"
                checked={comFiliais}
                onChange={(e) => setComFiliais(e.target.checked)}
                label={`Incluir ${escolha.empresa.filiais === 1 ? "a filial" : `as ${escolha.empresa.filiais} filiais`}`}
                helper="A filial cadastrada depois também aparece sozinha."
              />
            )}
          </div>
        )}
      </FieldGrid>

      {existente && (
        <Aviso tom="atencao">
          <p>{mensagemDoEmailRepetido(existente, escolhidas)}</p>
          {saida && (
            <>
              <p className="mt-1.5 text-fg-secondary">{saida.explicacao}</p>
              <div className="mt-2.5">
                {/* Volta para a mesma action, com os campos como estão na tela;
                    o `reaproveitar` diz qual acesso a pessoa viu. */}
                <Button type="submit" name="reaproveitar" value={existente.id} variant="secondary" size="sm" disabled={criando}>
                  {saida.botao}
                </Button>
              </div>
            </>
          )}
        </Aviso>
      )}

      <FormFooter
        pending={criando}
        pendingLabel="Enviando…"
        submitLabel="Criar acesso"
        onCancel={fechar}
        erro={erroComum}
        submitDisabled={!!existente || valor.length === 0}
      />
    </form>
  );
}

/**
 * Editar nome, e-mail e empresas de um acesso. Tirar empresa avisa antes de
 * salvar: a pessoa deixa de vê-la no portal na próxima tela, e o limite de
 * aprovação que tinha nela é desligado.
 */
function EditarAcesso({
  acesso,
  empresas,
  editarAction,
  fechar,
}: {
  acesso: Acesso;
  empresas: EmpresaParaEscolher[];
  editarAction: AcaoDoFormulario;
  fechar: () => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState(acesso.nome);
  const [email, setEmail] = useState(acesso.email);
  const [valor, setValor] = useState<EscolhaDeEmpresa[]>(acesso.empresas.map((e) => ({ companyId: e.id, incluiFiliais: e.incluiFiliais })));

  const [estado, formAction, salvando] = useActionState<EstadoDoAcesso, FormData>(async (anterior, form) => {
    const r = await editarAction(anterior, form);
    if (r && "ok" in r) {
      toast.success(r.mensagem ?? "Acesso atualizado.");
      fechar();
    }
    return r;
  }, null);

  // A empresa ligada hoje pode ter saído da lista de opções (excluída no
  // meio do caminho): entra como opção para o formulário não tirá-la calado.
  const opcoes = [
    ...empresas,
    ...acesso.empresas
      .filter((e) => !empresas.some((x) => x.id === e.id))
      .map((e) => ({ id: e.id, nome: e.nome, cnpj: null, filiais: e.filiais, matrizNome: null, foraDeOperacao: false })),
  ];
  const ficam = new Set(valor.map((v) => v.companyId));
  const saem = acesso.empresas.filter((e) => !ficam.has(e.id));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={acesso.id} />
      <FieldGrid>
        <CampoForm label="Nome" htmlFor="editar-nome" required>
          <Input id="editar-nome" name="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="editar-email" required helper="É o e-mail com que a pessoa entra no portal.">
          <Input id="editar-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </CampoForm>
        <CampoForm
          label="Empresas"
          htmlFor="editar-empresas"
          helper="O que esta conta enxerga no portal. Com “incluir filiais”, a filial cadastrada depois aparece sozinha."
          required
          className="sm:col-span-2"
        >
          <EscolhaDeEmpresas id="editar-empresas" empresas={opcoes} valor={valor} onChange={setValor} />
        </CampoForm>
      </FieldGrid>

      {saem.length > 0 && (
        <Aviso tom="atencao">
          Ao salvar, {acesso.nome} deixa de ver {listaDeNomes(saem.map((e) => e.nome))} no portal. Os limites de aprovação de
          pagamento que tinha {saem.length === 1 ? "nela são desligados" : "nelas são desligados"}.
        </Aviso>
      )}

      <FormFooter
        pending={salvando}
        onCancel={fechar}
        erro={estado && "erro" in estado ? estado.erro : undefined}
        submitDisabled={valor.length === 0}
      />
    </form>
  );
}

type Exclusao = {
  acesso: AcessoDaLinha;
  resumo: ResumoDoAcessoParaExcluir | null;
  /** A contagem não veio. */
  erroDoResumo: string | null;
  /** A exclusão voltou com erro (nome que não confere, por exemplo). */
  erro: string | null;
};

/**
 * Enviar link, desativar/reativar e excluir um acesso — o mesmo na lista da
 * Administração e na aba "Acesso ao portal" da ficha da empresa (14/10/2026).
 * Devolve as funções e os diálogos, que quem usa põe na tela.
 */
export function useAcoesDoAcesso({ enviarLinkAction, alternarAction, resumoParaExcluirAction, excluirAction }: AcoesDaLinha) {
  const [pendente, startTransition] = useTransition();
  const [excluindo, startExcluir] = useTransition();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);

  function enviarLink(a: AcessoDaLinha) {
    startTransition(async () => {
      const r = await enviarLinkAction(a.id);
      if ("error" in r) toast.error(r.error);
      else toast.success(`Link enviado para ${a.email}.`);
    });
  }

  function alternar(a: AcessoDaLinha) {
    if (!a.ativo) {
      startTransition(() => void alternarAction(a.id, true));
      return;
    }
    requestConfirm(
      {
        title: `Desativar o acesso de ${a.nome}?`,
        description: "A pessoa deixa de entrar no portal a partir de agora. Dá para reativar depois, pelo mesmo menu.",
        confirmLabel: "Desativar",
        destructive: true,
      },
      () => alternarAction(a.id, false)
    );
  }

  // A contagem do que está ligado vem quando a janela abre — no clique, não
  // num efeito: a action chega por prop e muda de identidade a cada
  // revalidação.
  function abrirExclusao(a: AcessoDaLinha) {
    setExclusao({ acesso: a, resumo: null, erroDoResumo: null, erro: null });
    resumoParaExcluirAction(a.id)
      .catch(() => ({ erro: "Não foi possível conferir o que está ligado a este acesso. Tente de novo." }))
      .then((r) =>
        setExclusao((atual) =>
          atual && atual.acesso.id === a.id
            ? "erro" in r
              ? { ...atual, erroDoResumo: r.erro }
              : { ...atual, resumo: r }
            : atual
        )
      );
  }

  function excluir(digitado: string) {
    if (!exclusao) return;
    const alvo = exclusao.acesso;
    startExcluir(async () => {
      const r = await excluirAction(alvo.id, digitado).catch(() => ({ erro: "Não foi possível excluir. Tente de novo." }));
      if ("erro" in r) {
        setExclusao((atual) => (atual ? { ...atual, erro: r.erro } : atual));
        return;
      }
      toast.success(`Acesso de ${alvo.nome} excluído.`);
      setExclusao(null);
    });
  }

  const resumo = exclusao?.resumo;
  const semHistorico = resumo && resumo.historico.ficam.length === 0 && resumo.historico.apagados.length === 0;

  const dialogos = (
    <>
      {dialog}
      {exclusao && (
        <ExclusaoConfirmada
          key={exclusao.acesso.id}
          titulo={`Excluir o acesso de ${exclusao.acesso.nome}?`}
          descricao="O acesso é apagado de vez, e o e-mail fica livre para um acesso novo. As empresas continuam como estão."
          nome={exclusao.acesso.nome}
          alternativas={[exclusao.acesso.email]}
          rotuloDoBotao="Excluir acesso"
          carregando={!resumo && !exclusao.erroDoResumo}
          indisponivel={!!exclusao.erroDoResumo}
          pending={excluindo}
          erro={exclusao.erroDoResumo ?? exclusao.erro}
          onConfirm={excluir}
          onCancel={() => {
            if (!excluindo) setExclusao(null);
          }}
        >
          {resumo && (
            <>
              <p className="text-ui text-fg-secondary">
                {resumo.email} · {resumo.empresas}
              </p>
              {semHistorico ? (
                <Aviso tom="neutro">Este acesso não tem nada registrado no portal. Só ele é apagado.</Aviso>
              ) : (
                <>
                  <ListaDaExclusao titulo="Continuam guardados, sem o nome de quem fez:" itens={resumo.historico.ficam} />
                  <ListaDaExclusao titulo="São apagados junto:" itens={resumo.historico.apagados} />
                </>
              )}
              <p className="text-helper text-fg-muted">Se a pessoa estiver com o portal aberto, ela sai na próxima tela.</p>
            </>
          )}
        </ExclusaoConfirmada>
      )}
    </>
  );

  return { pendente, enviarLink, alternar, abrirExclusao, dialogos };
}

/**
 * Os acessos do portal, na tela da equipe (/admin/portal).
 *
 * Revisão de 07/10/2026: a lista no `CascoDaTabela`, com a contagem na barra
 * (era "Acessos (N)" no título) e o vazio no `EmptyState`; o "Link enviado."
 * no aviso que some sozinho — aparecia embaixo da tabela, longe do botão
 * clicado —; e o "Desativar" pede confirmação, porque corta na hora o acesso
 * do cliente. Reativar não pede: não tira nada de ninguém.
 *
 * 13/10/2026: "Editar" e "Excluir" de verdade no "⋯".
 * 14/10/2026: a coluna "Cliente" virou "Empresas" — o acesso é ligado direto a
 * elas, com "+ filiais" quando inclui as filiais.
 */
export function PortalAcessosList({ acessos, empresas, editarAction, podeExcluir, ...acoesDaLinha }: Props) {
  const [editando, setEditando] = useState<Acesso | null>(null);
  const { pendente, enviarLink, alternar, abrirExclusao, dialogos } = useAcoesDoAcesso(acoesDaLinha);

  // "Enviar link" é botão; editar, desativar/reativar e excluir vão no "⋯" —
  // era texto cinza colado no "Enviar link", a um clique de tirar o acesso de
  // um cliente (polimento de 30/09).
  function acoes(a: Acesso) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="secondary" size="xs" disabled={pendente || !a.ativo} onClick={() => enviarLink(a)}>
          <Send size={14} /> Enviar link
        </Button>
        <MenuDeMaisAcoes rotulo={`Mais ações de ${a.nome}`}>
          {(fechar) => (
            <>
              <ItemDoMenu
                icone={<Pencil />}
                disabled={pendente}
                onClick={() => {
                  fechar();
                  setEditando(a);
                }}
              >
                Editar
              </ItemDoMenu>
              <ItemDoMenu
                icone={a.ativo ? <PowerOff /> : <Power />}
                danger={a.ativo}
                disabled={pendente}
                onClick={() => {
                  fechar();
                  alternar(a);
                }}
              >
                {a.ativo ? "Desativar" : "Reativar"}
              </ItemDoMenu>
              {podeExcluir && (
                <ItemDoMenu
                  icone={<Trash2 />}
                  danger
                  disabled={pendente}
                  onClick={() => {
                    fechar();
                    abrirExclusao(a);
                  }}
                >
                  Excluir
                </ItemDoMenu>
              )}
            </>
          )}
        </MenuDeMaisAcoes>
      </span>
    );
  }

  return (
    <>
      <div>
        <CascoDaTabela contagem={contarItens(acessos.length, "acesso", "acessos")}>
        {acessos.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title="Nenhum acesso criado ainda"
            description="Crie o primeiro em “Novo acesso”, ou na ficha da empresa, em “Acesso ao portal”: a pessoa recebe por e-mail o link para definir a senha."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {acessos.map((a) => (
                <Cartao key={a.id}>
                  <TopoDoCartao nome={a.nome} />
                  <InfoDoCartao>{a.email}</InfoDoCartao>
                  <InfoDoCartao>{textoDasEmpresas(a.empresas)}</InfoDoCartao>
                  <InfoDoCartao>{a.ultimoAcesso ? `entrou em ${a.ultimoAcesso}` : "nunca entrou"}</InfoDoCartao>
                  <PeDoCartao>
                    <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                    <span className="ml-auto">{acoes(a)}</span>
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>

            {/* Era uma lista com cliente e último acesso numa linha cinza, e as
                ações em texto azul e cinza. Virou tabela no casco padrão, com
                funil na situação (polimento de 30/09). */}
            <TabelaFiltravel
              linhas={acessos.map((a) => ({
                id: a.id,
                valores: { situacao: a.ativo ? "Ativo" : "Inativo" },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[760px] text-ui">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Empresas</th>
                      <th className="px-4 py-3">Último acesso</th>
                      <th className="px-4 py-3">
                        <FiltroDaColuna rotulo="Situação" chave="situacao" align="right" />
                      </th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {acessos.map((a) => {
                      const empresasDoAcesso = textoDasEmpresas(a.empresas);
                      return (
                        <LinhaFiltravel key={a.id} id={a.id} className="border-b border-border">
                          <td className="px-4 py-3">
                            <span className="block max-w-[280px] text-fg truncate" title={a.nome}>
                              {a.nome}
                            </span>
                            <span className="block max-w-[280px] text-micro text-fg-muted truncate" title={a.email}>
                              {a.email}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`block max-w-[320px] truncate ${a.empresas.length === 0 ? "text-fg-muted" : "text-fg-secondary"}`}
                              title={empresasDoAcesso}
                            >
                              {empresasDoAcesso}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{a.ultimoAcesso ?? "nunca entrou"}</td>
                          <td className="px-4 py-3">
                            <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                          </td>
                          <td className="px-4 py-3">{acoes(a)}</td>
                        </LinhaFiltravel>
                      );
                    })}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
        </CascoDaTabela>
      </div>
      {dialogos}

      <Modal open={editando !== null} onClose={() => setEditando(null)} title="Editar acesso" maxWidth="max-w-xl">
        {editando && (
          <EditarAcesso
            key={editando.id}
            acesso={editando}
            empresas={empresas}
            editarAction={editarAction}
            fechar={() => setEditando(null)}
          />
        )}
      </Modal>
    </>
  );
}
