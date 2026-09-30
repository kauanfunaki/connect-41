"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Power, PowerOff, UserRoundCog } from "lucide-react";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ItemDoMenu } from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/useConfirm";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";

type SectorTag = { code: string; label: string; color: string };
type Row = {
  id: string;
  name: string;
  email: string;
  roleLabel: string;
  active: boolean;
  sectors: SectorTag[];
};

type Props = {
  users: Row[];
  currentUserId: string;
  sectorOptions: { value: string; label: string }[];
  alternarAtivoUsuario: (id: string, novoStatus: boolean) => Promise<void>;
  alternarAtivoEmMassa: (ids: string[], novoStatus: boolean) => Promise<void>;
  atribuirSetorEmMassa: (ids: string[], sectorCode: string) => Promise<void>;
};

/**
 * A caixa de seleção de uma linha da tabela, que avisa quando está na tela.
 *
 * O funil das colunas esconde a linha desmontando-a (`LinhaFiltravel`), e a
 * seleção mora aqui em cima: sem este aviso, "Selecionar todos" com o funil em
 * "Operador" marcaria também os administradores escondidos — e o "Desativar" em
 * massa os levaria junto. Ao sair da tela, a linha também sai da seleção.
 */
function CaixaDaLinha({
  id,
  nome,
  marcada,
  onAlternar,
  registrar,
}: {
  id: string;
  nome: string;
  marcada: boolean;
  onAlternar: () => void;
  registrar: (id: string) => () => void;
}) {
  useEffect(() => registrar(id), [id, registrar]);
  return <Checkbox checked={marcada} onChange={onAlternar} aria-label={`Selecionar ${nome}`} />;
}

export function UsuariosTable({
  users,
  currentUserId,
  sectorOptions,
  alternarAtivoUsuario,
  alternarAtivoEmMassa,
  atribuirSetorEmMassa,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // As linhas selecionáveis que o funil das colunas deixou na tela.
  const [naTela, setNaTela] = useState<Set<string>>(new Set());
  const [bulkSector, setBulkSector] = useState(sectorOptions[0]?.value ?? "");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  const registrarNaTela = useCallback((id: string) => {
    setNaTela((atual) => new Set(atual).add(id));
    return () => {
      setNaTela((atual) => {
        const novo = new Set(atual);
        novo.delete(id);
        return novo;
      });
      setSelected((atual) => {
        if (!atual.has(id)) return atual;
        const novo = new Set(atual);
        novo.delete(id);
        return novo;
      });
    };
  }, []);

  const selecionaveis = users.filter((u) => u.id !== currentUserId && naTela.has(u.id));
  const allSelected = selecionaveis.length > 0 && selecionaveis.every((u) => selected.has(u.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selecionaveis.map((u) => u.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Desativar/reativar uma conta, pelo "⋯" da linha. Era um interruptor
   * "Ativo" na coluna de ações — o mesmo dado da coluna Status, duas colunas
   * adiante, e a um clique acidental de tirar o acesso de alguém. O texto da
   * confirmação é o de antes.
   */
  function alternarAtivo(u: Row) {
    const title = u.active ? `Desativar "${u.name}"?` : `Reativar "${u.name}"?`;
    const description = u.active ? "A pessoa perderá acesso ao Connect." : undefined;
    requestConfirm(
      { title, description, destructive: u.active, confirmLabel: u.active ? "Desativar" : "Reativar" },
      () => alternarAtivoUsuario(u.id, !u.active)
    );
  }

  // Editar é botão; desativar/reativar vai no "⋯" (conferência de 30/09).
  function acoes(u: Row) {
    const isSelf = u.id === currentUserId;
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Button variant="secondary" size="xs" href={`/admin/usuarios/${u.id}/editar`}>
          <Pencil size={11} /> Editar
        </Button>
        {!isSelf && (
          <MenuDeMaisAcoes rotulo={`Mais ações de ${u.name}`}>
            {(fechar) => (
              <ItemDoMenu
                icone={u.active ? <PowerOff /> : <Power />}
                danger={u.active}
                onClick={() => {
                  fechar();
                  alternarAtivo(u);
                }}
              >
                {u.active ? "Desativar" : "Reativar"}
              </ItemDoMenu>
            )}
          </MenuDeMaisAcoes>
        )}
      </span>
    );
  }

  // Os chips de setor são idênticos na tabela e no cartão, com a mesma regra de
  // "3 e depois +N" — extraídos para não virar mais uma cópia de um markup que
  // já se repetia.
  function chipsDeSetor(u: Row) {
    if (u.sectors.length === 0) return <span className="text-fg-muted">—</span>;
    return (
      <div className="flex flex-wrap items-center gap-1">
        {u.sectors.slice(0, 3).map((s) => (
          <span
            key={s.code}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-fg-secondary border border-border"
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {u.sectors.length > 3 && (
          <span
            title={u.sectors.slice(3).map((s) => s.label).join(", ")}
            className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-surface-hover text-fg-muted border border-border cursor-default"
          >
            +{u.sectors.length - 3}
          </span>
        )}
      </div>
    );
  }

  /**
   * O mesmo usuário, em cartão, para telas estreitas — a tabela é
   * `min-w-[900px]` dentro de um `overflow-x-auto`. O status aparece para
   * todas as contas: desde que o interruptor foi para o "⋯", é o único lugar
   * do cartão que diz se a conta está ativa.
   */
  function cartaoUsuario(u: Row) {
    const isSelf = u.id === currentUserId;

    return (
      <div
        key={u.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selected.has(u.id) ? "bg-selected-bg" : ""
        }`}
      >
        <div className="flex items-start gap-2.5">
          {isSelf ? (
            // Espaço reservado: sem ele, o nome da própria conta ficaria
            // desalinhado dos demais cartões da lista.
            <span className="w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Checkbox
              checked={selected.has(u.id)}
              onChange={() => toggleOne(u.id)}
              aria-label={`Selecionar ${u.name}`}
              className="mt-1"
            />
          )}
          <div className="min-w-0 flex-1">
            <Link
              href={`/admin/usuarios/${u.id}/editar`}
              className="font-medium text-fg break-words"
            >
              {u.name}
            </Link>
            {isSelf && <span className="text-[12px] text-fg-muted ml-1.5">(você)</span>}
            <p className="text-[11.5px] text-fg-muted break-all">{u.email}</p>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-secondary">
          <StatusDot
            color={u.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
            label={u.active ? "Ativo" : "Inativo"}
          />
          <span>{u.roleLabel}</span>
        </div>

        <div className="mt-2">{chipsDeSetor(u)}</div>

        <div className="mt-2.5 flex items-center justify-end">{acoes(u)}</div>
      </div>
    );
  }

  function applyToggle(novoStatus: boolean) {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      alternarAtivoEmMassa(ids, novoStatus);
    });
  }

  function applySector() {
    if (!bulkSector) return;
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atribuirSetorEmMassa(ids, bulkSector);
    });
  }

  if (users.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)]">
        <EmptyState icon={<UserRoundCog />} title="Nenhum usuário cadastrado ainda" />
      </div>
    );
  }

  return (
    <>
      {/* Abaixo de md, cartões; de md para cima, a tabela. As duas
          compartilham a seleção — quem esconde uma delas é o CSS. */}
      <div className="md:hidden bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden">
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
          <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
          <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
            Selecionar todos
          </span>
        </div>
        {users.map((u) => cartaoUsuario(u))}
      </div>

      {/* Casco padrão e funil nas colunas de valor repetido — papel, setores e
          status (polimento de 30/09). A lista vem inteira, então o funil filtra
          no navegador. Setores filtra pela combinação que a pessoa tem. */}
      <TabelaFiltravel
        linhas={users.map((u) => ({
          id: u.id,
          valores: {
            papel: u.roleLabel,
            setores: u.sectors
              .map((s) => s.label)
              .sort((a, b) => a.localeCompare(b, "pt-BR"))
              .join(", "),
            status: u.active ? "Ativo" : "Inativo",
          },
        }))}
      >
        <div className="c41-tabela scroll-x overflow-x-auto hidden md:block bg-surface border border-border rounded-lg">
          <table className="w-full min-w-[900px] text-[length:var(--fs-body)]">
            <thead>
              <tr className="border-b border-border bg-table-header-bg text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                <th className="w-10 px-4 py-3">
                  <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todos" />
                </th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Papel" chave="papel" />
                </th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Setores" chave="setores" />
                </th>
                <th className="px-4 py-3">
                  <FiltroDaColuna rotulo="Status" chave="status" align="right" />
                </th>
                <th className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <LinhaFiltravel
                    key={u.id}
                    id={u.id}
                    className={`border-b border-border last:border-0 ${selected.has(u.id) ? "bg-selected-bg" : ""}`}
                  >
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <CaixaDaLinha
                          id={u.id}
                          nome={u.name}
                          marcada={selected.has(u.id)}
                          onAlternar={() => toggleOne(u.id)}
                          registrar={registrarNaTela}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/usuarios/${u.id}/editar`} className="font-medium text-fg hover:text-brand transition-colors">
                        {u.name}
                      </Link>
                      {isSelf && <span className="text-[12px] text-fg-muted ml-1.5">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">{u.email}</td>
                    <td className="px-4 py-3 text-fg-secondary">{u.roleLabel}</td>
                    <td className="px-4 py-3">{chipsDeSetor(u)}</td>
                    <td className="px-4 py-3">
                      <StatusDot
                        color={u.active ? "var(--c41-success)" : "var(--c41-fg-muted)"}
                        label={u.active ? "Ativo" : "Inativo"}
                      />
                    </td>
                    <td className="px-4 py-3">{acoes(u)}</td>
                  </LinhaFiltravel>
                );
              })}
            </tbody>
          </table>
        </div>
      </TabelaFiltravel>

      {dialog}

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button
          variant="success"
          size="sm"
          onClick={() => applyToggle(true)}
        >
          Ativar
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => applyToggle(false)}
        >
          Desativar
        </Button>
        {sectorOptions.length > 0 && (
          <>
            {/* Compacto, na altura dos botões sm da barra (era o select de
                formulário, 4px mais alto que os vizinhos). */}
            <Select
              compact
              className="w-44"
              aria-label="Setor a atribuir"
              value={bulkSector}
              onChange={(e) => setBulkSector(e.target.value)}
            >
              {sectorOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <Button
              variant="primary"
              size="sm"
              onClick={applySector}
            >
              Atribuir setor
            </Button>
          </>
        )}
      </BulkActionBar>
    </>
  );
}
