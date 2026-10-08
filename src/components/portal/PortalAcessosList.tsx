"use client";

import { useActionState, useTransition } from "react";
import { Power, PowerOff, Send, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { ItemDoMenu } from "@/components/ui/Popover";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";
import { JanelaDeCadastro } from "@/components/admin/JanelaDeCadastro";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/shared/StatusDot";
import type { EstadoDoAcesso } from "@/app/(app)/admin/portal/actions";

type Acesso = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  cliente: string;
  ultimoAcesso: string | null;
};

type Cliente = { id: string; nome: string; empresas: number };

type CriarAcesso = (anterior: EstadoDoAcesso, form: FormData) => Promise<EstadoDoAcesso>;

type Props = {
  acessos: Acesso[];
  enviarLinkAction: (id: string) => Promise<{ error: string } | { ok: true }>;
  alternarAction: (id: string, ativo: boolean) => Promise<void>;
};

/**
 * O "+ Novo acesso" do cabeçalho de /admin/portal, que abre o formulário numa
 * janela (escolha 5A, 08/10/2026). Morava num cartão aberto acima da lista,
 * com a lista embaixo sob um segundo título ("Acessos").
 */
export function NovoAcessoDoPortal({ clientes, criarAction }: { clientes: Cliente[]; criarAction: CriarAcesso }) {
  return (
    <JanelaDeCadastro rotulo="Novo acesso" maxWidth="max-w-xl">
      {(fechar) => <FormularioDoAcesso clientes={clientes} criarAction={criarAction} fechar={fechar} />}
    </JanelaDeCadastro>
  );
}

function FormularioDoAcesso({ clientes, criarAction, fechar }: { clientes: Cliente[]; criarAction: CriarAcesso; fechar: () => void }) {
  const toast = useToast();
  // Deu certo: a janela fecha e o retorno vai para o aviso que some sozinho
  // — quando o e-mail não sai, o aviso diz isso e o que fazer.
  const [estado, formAction, criando] = useActionState<EstadoDoAcesso, FormData>(async (anterior, form) => {
    const r = await criarAction(anterior, form);
    if (r && "ok" in r) {
      if (r.aviso) toast.show(r.aviso, "info");
      else toast.success("Acesso criado e link enviado.");
      fechar();
    }
    return r;
  }, null);

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-helper text-fg-muted">
        A conta nasce <span className="font-medium text-fg">sem senha</span> — nem quem cria sabe
        qual é. O cliente recebe por e-mail um link para definir a dele.
      </p>
      <FieldGrid>
        <CampoForm label="Nome" htmlFor="nome" required>
          <Input id="nome" name="nome" required placeholder="Quem vai acessar" />
        </CampoForm>
        <CampoForm label="E-mail" htmlFor="email" required>
          <Input id="email" name="email" type="email" required />
        </CampoForm>
        <CampoForm
          label="Cliente"
          htmlFor="clientGroupId"
          helper="Define quais empresas esta conta enxerga. Cliente sem empresa não mostra documento nenhum."
          required
          className="sm:col-span-2"
        >
          <Select id="clientGroupId" name="clientGroupId" required defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({c.empresas} {c.empresas === 1 ? "empresa" : "empresas"})
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>
      <FormFooter
        pending={criando}
        pendingLabel="Criando…"
        submitLabel="Criar acesso"
        onCancel={fechar}
        erro={estado && "erro" in estado ? estado.erro : undefined}
      />
    </form>
  );
}

/**
 * Os acessos do portal, na tela da equipe (/admin/portal).
 *
 * Revisão de 07/10/2026: a lista no `CascoDaTabela`, com a contagem na barra
 * (era "Acessos (N)" no título) e o vazio no `EmptyState`; o "Link enviado."
 * no aviso que some sozinho — aparecia embaixo da tabela, longe do botão
 * clicado —; e o "Desativar" pede confirmação, porque corta na hora o acesso
 * do cliente. Reativar não pede: não tira nada de ninguém.
 */
export function PortalAcessosList({ acessos, enviarLinkAction, alternarAction }: Props) {
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  function enviarLink(a: Acesso) {
    startTransition(async () => {
      const r = await enviarLinkAction(a.id);
      if ("error" in r) toast.error(r.error);
      else toast.success(`Link enviado para ${a.email}.`);
    });
  }

  function alternar(a: Acesso) {
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

  // "Enviar link" é botão; desativar/reativar vai no "⋯" — era texto cinza
  // colado no "Enviar link", a um clique de tirar o acesso de um cliente
  // (polimento de 30/09).
  function acoes(a: Acesso) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="secondary" size="xs" disabled={pendente || !a.ativo} onClick={() => enviarLink(a)}>
          <Send size={14} /> Enviar link
        </Button>
        <MenuDeMaisAcoes rotulo={`Mais ações de ${a.nome}`}>
          {(fechar) => (
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
            description="Crie o primeiro em “Novo acesso”: a pessoa recebe por e-mail o link para definir a senha."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {acessos.map((a) => (
                <Cartao key={a.id}>
                  <TopoDoCartao nome={a.nome} />
                  <InfoDoCartao>
                    {a.email} · {a.cliente}
                  </InfoDoCartao>
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
                funil em cliente e situação (polimento de 30/09). */}
            <TabelaFiltravel
              linhas={acessos.map((a) => ({
                id: a.id,
                valores: { cliente: a.cliente, situacao: a.ativo ? "Ativo" : "Inativo" },
              }))}
            >
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[760px] text-ui">
                  <thead>
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">
                        <FiltroDaColuna rotulo="Cliente" chave="cliente" />
                      </th>
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
                    {acessos.map((a) => (
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
                          <span className="block max-w-[240px] text-fg-secondary truncate" title={a.cliente}>
                            {a.cliente}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{a.ultimoAcesso ?? "nunca entrou"}</td>
                        <td className="px-4 py-3">
                          <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                        </td>
                        <td className="px-4 py-3">{acoes(a)}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaFiltravel>
          </>
        )}
        </CascoDaTabela>
      </div>
      {dialog}
    </>
  );
}
