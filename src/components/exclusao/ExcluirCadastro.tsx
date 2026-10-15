"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { excluirCadastro, previaDaExclusao } from "@/app/(app)/exclusao-actions";
import { confirmacaoConfere } from "@/lib/exclusaoConfirmada";
import {
  type Efeito,
  type ItemDaPrevia,
  type Previa,
  type ResultadoDaExclusao,
  type TipoDeCadastro,
} from "@/lib/exclusao/tipos";

type Props = {
  tipo: TipoDeCadastro;
  id: string;
  /** O nome que aparece no título enquanto a prévia carrega. */
  nome: string;
  aberto: boolean;
  onFechar: () => void;
  /**
   * Depois de excluir: `navegar` (padrão) volta para a lista do cadastro — a
   * ficha deixou de existir; `atualizar` fica na tela e recarrega (a lista de
   * usuários, de onde a exclusão sai).
   */
  depois?: "navegar" | "atualizar";
};

const GRUPOS: { efeito: Efeito; titulo: string; tom: string }[] = [
  { efeito: "apagar", titulo: "Sai junto", tom: "var(--c41-danger)" },
  { efeito: "reatribuir", titulo: "Passa para você", tom: "var(--c41-brand)" },
  { efeito: "desligar", titulo: "Fica, sem o vínculo", tom: "var(--c41-fg-muted)" },
];

/** "312 notas fiscais e mais 3" — o resumo na linha do bloco fechado. */
function resumoDaLinha(itens: { texto: string }[]): string {
  if (itens.length === 0) return "";
  return itens.length === 1 ? itens[0].texto : `${itens[0].texto} e mais ${itens.length - 1}`;
}

function ListaDeItens({ itens }: { itens: ItemDaPrevia[] }) {
  return (
    <ul className="space-y-1 text-ui text-fg-secondary">
      {itens.map((i) => (
        <li key={i.chave} className="flex items-baseline gap-2">
          <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-muted" />
          <span className="tabular-nums">{i.texto}</span>
        </li>
      ))}
    </ul>
  );
}

function GruposDaPrevia({ itens }: { itens: ItemDaPrevia[] }) {
  return (
    <div className="space-y-2">
      {GRUPOS.map((g) => {
        const doGrupo = itens.filter((i) => i.efeito === g.efeito);
        if (doGrupo.length === 0) return null;
        return (
          <BlocoRecolhivel key={g.efeito} titulo={g.titulo} cor={g.tom} resumo={resumoDaLinha(doGrupo)}>
            <ListaDeItens itens={doGrupo} />
          </BlocoRecolhivel>
        );
      })}
    </div>
  );
}

/**
 * O diálogo de exclusão de empresa, pessoa e usuário (13/10/2026).
 *
 * Abre com a prévia — o que está ligado ao cadastro, em três blocos: o que sai
 * junto, o que passa para quem exclui, o que fica sem o vínculo. Sem histórico,
 * um "Excluir" basta. Com histórico, o botão vira "Excluir com tudo o que está
 * ligado" e só destrava com o nome digitado. No fim, diz o que saiu.
 *
 * Só aparece para administrador (quem renderiza decide), e o servidor confere
 * de novo.
 */
export function ExcluirCadastro({ tipo, id, nome, aberto, onFechar, depois = "navegar" }: Props) {
  const router = useRouter();
  const campoId = useId();
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erroDaPrevia, setErroDaPrevia] = useState<string | null>(null);
  const [incluirOpcao, setIncluirOpcao] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoDaExclusao, { ok: true }> | null>(null);
  const [excluindo, startExcluir] = useTransition();

  // A prévia é buscada a cada abertura: entre uma e outra alguém pode ter
  // lançado uma nota, e o que o diálogo mostra é o que vai sair.
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    previaDaExclusao(tipo, id).then(
      (r) => {
        if (!vivo) return;
        if ("previa" in r) setPrevia(r.previa);
        else setErroDaPrevia(r.erro);
      },
      () => vivo && setErroDaPrevia("Não foi possível montar a lista do que está ligado. Tente de novo.")
    );
    return () => {
      vivo = false;
    };
  }, [aberto, tipo, id]);

  function limpar() {
    setPrevia(null);
    setErroDaPrevia(null);
    setIncluirOpcao(false);
    setDigitado("");
    setErro(null);
    setResultado(null);
  }

  function fechar() {
    if (excluindo) return;
    const concluido = resultado;
    limpar();
    onFechar();
    if (concluido) {
      if (depois === "atualizar") router.refresh();
      else router.replace(concluido.destino);
    }
  }

  const exigeNome = !!previa && (previa.temHistorico || (incluirOpcao && !!previa.opcao?.trazHistorico));
  const nomeOk = !!previa && confirmacaoConfere(digitado, [previa.nome]);

  function confirmar() {
    if (!previa) return;
    setErro(null);
    startExcluir(async () => {
      const r = await excluirCadastro({
        tipo,
        id,
        modo: exigeNome ? "completo" : "simples",
        confirmacao: exigeNome ? digitado : undefined,
        incluirOpcao,
      });
      if (r.ok) setResultado(r);
      else setErro(r.erro);
    });
  }

  const titulo = resultado ? "Excluído" : `Excluir "${previa?.nome ?? nome}"?`;

  return (
    <Modal open={aberto} onClose={fechar} title={titulo} maxWidth="max-w-lg">
      {resultado ? (
        <div className="space-y-3">
          <p className="text-ui text-fg">
            <strong className="font-semibold">{resultado.nome}</strong> foi excluído de vez.
          </p>
          {resultado.resumo.length > 0 && (
            <BlocoRecolhivel titulo="O que saiu junto" resumo={resumoDaLinha(resultado.resumo.map((texto) => ({ texto })))}>
              <ul className="space-y-1 text-ui text-fg-secondary">
                {resultado.resumo.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </BlocoRecolhivel>
          )}
          <p className="text-helper text-fg-muted">Um registro da exclusão — quem excluiu, quando e o quê — fica na auditoria.</p>
          {resultado.arquivosNaoApagados > 0 && (
            <Aviso tom="atencao">
              {resultado.arquivosNaoApagados === 1
                ? "1 arquivo não saiu do disco do servidor."
                : `${resultado.arquivosNaoApagados} arquivos não saíram do disco do servidor.`}{" "}
              Ninguém mais o vê pelo Connect; o caso ficou registrado no log para a 41 Tech.
            </Aviso>
          )}
          <div className="flex justify-end pt-1">
            <Button variant="primary" onClick={fechar}>
              {depois === "atualizar" ? "Fechar" : "Voltar para a lista"}
            </Button>
          </div>
        </div>
      ) : erroDaPrevia ? (
        <div className="space-y-3">
          <Aviso>{erroDaPrevia}</Aviso>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={fechar}>
              Fechar
            </Button>
          </div>
        </div>
      ) : !previa ? (
        <p className="text-ui text-fg-muted py-4" role="status">
          Conferindo o que está ligado a este cadastro…
        </p>
      ) : (
        <div className="space-y-3">
          {previa.detalhe && <p className="text-helper text-fg-muted -mt-1 tabular-nums">{previa.detalhe}</p>}

          {previa.bloqueio ? (
            <Aviso tom="atencao">{previa.bloqueio}</Aviso>
          ) : previa.itens.length === 0 ? (
            <p className="text-ui text-fg-secondary">
              Nada está ligado a este cadastro. Ele é excluído de vez — não dá para desfazer.
            </p>
          ) : (
            <p className="text-ui text-fg-secondary">
              {previa.temHistorico
                ? "Este cadastro tem histórico. Confira o que está ligado — o que sai junto é apagado de vez, numa operação só."
                : "Confira o que está ligado antes de excluir. Não dá para desfazer."}
            </p>
          )}

          {previa.itens.length > 0 && <GruposDaPrevia itens={previa.itens} />}

          {previa.avisos.length > 0 && (
            <ul className="space-y-1.5">
              {previa.avisos.map((a) => (
                <li key={a}>
                  <Aviso tom="info">{a}</Aviso>
                </li>
              ))}
            </ul>
          )}

          {!previa.bloqueio && previa.opcao && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Checkbox
                id={`${campoId}-opcao`}
                label={previa.opcao.rotulo}
                helper={previa.opcao.ajuda}
                checked={incluirOpcao}
                onChange={(e) => setIncluirOpcao(e.target.checked)}
                disabled={excluindo}
              />
              {incluirOpcao && previa.opcao.itens.length > 0 && (
                <BlocoRecolhivel titulo="O que vem junto" resumo={resumoDaLinha(previa.opcao.itens)}>
                  <ListaDeItens itens={previa.opcao.itens} />
                </BlocoRecolhivel>
              )}
            </div>
          )}

          {/* O rótulo do `CampoForm` (15/10/2026), e não um <label> à mão;
              o nome vai entre aspas, já que o rótulo é texto. */}
          {!previa.bloqueio && exigeNome && (
            <CampoForm label={`Para confirmar, digite “${previa.nome}”`} htmlFor={`${campoId}-nome`}>
              <Input
                id={`${campoId}-nome`}
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={excluindo}
                error={digitado.trim() !== "" && !nomeOk}
              />
            </CampoForm>
          )}

          {erro && <Aviso>{erro}</Aviso>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={fechar} disabled={excluindo}>
              {previa.bloqueio ? "Fechar" : "Cancelar"}
            </Button>
            {!previa.bloqueio && (
              <Button
                variant="dangerSolid"
                onClick={confirmar}
                disabled={exigeNome && !nomeOk}
                loading={excluindo}
                loadingLabel="Excluindo…"
              >
                {exigeNome ? previa.rotuloDoModoCompleto : "Excluir"}
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** O botão "Excluir" com o diálogo — para fichas e cabeçalhos. */
export function BotaoExcluirCadastro({
  tipo,
  id,
  nome,
  rotulo = "Excluir",
  variant = "danger",
  size = "sm",
}: {
  tipo: TipoDeCadastro;
  id: string;
  nome: string;
  rotulo?: string;
  variant?: "danger" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setAberto(true)}>
        <Trash2 size={13} /> {rotulo}
      </Button>
      <ExcluirCadastro tipo={tipo} id={id} nome={nome} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  );
}
