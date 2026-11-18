"use client";

import { useId, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, Check, Trash2 } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNavegarSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";
import { excluirFiltroTech, salvarFiltroTech } from "@/app/(app)/controle-interno/actions";
import {
  LIMITE_DE_FILTROS_SALVOS, TAMANHO_DO_NOME_DO_FILTRO, enderecoDoFiltroSalvo, filtroAplicado, normalizarQueryDoFiltro,
  type FiltroSalvo,
} from "@/lib/tech-interno/filtrosSalvos";

/**
 * "Filtros salvos" da lista do Controle interno (18/11/2026,
 * funcionalidade-783), ao lado do botão Filtros. Cada pessoa vê só os seus.
 *
 * O painel parte do painel do `FiltrosDaTela` (rótulo em caixa alta, opção
 * escolhida com a marca). Aplicar navega sem recarregar, como os filtros
 * (`useNavegarSemRecarregar`): o `FiltrosDaTela` relê a URL e a busca remonta
 * pela `key` da página, então os controles mostram o filtro aplicado. Com um
 * salvo aplicado (a URL bate exatamente), o botão leva o nome dele.
 */
export function FiltrosSalvos({ salvos }: { salvos: FiltroSalvo[] }) {
  const queryDaUrl = useSearchParams().toString();
  const aplicado = filtroAplicado(salvos, queryDaUrl);
  return (
    <Dropdown
      align="right"
      width={320}
      semRolagem
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={aplicado ? `Filtros salvos: ${aplicado.nome}` : "Filtros salvos"}
          title={aplicado ? `Filtro salvo aplicado: ${aplicado.nome}` : undefined}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-button-sm font-semibold transition-colors flex-shrink-0 max-w-[220px] ${
            aplicado || open
              ? "border-brand/40 bg-brand-subtle text-fg"
              : "border-border-strong text-fg-secondary hover:bg-surface-hover"
          }`}
        >
          <Bookmark size={14} className="flex-shrink-0" fill={aplicado ? "currentColor" : "none"} />
          <span className="truncate">{aplicado ? aplicado.nome : "Filtros salvos"}</span>
        </button>
      )}
    >
      {({ close }) => <Painel salvos={salvos} aplicado={aplicado} queryDaUrl={queryDaUrl} fechar={close} />}
    </Dropdown>
  );
}

/** O conteúdo do painel: montado a cada abertura, então o nome digitado e a confirmação recomeçam. */
function Painel({ salvos, aplicado, queryDaUrl, fechar }: { salvos: FiltroSalvo[]; aplicado?: FiltroSalvo; queryDaUrl: string; fechar: () => void }) {
  const toast = useToast();
  const { ir } = useNavegarSemRecarregar();
  const idDoCampo = useId();
  const [nome, setNome] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [salvando, iniciarSalvar] = useTransition();
  const [excluindo, iniciarExcluir] = useTransition();
  const temFiltro = normalizarQueryDoFiltro(queryDaUrl) !== "";
  // Por que não dá para salvar agora — vai no lugar do texto de exemplo do campo.
  const bloqueio = !temFiltro ? "Nenhum filtro ativo"
    : aplicado ? `Já salvo como “${aplicado.nome}”`
    : salvos.length >= LIMITE_DE_FILTROS_SALVOS ? `Limite de ${LIMITE_DE_FILTROS_SALVOS} filtros salvos`
    : null;

  function aplicar(s: FiltroSalvo) {
    fechar();
    if (s.id !== aplicado?.id) ir(enderecoDoFiltroSalvo(s.query, queryDaUrl));
  }
  function excluir(s: FiltroSalvo) {
    iniciarExcluir(async () => {
      const r = await excluirFiltroTech(s.id);
      if ("error" in r) { toast.error(r.error); return; }
      setConfirmando(null);
      toast.success(`Filtro “${s.nome}” excluído.`);
    });
  }
  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (bloqueio || !nome.trim()) return;
    iniciarSalvar(async () => {
      const r = await salvarFiltroTech(nome, queryDaUrl);
      if ("error" in r) { toast.error(r.error); return; }
      setNome("");
      toast.success(`Filtro “${r.nome}” salvo.`);
    });
  }

  return (
    <div className="flex flex-col gap-3 -m-1">
      <div className="flex flex-col gap-1.5">
        <p className="c41-rotulo px-1">Filtros salvos</p>
        {salvos.length === 0 ? (
          <p className="px-2.5 py-2 text-fs-2 text-fg-muted">Nenhum filtro salvo.</p>
        ) : (
          <ul className="scroll-y max-h-[232px] overflow-y-auto overscroll-contain flex flex-col gap-0.5" aria-label="Filtros salvos">
            {salvos.map(s => {
              const escolhido = s.id === aplicado?.id;
              if (confirmando === s.id) return (
                <li key={s.id} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-danger-bg">
                  <span className="flex-1 min-w-0 truncate text-ui text-fg" title={s.nome}>Excluir “{s.nome}”?</span>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmando(null)} disabled={excluindo}>Cancelar</Button>
                  <Button size="xs" variant="dangerSolid" onClick={() => excluir(s)} loading={excluindo} loadingLabel="Excluindo…" autoFocus>Excluir</Button>
                </li>
              );
              return (
                <li key={s.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => aplicar(s)}
                    aria-current={escolhido || undefined}
                    className={`flex-1 min-w-0 flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md text-ui transition-colors ${
                      escolhido ? "bg-brand-subtle text-brand font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                    }`}
                  >
                    <span className="truncate" title={s.nome}>{s.nome}</span>
                    {escolhido && <Check size={13} className="flex-shrink-0" aria-label="Aplicado" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(s.id)}
                    aria-label={`Excluir o filtro ${s.nome}`}
                    title="Excluir"
                    className="inline-flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-md text-fg-muted hover:text-danger hover:bg-danger-bg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form onSubmit={salvar} className="flex flex-col gap-1.5 border-t border-border pt-3">
        <label htmlFor={idDoCampo} className="c41-rotulo px-1">Salvar filtros atuais</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <Input
              id={idDoCampo}
              compact
              value={nome}
              onChange={e => setNome(e.target.value)}
              maxLength={TAMANHO_DO_NOME_DO_FILTRO}
              placeholder={bloqueio ?? "Nome do filtro"}
              title={bloqueio ?? undefined}
              disabled={Boolean(bloqueio) || salvando}
              autoComplete="off"
            />
          </div>
          <Button type="submit" size="sm" disabled={Boolean(bloqueio) || !nome.trim()} loading={salvando} loadingLabel="Salvando…">Salvar</Button>
        </div>
      </form>
    </div>
  );
}
