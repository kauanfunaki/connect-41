"use client";

import { useActionState, useState, useTransition } from "react";
import { Power, PowerOff, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ItemDoMenu } from "@/components/ui/Popover";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
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

export function PortalAcessosList({ acessos, clientes, criarAction, enviarLinkAction, alternarAction }: Props) {
  const [estado, formAction, criando] = useActionState<EstadoDoAcesso, FormData>(criarAction, null);
  const [pendente, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<string | null>(null);

  function enviarLink(id: string) {
    setMensagem(null);
    startTransition(async () => {
      const r = await enviarLinkAction(id);
      setMensagem("error" in r ? r.error : "Link enviado.");
    });
  }

  // "Enviar link" é botão; desativar/reativar vai no "⋯" — era texto cinza
  // colado no "Enviar link", a um clique de tirar o acesso de um cliente
  // (polimento de 30/09).
  function acoes(a: Acesso) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="secondary" size="xs" disabled={pendente || !a.ativo} onClick={() => enviarLink(a.id)}>
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
                startTransition(() => void alternarAction(a.id, !a.ativo));
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
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">Novo acesso</h2>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
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
              <p className="mr-auto min-w-0 text-[length:var(--fs-helper)] text-danger">{estado.erro}</p>
            )}
            {estado && "ok" in estado && (
              <p className="mr-auto min-w-0 text-[length:var(--fs-helper)] text-success">
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
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3">
          Acessos ({acessos.length})
        </h2>
        {acessos.length === 0 ? (
          <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhum acesso criado ainda.</p>
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
                <table className="w-full min-w-[760px] text-[length:var(--fs-ui)]">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-muted">
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
                          <span className="block max-w-[280px] text-[length:var(--fs-micro)] text-fg-muted truncate" title={a.email}>
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
        {mensagem && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-3">{mensagem}</p>}
      </div>
    </div>
  );
}
