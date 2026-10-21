"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Network, Power, PowerOff, Send, Trash2, Unlink, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { FormFooter } from "@/components/ui/FormFooter";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { StatusDot } from "@/components/shared/StatusDot";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";
import { FormularioDoAcesso, useAcoesDoAcesso, type AcoesDaLinha } from "@/components/portal/PortalAcessosList";
import type { AcessoNaFicha, ContaParaLigar } from "@/lib/portal/acessoNaFicha";
import type { EstadoDoAcesso, ResultadoDoAcesso } from "@/app/(app)/admin/portal/actions";

type Props = AcoesDaLinha & {
  empresa: { id: string; nome: string; filiais: number; matriz: { id: string; nome: string } | null };
  acessos: AcessoNaFicha[];
  outras: ContaParaLigar[];
  podeExcluir: boolean;
  criarAction: (anterior: EstadoDoAcesso, form: FormData) => Promise<EstadoDoAcesso>;
  ligarAction: (portalUserId: string, companyId: string, incluiFiliais: boolean) => Promise<ResultadoDoAcesso>;
  desligarAction: (portalUserId: string, companyId: string) => Promise<ResultadoDoAcesso>;
};

function filiaisPorExtenso(n: number): string {
  return n === 1 ? "a filial" : `as ${n} filiais`;
}

/**
 * A aba "Acesso ao portal" da ficha da empresa (14/10/2026, etapa 2 da saída
 * do Cliente): quem entra no portal e vê esta empresa — ligado direto a ela ou
 * pela matriz, com "incluir filiais" —, e o que se faz daqui: criar acesso já
 * ligado a ela, ligar um acesso que já existe, desligar (sem apagar a conta),
 * incluir ou tirar as filiais, mandar o link, desativar e excluir.
 *
 * As ações são as de Administração › Portal do cliente; o desenho da linha
 * (botão "Enviar link" e o resto no "⋯") também.
 */
export function AcessoAoPortalDaEmpresa({
  empresa,
  acessos,
  outras,
  podeExcluir,
  criarAction,
  ligarAction,
  desligarAction,
  ...acoesDaLinha
}: Props) {
  const toast = useToast();
  const { dialog: confirmacao, requestConfirm } = useConfirm();
  const [ligando, setLigando] = useState(false);
  const [mudando, startMudar] = useTransition();
  const { pendente, enviarLink, alternar, abrirExclusao, dialogos } = useAcoesDoAcesso(acoesDaLinha);
  const ocupado = pendente || mudando;
  const temFiliais = empresa.filiais > 0;

  function mudarFiliais(a: AcessoNaFicha, incluir: boolean) {
    startMudar(async () => {
      const r = await ligarAction(a.id, empresa.id, incluir).catch(() => ({ erro: "Não foi possível salvar. Tente de novo." }));
      if ("erro" in r) toast.error(r.erro);
      else toast.success(r.mensagem);
    });
  }

  function desligar(a: AcessoNaFicha) {
    requestConfirm(
      {
        title: `Desligar ${a.nome} desta empresa?`,
        description: `A conta continua e deixa de ver ${empresa.nome}${temFiliais ? " (e as filiais que via por ela)" : ""} no portal. Para tirar o acesso de vez, use “Desativar” ou “Excluir”.`,
        confirmLabel: "Desligar",
        destructive: true,
      },
      async () => {
        const r = await desligarAction(a.id, empresa.id);
        if ("erro" in r) throw new Error(r.erro);
        toast.success(r.mensagem);
      }
    );
  }

  function comoVe(a: AcessoNaFicha) {
    if (a.via.tipo === "matriz") {
      return (
        <>
          Pela matriz{" "}
          {empresa.matriz ? (
            <Link href={`/empresas/${empresa.matriz.id}?tab=portal`} className="text-brand hover:underline">
              {empresa.matriz.nome}
            </Link>
          ) : null}
        </>
      );
    }
    if (!temFiliais) return "Ligado direto";
    return a.via.incluiFiliais ? "Ligado direto, com as filiais" : "Ligado direto, sem as filiais";
  }

  function acoes(a: AcessoNaFicha) {
    const direto = a.via.tipo === "direto";
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="secondary" size="xs" disabled={ocupado || !a.ativo} onClick={() => enviarLink(a)}>
          <Send size={14} /> Enviar link
        </Button>
        <MenuDeMaisAcoes rotulo={`Mais ações de ${a.nome}`}>
          {(fechar) => (
            <>
              {direto && temFiliais && (
                <ItemDoMenu
                  icone={<Network />}
                  disabled={ocupado}
                  onClick={() => {
                    fechar();
                    mudarFiliais(a, !(a.via.tipo === "direto" && a.via.incluiFiliais));
                  }}
                >
                  {a.via.tipo === "direto" && a.via.incluiFiliais ? "Não incluir as filiais" : "Incluir as filiais"}
                </ItemDoMenu>
              )}
              {direto && (
                <ItemDoMenu
                  icone={<Unlink />}
                  disabled={ocupado}
                  onClick={() => {
                    fechar();
                    desligar(a);
                  }}
                >
                  Desligar desta empresa
                </ItemDoMenu>
              )}
              <ItemDoMenu
                icone={a.ativo ? <PowerOff /> : <Power />}
                danger={a.ativo}
                disabled={ocupado}
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
                  disabled={ocupado}
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

  const explicacao = [
    "Quem entra no portal do cliente e vê esta empresa.",
    temFiliais ? `Quem está ligado com as filiais vê também ${filiaisPorExtenso(empresa.filiais)} — inclusive as cadastradas depois.` : null,
    empresa.matriz ? `Esta empresa é filial de ${empresa.matriz.nome}: quem tem a matriz com as filiais também a vê.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-labelledby="acesso-ao-portal" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-80">
          <h2 id="acesso-ao-portal" className="text-section font-semibold text-fg">
            Acesso ao portal
          </h2>
          <p className="mt-1 max-w-3xl text-helper text-fg-muted">{explicacao}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setLigando(true)} disabled={outras.length === 0}>
            <Link2 size={14} /> Ligar acesso existente
          </Button>
          <JanelaDeCadastro rotulo="Novo acesso" maxWidth="max-w-xl">
            {(fechar) => (
              <FormularioDoAcesso
                escolha={{ tipo: "fixa", empresa: { id: empresa.id, nome: empresa.nome, filiais: empresa.filiais } }}
                criarAction={criarAction}
                fechar={fechar}
              />
            )}
          </JanelaDeCadastro>
        </div>
      </div>

      <CascoDaTabela contagem={contarItens(acessos.length, "acesso", "acessos")}>
        {acessos.length === 0 ? (
          <EmptyState
            icon={<UsersRound />}
            title="Ninguém acessa esta empresa pelo portal"
            description="Crie um acesso em “Novo acesso”, ou ligue um que já existe: a pessoa recebe por e-mail o link para definir a senha."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {acessos.map((a) => (
                <Cartao key={a.id}>
                  <TopoDoCartao nome={a.nome} />
                  <InfoDoCartao>{a.email}</InfoDoCartao>
                  <InfoDoCartao>{comoVe(a)}</InfoDoCartao>
                  <InfoDoCartao>{a.ultimoAcesso ? `entrou em ${a.ultimoAcesso}` : "nunca entrou"}</InfoDoCartao>
                  <PeDoCartao>
                    <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                    <span className="ml-auto">{acoes(a)}</span>
                  </PeDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            <TabelaNoDesktop padrao>
              <table className="w-full min-w-[760px] text-ui">
                <thead>
                  <tr>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Como vê</th>
                    <th className="px-4 py-3">Último acesso</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {acessos.map((a) => (
                    <tr key={a.id} className="border-b border-border">
                      <td className="px-4 py-3">
                        <span className="block max-w-[280px] text-fg truncate" title={a.nome}>
                          {a.nome}
                        </span>
                        <span className="block max-w-[280px] text-micro text-fg-muted truncate" title={a.email}>
                          {a.email}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary">{comoVe(a)}</td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{a.ultimoAcesso ?? "nunca entrou"}</td>
                      <td className="px-4 py-3">
                        <StatusDot color={a.ativo ? "var(--c41-success)" : "var(--c41-fg-muted)"} label={a.ativo ? "Ativo" : "Inativo"} />
                      </td>
                      <td className="px-4 py-3">{acoes(a)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>

      <Modal open={ligando} onClose={() => setLigando(false)} title="Ligar acesso existente" maxWidth="max-w-lg">
        {ligando && (
          <LigarAcessoExistente
            empresa={empresa}
            outras={outras}
            ligarAction={ligarAction}
            fechar={() => setLigando(false)}
          />
        )}
      </Modal>

      {confirmacao}
      {dialogos}
    </section>
  );
}

/**
 * Liga à empresa um acesso que já existe no escritório — o contador que já
 * entra no portal por outra empresa, por exemplo. A conta continua vendo o que
 * já via e passa a ver esta empresa também.
 */
function LigarAcessoExistente({
  empresa,
  outras,
  ligarAction,
  fechar,
}: {
  empresa: Props["empresa"];
  outras: ContaParaLigar[];
  ligarAction: Props["ligarAction"];
  fechar: () => void;
}) {
  const toast = useToast();
  const [conta, setConta] = useState("");
  const [comFiliais, setComFiliais] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const escolhida = outras.find((o) => o.id === conta);

  const opcoes: Opcao[] = outras.map((o) => ({
    value: o.id,
    label: o.nome,
    descricao: o.ativo ? o.email : `${o.email} · desativado`,
    busca: o.email,
  }));

  function ligar(e: React.FormEvent) {
    e.preventDefault();
    if (!escolhida) return;
    setErro(null);
    startSalvar(async () => {
      const r = await ligarAction(escolhida.id, empresa.id, empresa.filiais > 0 ? comFiliais : true).catch(() => ({
        erro: "Não foi possível ligar. Tente de novo.",
      }));
      if ("erro" in r) {
        setErro(r.erro);
        return;
      }
      toast.success(r.mensagem);
      fechar();
    });
  }

  return (
    <form onSubmit={ligar} className="space-y-4">
      <CampoForm label="Acesso" htmlFor="ligar-acesso" required helper="Busque pelo nome ou pelo e-mail. A conta continua vendo o que já via.">
        <SearchableSelect id="ligar-acesso" name="ligar-acesso" options={opcoes} placeholder="Buscar por nome ou e-mail…" onChange={setConta} />
      </CampoForm>
      {empresa.filiais > 0 && (
        <Checkbox
          id="ligar-acesso-filiais"
          checked={comFiliais}
          onChange={(ev) => setComFiliais(ev.target.checked)}
          label={`Incluir ${filiaisPorExtenso(empresa.filiais)}`}
          helper="A filial cadastrada depois também aparece sozinha."
        />
      )}
      {escolhida && !escolhida.ativo && (
        <Aviso tom="atencao">
          O acesso de {escolhida.nome} está desativado: ele passa a ver esta empresa quando for reativado.
        </Aviso>
      )}
      <FormFooter pending={salvando} submitLabel="Ligar" onCancel={fechar} erro={erro ?? undefined} submitDisabled={!escolhida} />
    </form>
  );
}
