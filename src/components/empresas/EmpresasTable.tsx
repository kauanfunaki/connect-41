"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { AcoesDeLinha } from "@/components/shared/AcoesDeLinha";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { StatusDot } from "@/components/shared/StatusDot";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { formatDocumento } from "@/lib/format";
import { agruparPorCliente } from "@/lib/clientGroups";
import { montarArvore } from "@/lib/companyHierarchy";
import { nomeExibicao, razaoSocialSecundaria } from "@/lib/companyName";
import { resumirRegime } from "@/lib/taxRegime";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Row = {
  id: string;
  name: string;
  displayName: string | null;
  externalId: string | null;
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
  cnpj: string | null;
  cpf: string | null;
  status: CompanyStatus;
  email: string | null;
  taxRegime: string | null;
  logoUrl: string | null;
  city: string | null;
  stateCode: string | null;
  clientGroupId: string | null;
  clientGroupName: string | null;
  parentCompanyId: string | null;
};

type Props = {
  companies: Row[];
  canCreate: boolean;
  isSuperAdmin: boolean;
  statusLabel: Record<CompanyStatus, string>;
  statusColor: Record<CompanyStatus, string>;
  atualizarStatusEmMassa: (ids: string[], status: CompanyStatus) => Promise<void>;
  excluirEmpresasEmMassa: (ids: string[]) => Promise<void>;
};

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "PROSPECT", label: "Prospecto" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED", label: "Cancelado" },
];

export function EmpresasTable({
  companies,
  canCreate,
  isSuperAdmin,
  statusLabel,
  statusColor,
  atualizarStatusEmMassa,
  excluirEmpresasEmMassa,
}: Props) {
  // A consulta já vem ordenada por (cliente, empresa) — aqui é só quebrar em
  // blocos para desenhar o cabeçalho de cada cliente.
  const blocos = agruparPorCliente(companies);
  // A árvore é montada aqui, e não dentro de cada renderizador: a tabela e a
  // lista de cartões desenham exatamente os mesmos nós, e as duas ficam no DOM
  // (quem esconde uma delas é o CSS). Sem isto, `montarArvore` rodaria duas
  // vezes a cada render.
  const blocosComArvore = blocos.map((b) => ({ ...b, nos: montarArvore(b.empresas) }));
  const colunas = canCreate ? 7 : 6;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Filiais começam recolhidas: a listagem existe para varrer clientes, e abrir
  // tudo por padrão devolveria a tabela plana que a árvore veio substituir.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function toggleExpandir(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [bulkStatus, setBulkStatus] = useState<CompanyStatus>("ACTIVE");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  // A tabela e o cartão usam as mesmas duas ações — e /pessoas e /clientes
  // usam as mesmas duas de novo, então elas moram em `AcoesDeLinha`.
  function acoesEmpresa(c: Row) {
    return (
      <AcoesDeLinha
        foraDeOperacao={FORA_DE_OPERACAO.includes(c.status)}
        onToggle={() => toggleAtivo(c)}
        editarHref={`/empresas/${c.id}/editar`}
      />
    );
  }

  // Uma linha só, usada pela matriz e pela filial. Extraída porque são as
  // mesmas 8 colunas — o que muda é o recuo, a setinha e a marca de filial.
  function linhaEmpresa(c: Row, qtdFiliais: number, ehFilial: boolean) {
    return (
      <tr
        key={c.id}
        className={`border-b border-border last:border-0 transition-colors ${
          selected.has(c.id) ? "bg-selected-bg" : "hover:bg-surface-hover"
        }`}
      >
        {canCreate && (
          <td className="px-4 py-3">
            <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} />
          </td>
        )}
        <td className="px-4 py-3">
          <div
            className="flex items-center gap-1.5 min-w-0"
            style={ehFilial ? { paddingLeft: 22 } : undefined}
          >
            {qtdFiliais > 0 ? (
              <Button
                variant="linkMuted"
                className="shrink-0 p-0.5 rounded hover:bg-surface-2"
                onClick={() => toggleExpandir(c.id)}
                aria-expanded={expandidas.has(c.id)}
                aria-label={`${expandidas.has(c.id) ? "Recolher" : "Expandir"} as filiais de ${c.name}`}
              >
                <ChevronRight
                  size={14}
                  className={`transition-transform ${expandidas.has(c.id) ? "rotate-90" : ""}`}
                />
              </Button>
            ) : (
              // Espaço reservado mesmo sem filial: sem ele, os nomes das
              // empresas com e sem filial ficam desalinhados na coluna.
              <span className="w-[22px] shrink-0" aria-hidden="true" />
            )}
            <Link
              href={`/empresas/${c.id}`}
              className="flex items-center gap-2.5 min-w-0 font-medium text-fg hover:text-brand transition-colors"
            >
              <AvatarImage src={c.logoUrl} name={nomeExibicao(c)} size={28} shape="lg" fontSize={11} />
              <span className="flex flex-col min-w-0">
                <span className="truncate">{nomeExibicao(c)}</span>
                {/* Razão social só quando acrescenta: com apelido em branco ela
                    JÁ é o nome de cima, e repetir é ruído. O ID do Acessórias
                    vem junto, que é como se cruza com o sistema de origem. */}
                {(razaoSocialSecundaria(c) || c.externalId) && (
                  <span className="truncate text-[11.5px] font-normal text-fg-muted">
                    {razaoSocialSecundaria(c)}
                    {razaoSocialSecundaria(c) && c.externalId ? " · " : ""}
                    {c.externalId ? <span className="tnum">#{c.externalId}</span> : null}
                  </span>
                )}
              </span>
            </Link>
            {qtdFiliais > 0 && (
              <span className="ml-1 shrink-0 text-[11.5px] text-fg-muted tnum whitespace-nowrap">
                {qtdFiliais} {qtdFiliais === 1 ? "filial" : "filiais"}
              </span>
            )}
            {ehFilial && <span className="ml-1 shrink-0 text-[11.5px] text-fg-muted">filial</span>}
          </div>
        </td>
        <td className="px-4 py-3 text-fg-secondary tnum whitespace-nowrap">{formatDocumento(c.kind, c.cnpj, c.cpf)}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <StatusDot color={statusColor[c.status]} label={statusLabel[c.status]} />
        </td>
        {/* Resumido e sem quebra: o rótulo do Acessórias chega a 73 caracteres
            e esticava a linha em seis, empurrando as ações para fora da tela.
            O texto inteiro fica no title. */}
        <td className="px-4 py-3 text-fg-secondary truncate" title={c.taxRegime ?? undefined}>
          {resumirRegime(c.taxRegime) ?? "—"}
        </td>
        <td
          className="px-4 py-3 text-fg-secondary truncate"
          title={c.city && c.stateCode ? `${c.city}/${c.stateCode}` : undefined}
        >
          {c.city && c.stateCode ? `${c.city}/${c.stateCode}` : c.city ?? c.stateCode ?? "—"}
        </td>
        {/* Sticky de seguro: com 6 colunas a tabela cabe, mas em tela estreita
            as ações eram a primeira coisa a sair. Sem borda, porque agora ela
            apareceria o tempo todo sem haver rolagem. */}
        <td
          className={`px-4 py-3 text-right whitespace-nowrap sticky right-0 ${
            selected.has(c.id) ? "bg-selected-bg" : "bg-surface"
          }`}
        >
          {canCreate && acoesEmpresa(c)}
        </td>
      </tr>
    );
  }

  /**
   * A mesma empresa, em cartão, para telas estreitas.
   *
   * A tabela é `min-w-[980px]` dentro de um `overflow-x-auto`: no celular as
   * colunas de regime, localização e as ações nascem fora da tela, e rolar de
   * lado para ver um campo é pior que não ter o campo — é o mesmo argumento do
   * comentário do <thead>, aplicado à largura da tela em vez de à quantidade
   * de colunas.
   *
   * O que era coluna vira linha corrida de campos. Nada é escondido: seleção,
   * filiais e as duas ações continuam todas aqui.
   */
  function cartaoEmpresa(c: Row, qtdFiliais: number, ehFilial: boolean) {
    const doc = formatDocumento(c.kind, c.cnpj, c.cpf);
    const regime = resumirRegime(c.taxRegime);
    const local = c.city && c.stateCode ? `${c.city}/${c.stateCode}` : c.city ?? c.stateCode;
    const secundaria = razaoSocialSecundaria(c);
    const aberta = expandidas.has(c.id);

    return (
      <div
        key={c.id}
        className={`px-3 py-3 border-b border-border last:border-0 ${
          selected.has(c.id) ? "bg-selected-bg" : ""
        }`}
        // Recuo menor que o da tabela (22px): no celular cada pixel de recuo
        // sai do nome, que é o que se lê primeiro.
        style={ehFilial ? { paddingLeft: 26 } : undefined}
      >
        <div className="flex items-start gap-2.5">
          {canCreate && (
            <Checkbox
              checked={selected.has(c.id)}
              onChange={() => toggleOne(c.id)}
              aria-label={`Selecionar ${c.name}`}
              className="mt-1.5"
            />
          )}
          <Link
            href={`/empresas/${c.id}`}
            className="flex items-start gap-2.5 min-w-0 flex-1 text-fg"
          >
            <AvatarImage src={c.logoUrl} name={nomeExibicao(c)} size={32} shape="lg" fontSize={12} />
            <span className="flex flex-col min-w-0">
              {/* `break-words` em vez de `truncate`: no cartão há altura de
                  sobra, e cortar o nome era um custo só da tabela. */}
              <span className="font-medium break-words">{nomeExibicao(c)}</span>
              {(secundaria || c.externalId) && (
                <span className="text-[11.5px] text-fg-muted break-words">
                  {secundaria}
                  {secundaria && c.externalId ? " · " : ""}
                  {c.externalId ? <span className="tnum">#{c.externalId}</span> : null}
                </span>
              )}
            </span>
          </Link>
        </div>

        {/* Os quatro campos que eram colunas. `flex-wrap` acomoda o que não
            couber na largura da tela em vez de empurrar para fora dela. O
            documento vazio some: na tabela ele vira "—" para segurar a coluna,
            e aqui não há coluna para segurar. */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-secondary">
          <StatusDot color={statusColor[c.status]} label={statusLabel[c.status]} />
          {doc !== "—" && <span className="tnum">{doc}</span>}
          {regime && <span title={c.taxRegime ?? undefined}>{regime}</span>}
          {local && <span>{local}</span>}
          {ehFilial && <span className="text-fg-muted">filial</span>}
        </div>

        {(qtdFiliais > 0 || canCreate) && (
          <div className="mt-2.5 flex items-center justify-between gap-3">
            {qtdFiliais > 0 ? (
              <Button
                variant="linkMuted"
                className="-my-1 -ml-1 px-1 py-1 text-[12px] font-medium"
                onClick={() => toggleExpandir(c.id)}
                aria-expanded={aberta}
                aria-label={`${aberta ? "Recolher" : "Expandir"} as filiais de ${c.name}`}
                // Área de toque maior que o texto, sem alterar o espaçamento
                // do cartão — o alvo de 14px da tabela é de mouse.
              >
                <ChevronRight size={14} className={`transition-transform ${aberta ? "rotate-90" : ""}`} />
                <span className="tnum">
                  {qtdFiliais} {qtdFiliais === 1 ? "filial" : "filiais"}
                </span>
              </Button>
            ) : (
              <span />
            )}
            {canCreate && acoesEmpresa(c)}
          </div>
        )}
      </div>
    );
  }

  const allSelected = companies.length > 0 && selected.size === companies.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(companies.map((c) => c.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyStatus() {
    const ids = Array.from(selected);
    setSelected(new Set());
    startTransition(() => {
      atualizarStatusEmMassa(ids, bulkStatus);
    });
  }

  // Status que contam como "fora de operação" — quem está assim volta com "Reativar".
  const FORA_DE_OPERACAO: CompanyStatus[] = ["INACTIVE", "CHURNED"];

  /**
   * Inativar/reativar direto na linha, sem passar pela seleção e pelo seletor de status.
   * Reaproveita a action em massa com um id só: a regra de permissão e de escopo por
   * tenant já mora lá, e duplicá-la numa action nova seria criar um segundo lugar para
   * errar.
   */
  function toggleAtivo(row: Row) {
    const inativando = !FORA_DE_OPERACAO.includes(row.status);
    const alvo: CompanyStatus = inativando ? "INACTIVE" : "ACTIVE";

    const aplicar = () => {
      startTransition(() => {
        atualizarStatusEmMassa([row.id], alvo);
      });
      return Promise.resolve();
    };

    // Reativar é inofensivo e não pergunta. Inativar tira a empresa da listagem
    // padrão, então confirma — senão some da tela sem a pessoa entender por quê.
    if (!inativando) {
      void aplicar();
      return;
    }
    requestConfirm(
      {
        title: `Inativar ${row.name}?`,
        description: "Ela sai da listagem padrão e passa a aparecer só no filtro de inativos. Dá para reativar depois.",
        confirmLabel: "Inativar",
      },
      aplicar
    );
  }

  function inativarSelecionadas() {
    const quantas = selected.size;
    requestConfirm(
      {
        title: `Inativar ${quantas} empresa${quantas !== 1 ? "s" : ""}?`,
        description: "Elas saem da listagem padrão e passam a aparecer só no filtro de inativos. Dá para reativar depois.",
        confirmLabel: "Inativar",
      },
      () => {
        const ids = Array.from(selected);
        setSelected(new Set());
        startTransition(() => {
          atualizarStatusEmMassa(ids, "INACTIVE");
        });
        return Promise.resolve();
      }
    );
  }

  function applyDelete() {
    requestConfirm(
      { title: `Excluir ${selected.size} empresa(s) selecionada(s)?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" },
      () => {
        const ids = Array.from(selected);
        setSelected(new Set());
        startTransition(() => {
          excluirEmpresasEmMassa(ids);
        });
        return Promise.resolve();
      }
    );
  }

  return (
    <>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {companies.length === 0 ? (
          <EmptyState icon={<Building2 />} title="Nenhuma empresa encontrada" />
        ) : (
          <>
          {/* Abaixo de md, cartões; de md para cima, a tabela. As duas
              desenham a mesma árvore e compartilham seleção e expansão —
              o que muda é a forma. */}
          <div className="md:hidden">
            {canCreate && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-border bg-table-header-bg">
                <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Selecionar todas" />
                <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                  Selecionar todas
                </span>
              </div>
            )}
            {blocosComArvore.map((bloco, i) => (
              <Fragment key={`cartoes-${bloco.clientGroupId ?? "sem-cliente"}-${i}`}>
                {bloco.mostrarCabecalho && (
                  <div className="px-3 py-2 border-b border-border bg-surface-2">
                    <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                      {bloco.label}
                    </span>
                    <span className="ml-2 text-[11.5px] text-fg-muted tnum">
                      {bloco.empresas.length} empresa{bloco.empresas.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {bloco.nos.map((no) => (
                  <Fragment key={no.matriz.id}>
                    {cartaoEmpresa(no.matriz, no.filiais.length, false)}
                    {expandidas.has(no.matriz.id) &&
                      no.filiais.map((f) => cartaoEmpresa(f, 0, true))}
                  </Fragment>
                ))}
              </Fragment>
            ))}
          </div>

          <div className="scroll-x overflow-x-auto hidden md:block">
          {/* `table-fixed` + <colgroup>: com layout automático o navegador recalcula
              TODAS as larguras quando o conteúdo muda, então expandir uma matriz
              deslocava as colunas da tabela inteira. Larguras declaradas uma vez
              deixam o expandir e o recolher inertes. */}
          <table className="w-full table-fixed min-w-[1020px] text-[length:var(--fs-body)]">
            <colgroup>
              {canCreate && <col className="w-11" />}
              {/* Nome não declara largura: fica com o espaço que sobrar. */}
              <col />
              {/* 190px, e não 150: um CNPJ formatado é `00.000.000/0000-00`,
                  18 caracteres em `tnum` a 15px — sozinho já passa de 150px, e
                  com o `px-4` de cada lado o texto encostava na coluna de
                  Status. Medido no print da conferência de 09/09. */}
              <col className="w-[190px]" />
              <col className="w-[120px]" />
              <col className="w-[190px]" />
              <col className="w-[170px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-table-header-bg">
                {canCreate && (
                  <th className="px-4 py-3">
                    <Checkbox checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                {/* Oito colunas não cabiam sem rolagem horizontal, e rolar para
                    ver um campo é pior que não ter o campo. "Criada em" saiu (a
                    data de cadastro não decide nada numa lista operacional) e o
                    ID do Acessórias desceu para a segunda linha do nome. */}
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Nome</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">CNPJ</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Status</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Regime</th>
                <th className="text-left px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">Localização</th>
                <th className="px-4 py-3 sticky right-0 bg-table-header-bg" />
              </tr>
            </thead>
            <tbody>
              {blocosComArvore.map((bloco, i) => (
                <Fragment key={`${bloco.clientGroupId ?? "sem-cliente"}-${i}`}>
                  {bloco.mostrarCabecalho && (
                    <tr className="border-b border-border bg-surface-2">
                      <td colSpan={colunas - 1} className="px-4 py-2">
                        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-muted">
                          {bloco.label}
                        </span>
                        <span className="ml-2 text-[11.5px] text-fg-muted tnum">
                          {bloco.empresas.length} empresa{bloco.empresas.length !== 1 ? "s" : ""}
                        </span>
                      </td>
                      {/* Célula vazia no lugar da coluna de ações, que é sticky:
                          sem ela, o retângulo preso à direita passaria por cima
                          da faixa do cliente ao rolar na horizontal. */}
                      <td className="sticky right-0 bg-surface-2" />
                    </tr>
                  )}
                  {bloco.nos.map((no) => (
                    <Fragment key={no.matriz.id}>
                      {linhaEmpresa(no.matriz, no.filiais.length, false)}
                      {expandidas.has(no.matriz.id) &&
                        no.filiais.map((f) => linhaEmpresa(f, 0, true))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
          </>
        )}
      </div>

      <BulkActionBar count={selected.size} onClear={() => setSelected(new Set())}>
        {/* Atalho para o caso comum. O seletor ao lado continua, para os outros status. */}
        <Button
          variant="secondary"
          size="sm"
          onClick={inativarSelecionadas}
        >
          Inativar
        </Button>
        <div className="w-40">
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as CompanyStatus)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={applyStatus}
        >
          Alterar status
        </Button>
        {isSuperAdmin && (
          <Button
            variant="danger"
            size="sm"
            onClick={applyDelete}
          >
            Excluir
          </Button>
        )}
      </BulkActionBar>
      {dialog}
    </>
  );
}
