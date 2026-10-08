"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { Cartao } from "@/components/shared/ListaResponsiva";
import type { AcaoDaGestao } from "@/app/(app)/gestao/actions";

/**
 * Uma linha da tabela de limites: dias para "parado" e antecedência do aviso de prazo.
 * Vive no casco padrão (`.c41-tabela`), que dá o respiro e centraliza as células.
 *
 * Campos `compact` (32px), a altura do "Salvar" `sm` da mesma linha — eram de
 * formulário (36px), e o botão ficava 4px mais baixo que eles.
 *
 * `comoCartao`: o mesmo setor num cartão, para o celular — a tabela de 520px
 * pedia rolagem lateral para chegar no "Salvar" (auditoria DRG-31, 07/10/2026).
 * Ali não há cabeçalho de coluna, então cada campo leva o rótulo.
 */
export function LimitesDoSetor({
  setor,
  rotulo,
  diasParado,
  diasAvisoPrazo,
  padrao,
  podeEditar,
  salvar,
  comoCartao = false,
}: {
  setor: string;
  rotulo: string;
  diasParado: number | null;
  diasAvisoPrazo: number | null;
  padrao: { diasParado: number; diasAvisoPrazo: number };
  podeEditar: boolean;
  salvar: (setor: string, diasParado: string, diasAvisoPrazo: string) => Promise<AcaoDaGestao>;
  comoCartao?: boolean;
}) {
  const router = useRouter();
  const [parado, setParado] = useState(diasParado === null ? "" : String(diasParado));
  const [aviso, setAviso] = useState(diasAvisoPrazo === null ? "" : String(diasAvisoPrazo));
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudou = parado !== (diasParado === null ? "" : String(diasParado)) || aviso !== (diasAvisoPrazo === null ? "" : String(diasAvisoPrazo));

  const idDoCampo = (campo: string) => `${campo}-${setor}${comoCartao ? "-cartao" : ""}`;
  const campoParado = (
    <Input
      id={idDoCampo("parado")}
      aria-label={comoCartao ? undefined : `Dias para parado em ${rotulo}`}
      inputMode="numeric"
      value={parado}
      placeholder={`${padrao.diasParado} (padrão)`}
      disabled={!podeEditar}
      onChange={(e) => setParado(e.target.value)}
      compact
      className={comoCartao ? "tabular-nums" : "w-32 tabular-nums"}
    />
  );
  const campoAviso = (
    <Input
      id={idDoCampo("aviso")}
      aria-label={comoCartao ? undefined : `Aviso de prazo em ${rotulo}`}
      inputMode="numeric"
      value={aviso}
      placeholder={`${padrao.diasAvisoPrazo} (padrão)`}
      disabled={!podeEditar}
      onChange={(e) => setAviso(e.target.value)}
      compact
      className={comoCartao ? "tabular-nums" : "w-32 tabular-nums"}
    />
  );
  const acao = (
    <>
      {podeEditar && mudou && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pendente}
          onClick={() =>
            startTransition(async () => {
              const r = await salvar(setor, parado, aviso);
              if ("error" in r) setMsg({ tipo: "erro", texto: r.error });
              else {
                setMsg({ tipo: "ok", texto: "Salvo." });
                router.refresh();
              }
            })
          }
        >
          Salvar
        </Button>
      )}
      {msg && <span className={`ml-2 text-fs-2 ${msg.tipo === "erro" ? "text-danger" : "text-success-fg"}`}>{msg.texto}</span>}
    </>
  );

  if (comoCartao) {
    return (
      <Cartao>
        <p className="font-medium text-fg mb-2">{rotulo}</p>
        <div className="grid grid-cols-2 gap-3">
          <CampoForm label="Dias para parado" htmlFor={idDoCampo("parado")}>
            {campoParado}
          </CampoForm>
          <CampoForm label="Aviso de prazo (dias)" htmlFor={idDoCampo("aviso")}>
            {campoAviso}
          </CampoForm>
        </div>
        {(msg || (podeEditar && mudou)) && <div className="flex items-center justify-end mt-2">{acao}</div>}
      </Cartao>
    );
  }

  return (
    <tr className="border-b border-border">
      <td className="px-3 font-medium text-fg">{rotulo}</td>
      <td className="px-3">{campoParado}</td>
      <td className="px-3">{campoAviso}</td>
      <td className="px-3 whitespace-nowrap">{acao}</td>
    </tr>
  );
}
