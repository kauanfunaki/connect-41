"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, MailOpen, Receipt } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoData } from "@/components/ui/CampoData";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { abrirMensagemAction, emitirGuiaAction, pedirSituacaoFiscalAction, verMensagemAction } from "@/app/(app)/autorizacoes/receita-actions";
import { rotaDeEnviarOArquivo } from "@/lib/envios/regras";
import { ROTULO_DA_GUIA, TIPOS_DE_GUIA, type TipoDeGuia } from "@/lib/serpro/guias";
import { MODALIDADES_DE_PARCELAMENTO } from "@/lib/serpro/servicos";
import type { MensagemAberta } from "@/lib/serpro/acompanhamento";
import { formatInstantDateTime } from "@/lib/format";

/** Pede o relatório de situação fiscal: uma emissão, cobrada. O PDF vai para a pasta Fiscal. */
export function PedirSituacaoFiscal({ companyId, desabilitado }: { companyId: string; desabilitado: boolean }) {
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pendente}
      disabled={desabilitado}
      onClick={() =>
        startTransition(async () => {
          const r = await pedirSituacaoFiscalAction(companyId);
          if (r.ok) toast.success(r.texto);
          else toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <FileSearch size={14} /> Pedir situação fiscal
    </Button>
  );
}

/**
 * Emite uma guia federal pelo Serpro (Fase 2 enxuta, 27/10/2026): DAS do
 * Simples, DAS do MEI, guia da DCTFWeb, DARF pelo Sicalc e a parcela dos
 * parcelamentos. A data de pagamento recalcula multa e juros. Uma emissão,
 * cobrada; o PDF vai para a pasta Guias (que o cliente vê no portal).
 */
export function EmitirGuia({ companyId, desabilitado, sugestao }: { companyId: string; desabilitado: boolean; sugestao: TipoDeGuia }) {
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<TipoDeGuia>(sugestao);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [decimoTerceiro, setDecimoTerceiro] = useState(false);
  const [resultado, setResultado] = useState<{ ok: true; texto: string; arquivoId: string } | { ok: false; erro: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const campo = (nome: string) => (valor: string) => setCampos((c) => ({ ...c, [nome]: valor }));
  const texto = (nome: string) => (e: React.ChangeEvent<HTMLInputElement>) => campo(nome)(e.target.value);
  const id = (nome: string) => `guia-${companyId}-${nome}`;
  const fechar = () => {
    setAberto(false);
    setResultado(null);
  };
  const emitir = () =>
    startTransition(async () => {
      const r = await emitirGuiaAction(companyId, { ...campos, tipo, decimoTerceiro });
      setResultado(r);
      if (r.ok) router.refresh();
    });

  return (
    <>
      <Button size="sm" variant="secondary" disabled={desabilitado} onClick={() => setAberto(true)}>
        <Receipt size={14} /> Emitir guia
      </Button>
      <Modal open={aberto} onClose={fechar} title="Emitir guia pelo Serpro" maxWidth="max-w-lg">
        <div className="flex flex-col gap-4">
          <CampoForm label="Guia" htmlFor={id("tipo")}>
            <Select
              id={id("tipo")}
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as TipoDeGuia);
                setResultado(null);
              }}
            >
              {TIPOS_DE_GUIA.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_DA_GUIA[t]}
                </option>
              ))}
            </Select>
          </CampoForm>

          {tipo === "PARCELA" ? (
            <>
              <CampoForm label="Modalidade" htmlFor={id("modalidade")}>
                <Select id={id("modalidade")} value={campos.modalidade ?? ""} onChange={(e) => campo("modalidade")(e.target.value)}>
                  <option value="">Escolha…</option>
                  {MODALIDADES_DE_PARCELAMENTO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Parcela (mês)" htmlFor={id("parcela")}>
                <CampoMes id={id("parcela")} value={campos.parcela ?? ""} onChange={campo("parcela")} />
              </CampoForm>
            </>
          ) : (
            <CampoForm label={tipo === "DCTFWEB" && decimoTerceiro ? "Ano do 13º (escolha qualquer mês dele)" : "Período de apuração"} htmlFor={id("periodo")}>
              <CampoMes id={id("periodo")} value={campos.periodo ?? ""} onChange={campo("periodo")} />
            </CampoForm>
          )}

          {tipo === "DCTFWEB" && <Checkbox id={id("13")} label="Guia do 13º salário" checked={decimoTerceiro} onChange={(e) => setDecimoTerceiro(e.target.checked)} />}

          {tipo === "DARF" && (
            <div className="grid grid-cols-2 gap-3">
              <CampoForm label="Código da receita" htmlFor={id("codigo")}>
                <Input id={id("codigo")} inputMode="numeric" placeholder="2089" value={campos.codigoReceita ?? ""} onChange={texto("codigoReceita")} />
              </CampoForm>
              <CampoForm label="Extensão" htmlFor={id("extensao")}>
                <Input id={id("extensao")} inputMode="numeric" placeholder="01" value={campos.extensao ?? ""} onChange={texto("extensao")} />
              </CampoForm>
              <CampoForm label="Vencimento" htmlFor={id("vencimento")}>
                <CampoData id={id("vencimento")} value={campos.vencimento ?? ""} onChange={campo("vencimento")} />
              </CampoForm>
              <CampoForm label="Valor do imposto (R$)" htmlFor={id("valor")}>
                <Input id={id("valor")} inputMode="decimal" placeholder="1.000,00" value={campos.valor ?? ""} onChange={texto("valor")} />
              </CampoForm>
            </div>
          )}

          {tipo !== "PARCELA" && (
            <CampoForm
              label="Data de pagamento"
              htmlFor={id("pagamento")}
              helper={
                tipo === "DCTFWEB"
                  ? "Para recalcular multa e juros: um dia útil deste mês, a partir de hoje. Em branco, hoje."
                  : "Para recalcular multa e juros com outra data. Em branco, hoje."
              }
            >
              <CampoData id={id("pagamento")} value={campos.pagamento ?? ""} onChange={campo("pagamento")} />
            </CampoForm>
          )}

          {resultado &&
            (resultado.ok ? (
              <Aviso tom="sucesso">
                {resultado.texto}{" "}
                <a href={`/api/arquivos/${resultado.arquivoId}?ver=1`} target="_blank" rel="noreferrer" className="text-brand underline">
                  Abrir o PDF
                </a>
                {" · "}
                {/* Lote 2 (28/10/2026): o envio já chega com a guia como anexo. */}
                <a href={rotaDeEnviarOArquivo(companyId, resultado.arquivoId)} className="text-brand underline">
                  Enviar ao cliente
                </a>
              </Aviso>
            ) : (
              <Aviso tom="perigo">{resultado.erro}</Aviso>
            ))}

          <p className="text-micro text-fg-muted">
            Uma emissão, cobrada pelo Serpro. O PDF vai para a pasta Guias da empresa nos Arquivos, que o cliente vê no portal.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={fechar}>
              {resultado?.ok ? "Fechar" : "Cancelar"}
            </Button>
            <Button loading={pendente} onClick={emitir}>
              {resultado?.ok ? "Emitir outra" : "Emitir"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** O corpo de uma mensagem aberta. Já vem limpo pelo sanitize, na gravação e na leitura. */
function JanelaDaMensagem({ mensagem, onClose }: { mensagem: MensagemAberta | null; onClose: () => void }) {
  return (
    <Modal open={!!mensagem} onClose={onClose} title={mensagem?.assunto ?? ""} maxWidth="max-w-2xl">
      {mensagem && (
        <div className="flex flex-col gap-3">
          <p className="text-micro text-fg-muted">
            Aberta pelo Connect em {formatInstantDateTime(new Date(mensagem.abertaEm))}
            {mensagem.abertaPor ? ` por ${mensagem.abertaPor}` : ""} — a ciência da intimação conta desse dia.
          </p>
          <div
            className="text-ui text-fg leading-relaxed space-y-2 max-h-[60vh] overflow-y-auto break-words [&_a]:text-brand [&_a]:underline [&_table]:w-full"
            dangerouslySetInnerHTML={{ __html: mensagem.corpo }}
          />
        </div>
      )}
    </Modal>
  );
}

/**
 * Abre a mensagem da Caixa Postal. Abrir DÁ CIÊNCIA da intimação: o diálogo
 * diz isso antes, e só a coordenação do Fiscal vê o botão (decisão do Kauan,
 * 20/10/2026). Aberta, ela é lida do banco, sem nova chamada.
 */
export function AbrirMensagem({ id }: { id: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<MensagemAberta | null>(null);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button size="xs" variant="secondary" onClick={() => setConfirmando(true)}>
        <MailOpen size={14} /> Abrir
      </Button>
      <ConfirmDialog
        open={confirmando}
        title="Abrir dá ciência da intimação"
        description="Abrir esta mensagem pelo Connect conta como ciência (Decreto 70.235/1972, art. 23, § 2º, III): o prazo de resposta começa a contar hoje, mesmo que ninguém leia depois. Quem abriu fica registrado. A consulta é cobrada pelo Serpro."
        confirmLabel="Abrir e dar ciência"
        pendingLabel="Abrindo…"
        destructive
        pending={pendente}
        error={erro}
        onCancel={() => {
          setConfirmando(false);
          setErro(null);
        }}
        onConfirm={() =>
          startTransition(async () => {
            const r = await abrirMensagemAction(id, true);
            if (!r.ok) {
              setErro(r.erro);
              return;
            }
            setConfirmando(false);
            setAberta(r.mensagem);
            router.refresh();
          })
        }
      />
      <JanelaDaMensagem mensagem={aberta} onClose={() => setAberta(null)} />
    </>
  );
}

/** Lê de novo uma mensagem já aberta, do banco: não chama o Serpro nem dá ciência de novo. */
export function VerMensagem({ id }: { id: string }) {
  const [aberta, setAberta] = useState<MensagemAberta | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  return (
    <>
      <Button
        size="xs"
        variant="secondary"
        loading={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await verMensagemAction(id);
            if (r.ok) setAberta(r.mensagem);
            else toast.error(r.erro);
          })
        }
      >
        <MailOpen size={14} /> Ver
      </Button>
      <JanelaDaMensagem mensagem={aberta} onClose={() => setAberta(null)} />
    </>
  );
}
