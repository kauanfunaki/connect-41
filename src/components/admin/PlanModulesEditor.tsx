"use client";

import { useState, useTransition } from "react";
import { Blocks } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { MODULE_CATALOG, type ModuleDef } from "@/lib/module-catalog";
import { DEFAULT_SECTORS, DEFAULT_SECTOR_LABELS } from "@/lib/sector-constants";
import {
  contagemDoBloco,
  filtrarGrupos,
  gruposAbertosPelaBusca,
  marcarGrupo,
  quantosNoConjunto,
  type Grupo,
} from "@/lib/listaEmBlocos";

function sectorLabelOf(code: string): string {
  return DEFAULT_SECTOR_LABELS[code] ?? code.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const COR_DO_SETOR: Record<string, string> = Object.fromEntries(DEFAULT_SECTORS.map((s) => [s.code, s.color]));

// Módulos agrupados por setor — só o nome do módulo ("Repositório de Senhas")
// não diz de qual frente ele é na hora de montar um plano. A ordem de setores
// segue a primeira aparição no catálogo, pra listagem ficar estável.
const MODULOS_POR_SETOR = MODULE_CATALOG.reduce<Grupo<ModuleDef>[]>((grupos, m) => {
  const grupo = grupos.find((g) => g.chave === m.sectorCode);
  if (grupo) grupo.itens.push(m);
  else grupos.push({ chave: m.sectorCode, rotulo: sectorLabelOf(m.sectorCode), itens: [m] });
  return grupos;
}, []);

const TODOS_OS_CODIGOS = MODULE_CATALOG.map((m) => m.code);
/** A janela mostra só o nome do módulo; a busca olha o mesmo. */
const nomeDoModulo = (m: ModuleDef) => [m.label];

type Props = {
  planId: string;
  nomeDoPlano: string;
  allowedModuleCodes: string[] | null; // null = plano libera todos os módulos
  action: (planId: string, moduleCodes: string[] | null) => Promise<void>;
};

/**
 * Os módulos que um plano libera — o plano é o teto (ver src/lib/modules.ts),
 * TenantModule por tenant só consegue restringir mais dentro do que aqui é
 * permitido, nunca liberar além.
 *
 * Escolha "Plano A" do Kauan (08/10/2026): eram as 41 caixas numa área de
 * 224 px que rolava por dentro do cartão. No cartão fica só o "Restringir" e o
 * botão "Escolher módulos · 12 de 41"; a escolha é numa janela com busca, os
 * setores em blocos fechados com a contagem e "Marcar todos" por setor. O que
 * vai para a action é o mesmo de antes: a lista de códigos, ou `null` para o
 * catálogo inteiro.
 */
export function PlanModulesEditor({ planId, nomeDoPlano, allowedModuleCodes, action }: Props) {
  const [restrito, setRestrito] = useState(allowedModuleCodes !== null);
  const [restritoSalvo, setRestritoSalvo] = useState(allowedModuleCodes !== null);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(allowedModuleCodes ?? TODOS_OS_CODIGOS));
  const [janelaAberta, setJanelaAberta] = useState(false);
  const [salvando, comecar] = useTransition();
  const [salvo, setSalvo] = useState(false);

  function salvar(restringir: boolean, codigos: Set<string>, depois?: () => void) {
    comecar(async () => {
      await action(planId, restringir ? Array.from(codigos) : null);
      setRestritoSalvo(restringir);
      setSalvo(true);
      depois?.();
    });
  }

  const marcados = quantosNoConjunto(selecionados, TODOS_OS_CODIGOS);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Checkbox
        checked={restrito}
        onChange={(e) => {
          setRestrito(e.target.checked);
          setSalvo(false);
        }}
        label="Restringir módulos deste plano"
      />

      {restrito ? (
        <Button variant="secondary" size="xs" onClick={() => setJanelaAberta(true)}>
          <Blocks size={11} />
          Escolher módulos · {marcados} de {TODOS_OS_CODIGOS.length}
        </Button>
      ) : (
        <span className="text-ui text-fg-muted">Libera o catálogo inteiro.</span>
      )}

      {/* O "Restringir" sozinho ainda pede o salvar; a escolha dos módulos
          salva na própria janela. */}
      {restrito !== restritoSalvo && (
        <Button variant="primary" size="xs" onClick={() => salvar(restrito, selecionados)} loading={salvando}>
          Salvar
        </Button>
      )}
      {salvo && !salvando && <span className="text-fs-1 text-success-fg">Salvo.</span>}

      <Modal
        open={janelaAberta}
        onClose={() => setJanelaAberta(false)}
        title={`Módulos do plano ${nomeDoPlano}`}
        maxWidth="max-w-xl"
      >
        {/* Remonta a cada abertura: o rascunho parte sempre do que está no cartão. */}
        {janelaAberta && (
          <JanelaDosModulos
            inicial={selecionados}
            salvando={salvando}
            onCancelar={() => setJanelaAberta(false)}
            onSalvar={(rascunho) => {
              setSelecionados(rascunho);
              setRestrito(true);
              salvar(true, rascunho, () => setJanelaAberta(false));
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function JanelaDosModulos({
  inicial,
  salvando,
  onCancelar,
  onSalvar,
}: {
  inicial: Set<string>;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: (rascunho: Set<string>) => void;
}) {
  const [rascunho, setRascunho] = useState(() => new Set(inicial));
  const [termo, setTermo] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());

  const visiveis = filtrarGrupos(MODULOS_POR_SETOR, termo, nomeDoModulo);

  function buscar(valor: string) {
    setTermo(valor);
    setAbertos(gruposAbertosPelaBusca(MODULOS_POR_SETOR, valor, nomeDoModulo));
  }

  function alternarBloco(chave: string, aberto: boolean) {
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (aberto) novo.add(chave);
      else novo.delete(chave);
      return novo;
    });
  }

  function marcar(codigos: string[], sim: boolean) {
    setRascunho((atual) => marcarGrupo(atual, codigos, sim));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CampoDeBusca
          compact
          value={termo}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Procurar módulo"
          aria-label="Procurar módulo"
          className="w-72 max-w-full"
        />
        <span className="text-ui text-fg-muted tabular-nums">
          {contagemDoBloco(quantosNoConjunto(rascunho, TODOS_OS_CODIGOS), TODOS_OS_CODIGOS.length, {
            um: "marcado",
            varios: "marcados",
          })}
        </span>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-ui text-fg-muted">Nenhum módulo com “{termo.trim()}”.</p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((g) => {
            // "Marcar todos" e a contagem valem para o setor inteiro, mesmo com
            // a busca mostrando só parte dele.
            const doSetor = (MODULOS_POR_SETOR.find((s) => s.chave === g.chave) ?? g).itens.map((m) => m.code);
            const n = quantosNoConjunto(rascunho, doSetor);
            const todos = n === doSetor.length;
            return (
              <BlocoRecolhivel
                key={g.chave}
                titulo={g.rotulo}
                cor={COR_DO_SETOR[g.chave]}
                resumo={contagemDoBloco(n, doSetor.length)}
                aberto={abertos.has(g.chave)}
                onAbertoChange={(aberto) => alternarBloco(g.chave, aberto)}
                espacoDaAcao="pr-36"
                acao={
                  <Button
                    variant="link"
                    className="text-ui leading-5"
                    onClick={() => marcar(doSetor, !todos)}
                    aria-label={`${todos ? "Desmarcar" : "Marcar"} todos os módulos de ${g.rotulo}`}
                  >
                    {todos ? "Desmarcar todos" : "Marcar todos"}
                  </Button>
                }
              >
                <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 pt-1 sm:grid-cols-2">
                  {g.itens.map((m) => (
                    <Checkbox
                      key={m.code}
                      checked={rascunho.has(m.code)}
                      onChange={(e) => marcar([m.code], e.target.checked)}
                      label={m.label}
                    />
                  ))}
                </div>
              </BlocoRecolhivel>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button onClick={() => onSalvar(rascunho)} loading={salvando}>
          Salvar
        </Button>
      </div>
    </div>
  );
}
