"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { formatarReaisDeCentavos } from "@/lib/format";
import { dadosDaBaixaEmLote, registrarPagamentosEmLote, type DadosDoLote, type ResultadoDoLote } from "@/lib/financeiro/acoes";
import { algumaTemRegra, encargosDoLote, type ForaDoLote } from "@/lib/financeiro/baixa/lote";
import { contaSugeridaNaBaixa } from "@/lib/financeiro/contaPrevista";

const reais = (c: number) => formatarReaisDeCentavos(c);
const dataBr = (k: string) => k.split("-").reverse().join("/");

/**
 * A baixa em lote (fila do BPO, 19/10): as contas marcadas na tabela, cada uma
 * pelo saldo, num dia só. Parcial e juros digitados à mão são da janela de
 * uma conta (o botão Pagar da linha). Desde 22/10/2026, "Calcular juros e
 * multa pelo atraso" aplica a regra de cada conta (a do fornecedor ou cliente,
 * senão a da empresa) pelo vencimento dela e pelo dia do lote; nasce ligada
 * quando alguma conta marcada tem regra.
 *
 * Abre com "Carregando…" e pergunta ao servidor o que entra: a tabela não sabe
 * do saldo de quem pagou em parte nem da aprovação relida agora, e a conta
 * bancária é da empresa de cada conta — a lista mistura empresas.
 */
export function JanelaDaBaixaEmLote({
  ids,
  hojeISO,
  aPagar,
  onFechar,
  onBaixadas,
}: {
  ids: string[];
  hojeISO: string;
  aPagar: boolean;
  onFechar: () => void;
  onBaixadas: (resumo: string) => void;
}) {
  const [dados, setDados] = useState<DadosDoLote | null>(null);
  const [resultado, setResultado] = useState<Extract<ResultadoDoLote, { ok: true }> | null>(null);
  const [pendente, setPendente] = useState(false);

  useEffect(() => {
    let vivo = true;
    dadosDaBaixaEmLote(ids).then((d) => vivo && setDados(d));
    return () => {
      vivo = false;
    };
  }, [ids]);

  const titulo = aPagar ? "Pagar contas marcadas" : "Receber contas marcadas";
  return (
    <Modal open onClose={() => !pendente && onFechar()} title={titulo} maxWidth="max-w-2xl">
      {resultado ? (
        <Resultado resultado={resultado} aPagar={aPagar} onFechar={onFechar} />
      ) : dados === null ? (
        <p className="py-6 text-center text-fs-2 text-fg-muted">Carregando…</p>
      ) : !dados.ok ? (
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao" icone={<Lock />}>
            {dados.erro}
          </Aviso>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onFechar}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <Formulario
          dados={dados}
          hojeISO={hojeISO}
          aoMudarPendente={setPendente}
          onCancelar={onFechar}
          onGravado={(r) => {
            if (r.recusadas.length === 0) onBaixadas(resumo(r, aPagar));
            else setResultado(r);
          }}
        />
      )}
    </Modal>
  );
}

function resumo(r: { baixadas: number; totalCentavos: number }, aPagar: boolean) {
  const contas = r.baixadas === 1 ? "1 conta" : `${r.baixadas} contas`;
  return `${contas} ${aPagar ? (r.baixadas === 1 ? "paga" : "pagas") : r.baixadas === 1 ? "recebida" : "recebidas"} · ${reais(r.totalCentavos)}.`;
}

function ListaDeFora({ ficam, titulo }: { ficam: ForaDoLote[]; titulo: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label font-semibold text-fg">{titulo}</p>
      <ul className="text-fs-2 text-fg-secondary">
        {ficam.map((f) => (
          <li key={f.id}>
            <span className="text-fg">{f.contraparteNome}</span> — {f.motivo}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Formulario({
  dados,
  hojeISO,
  aoMudarPendente,
  onCancelar,
  onGravado,
}: {
  dados: Extract<DadosDoLote, { ok: true }>;
  hojeISO: string;
  aoMudarPendente: (p: boolean) => void;
  onCancelar: () => void;
  onGravado: (r: Extract<ResultadoDoLote, { ok: true }>) => void;
}) {
  const id = useId();
  const aPagar = dados.kind === "PAGAR";
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [dataKey, setDataKey] = useState(hojeISO);
  const temRegra = algumaTemRegra(dados.entram.map((c) => ({ regra: c.regraDeEncargos })));
  const [comEncargos, setComEncargos] = useState(temRegra);
  // A prévia dos encargos: o servidor refaz conta a conta pela regra do banco.
  const encargos = comEncargos && dataKey ? encargosDoLote(dados.entram.map((c) => ({ ...c, regra: c.regraDeEncargos })), dataKey) : null;
  const principal = dados.entram.reduce((s, c) => s + c.saldoCentavos, 0);
  const total = principal + (encargos ? encargos.jurosCentavos + encargos.multaCentavos - encargos.descontoCentavos : 0);
  const variasEmpresas = dados.empresas.length > 1;

  if (dados.entram.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tom="atencao">Nenhuma das contas marcadas pode ser {aPagar ? "paga" : "recebida"} em lote.</Aviso>
        <ListaDeFora ficam={dados.ficam} titulo="Por quê" />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancelar}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setErro(null);
        aoMudarPendente(true);
        startTransition(async () => {
          const r = await registrarPagamentosEmLote(form);
          aoMudarPendente(false);
          if ("error" in r) setErro(r.error);
          else onGravado(r);
        });
      }}
    >
      {dados.entram.map((c) => (
        <input key={c.id} type="hidden" name="entryIds" value={c.id} />
      ))}
      {comEncargos && <input type="hidden" name="encargos" value="1" />}

      <div className="max-h-[260px] overflow-y-auto border border-border rounded-md">
        <table className="w-full text-ui">
          <tbody>
            {dados.entram.map((c) => {
              const e = encargos?.porConta.get(c.id);
              const acrescimo = e ? e.jurosCentavos + e.multaCentavos - e.descontoCentavos : 0;
              return (
                <tr key={c.id} className="border-b border-border-soft last:border-b-0">
                  <td className="py-2 px-3">
                    <span className="font-medium text-fg">{c.contraparteNome}</span>
                    <span className="block text-micro text-fg-muted">
                      venc. {dataBr(c.vencimentoKey)}
                      {variasEmpresas && ` · ${c.empresaNome}`}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                    {reais(c.saldoCentavos + acrescimo)}
                    {e && (
                      <span className="block text-micro text-fg-muted">
                        {e.descontoCentavos ? `− ${reais(e.descontoCentavos)} de desconto` : `+ ${reais(e.jurosCentavos + e.multaCentavos)} de juros e multa`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dados.ficam.length > 0 && <ListaDeFora ficam={dados.ficam} titulo={`Ficam de fora (${dados.ficam.length})`} />}

      <FieldGrid>
        <CampoForm label={aPagar ? "Data do pagamento" : "Data do recebimento"} htmlFor={`${id}-data`} required>
          <CampoData id={`${id}-data`} name="data" value={dataKey} onChange={setDataKey} max={hojeISO} required />
        </CampoForm>
        {dados.empresas.map((e) => (
          <CampoForm
            key={e.id}
            label={`${aPagar ? "Saiu da conta" : "Entrou na conta"}${variasEmpresas ? ` · ${e.nome}` : ""}`}
            htmlFor={`${id}-conta-${e.id}`}
            helper={
              e.contas.length === 0
                ? "Nenhuma conta bancária cadastrada nesta empresa (Banco e caixa)."
                : e.contaPrevistaId && contaSugeridaNaBaixa(e.contas, e.contaPrevistaId) === e.contaPrevistaId
                  ? "A prevista nas contas desta empresa. É a que a conciliação procura."
                  : "Opcional. É a conta que a conciliação procura."
            }
          >
            <Select
              id={`${id}-conta-${e.id}`}
              name={`conta:${e.id}`}
              defaultValue={contaSugeridaNaBaixa(e.contas, e.contaPrevistaId)}
              disabled={e.contas.length === 0}
            >
              <option value="">Não informada</option>
              {e.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoForm>
        ))}
      </FieldGrid>

      <CampoForm label="Observação" htmlFor={`${id}-obs`} helper="Vai em cada baixa.">
        <Input id={`${id}-obs`} name="observacao" maxLength={255} placeholder="Ex.: pagamentos da semana" />
      </CampoForm>

      <Checkbox
        id={`${id}-encargos`}
        label="Calcular juros e multa pelo atraso"
        checked={comEncargos}
        onChange={(e) => setComEncargos(e.target.checked)}
        disabled={!temRegra}
        helper={
          temRegra
            ? "Pela regra de cada conta — a do fornecedor ou cliente, senão a da empresa —, contando do vencimento dela até a data acima. O desconto vale para quem paga até o vencimento."
            : "Nenhuma das contas marcadas tem regra de juros e multa (Fornecedores e sacados › Juros e multa)."
        }
      />
      {encargos && (
        <p className="text-fs-2 text-fg-secondary" aria-live="polite">
          {encargos.contasComEncargos === 0
            ? "Nenhuma conta leva juros, multa ou desconto nesta data."
            : `${encargos.contasComEncargos === 1 ? "1 conta leva" : `${encargos.contasComEncargos} contas levam`}: juros ${reais(encargos.jurosCentavos)} · multa ${reais(encargos.multaCentavos)} · desconto ${reais(encargos.descontoCentavos)}. Total do lote ${reais(principal)} → ${reais(total)}.`}
        </p>
      )}

      <p className="text-helper text-fg-muted">
        Cada conta é {aPagar ? "paga" : "recebida"} pelo saldo{comEncargos ? ", com os encargos da regra" : ""}. Para juros digitados à mão ou baixa parcial, use o botão{" "}
        {aPagar ? "Pagar" : "Receber"} da linha.
      </p>

      <FormFooter
        pending={pendente}
        submitLabel={`${aPagar ? "Pagar" : "Receber"} ${dados.entram.length === 1 ? "1 conta" : `${dados.entram.length} contas`} · ${reais(total)}`}
        pendingLabel="Registrando…"
        onCancel={onCancelar}
        erro={erro}
      />
    </form>
  );
}

function Resultado({ resultado, aPagar, onFechar }: { resultado: Extract<ResultadoDoLote, { ok: true }>; aPagar: boolean; onFechar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      {resultado.baixadas > 0 ? (
        <Aviso tom="sucesso">{resumo(resultado, aPagar)}</Aviso>
      ) : (
        <Aviso tom="atencao">Nenhuma conta foi {aPagar ? "paga" : "recebida"}.</Aviso>
      )}
      <ListaDeFora ficam={resultado.recusadas} titulo={`Não ${aPagar ? "pagas" : "recebidas"} (${resultado.recusadas.length})`} />
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onFechar}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
