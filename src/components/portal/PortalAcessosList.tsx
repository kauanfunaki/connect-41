"use client";

import { useActionState, useTransition } from "react";
import { Power, PowerOff, Send, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { ItemDoMenu } from "@/components/ui/Popover";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";
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

type Props = {
  acessos: Acesso[];
  clientes: Cliente[];
  criarAction: (anterior: EstadoDoAcesso, form: FormData) => Promise<EstadoDoAcesso>;
  enviarLinkAction: (id: string) => Promise<{ error: string } | { ok: true }>;
  alternarAction: (id: string, ativo: boolean) => Promise<void>;
};

/**
 * Os acessos do portal, na tela da equipe (/admin/portal).
 *
 * Revisão de 07/10/2026: a lista no `CascoDaTabela`, com a contagem na barra
 * (era "Acessos (N)" no título) e o vazio no `EmptyState`; o "Link enviado."
 * no aviso que some sozinho — aparecia embaixo da tabela, longe do botão
 * clicado —; e o "Desativar" pede confirmação, porque corta na hora o acesso
 * do cliente. Reativar não pede: não tira nada de ninguém.
 */
export function PortalAcessosList({ acessos, clientes, criarAction, enviarLinkAction, alternarAction }: Props) {
  const [estado, formAction, criando] = useActionState<EstadoDoAcesso, FormData>(criarAction, null);
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
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-section font-semibold text-fg mb-1">Novo acesso</h2>
        <p className="text-helper text-fg-muted mb-4">
          A conta nasce <span className="font-medium text-fg">sem senha</span> — nem quem cria sabe
          qual é. O cliente recebe por e-mail um link para definir a dele.
        </p>
        {/* Os três campos numa grade só (o Cliente ocupa a linha de baixo
            inteira), e o "Criar acesso" no rodapé à direita, com o retorno da
            ação ao lado dele — o botão ficava solto à esquerda, embaixo das
            mensagens. */}
        <form action={formAction}>
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

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 mt-5 border-t border-border">
            {estado && "erro" in estado && (
              <p className="mr-auto min-w-0 text-helper text-danger">{estado.erro}</p>
            )}
            {estado && "ok" in estado && (
              <p className="mr-auto min-w-0 text-helper text-success-fg">
                {estado.aviso ?? "Acesso criado e link enviado."}
              </p>
            )}
            <Button type="submit" disabled={criando}>
              {criando ? "Criando…" : "Criar acesso"}
            </Button>
          </div>
        </form>
      </Card>

      <div>
        <h2 className="text-section font-semibold text-fg mb-3">Acessos</h2>
        <CascoDaTabela contagem={contarItens(acessos.length, "acesso", "acessos")}>
        {acessos.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title="Nenhum acesso criado ainda"
            description="Crie o primeiro no formulário acima: a pessoa recebe por e-mail o link para definir a senha."
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
    </div>
  );
}
