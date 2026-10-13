"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, RefreshCw } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { Checkbox } from "@/components/ui/Checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { formatCnpj, formatCpf, formatarCompetencia, formatarNumero, formatarReaisDeCentavos, formatInstantDateTime } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import { MAXIMO_DA_DESCRICAO } from "@/lib/integracoes/omie/emissao";
import type { ListasParaATela } from "@/lib/integracoes/omie/emissaoServidor";
import { carregarListasAction, emitirNfseAction } from "@/app/(app)/emitir-nfse/actions";

function documento(doc: string | null): string | undefined {
  if (!doc) return undefined;
  return doc.length === 11 ? formatCpf(doc) : formatCnpj(doc);
}

/** 1234.5 → "1.234,50", para o campo de valor. */
function valorParaCampo(n: number): string {
  return formatarNumero(n, 2);
}

/**
 * "Nova NFS-e" — o formulário da emissão pelo Omie (Fase 2, 13/10/2026).
 *
 * As listas vêm do Omie da empresa na hora em que o formulário abre (e ficam
 * 10 min guardadas no servidor): tomador e serviço são os do cadastro de lá,
 * porque a configuração fiscal mora no Omie e a OS aponta para códigos que
 * existem lá. A confirmação pede a caixa marcada — emitir é nota de verdade na
 * prefeitura, e o Enter do diálogo sozinho não emite.
 */
export function NovaNfse({
  companyId,
  empresaNome,
  competenciaAtual,
}: {
  companyId: string;
  empresaNome: string;
  /** "AAAA-MM" de hoje, em Brasília, vindo do servidor. */
  competenciaAtual: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [listas, setListas] = useState<ListasParaATela | null>(null);
  const [erroDasListas, setErroDasListas] = useState<string | null>(null);
  const [carregando, startCarregar] = useTransition();

  const [tomador, setTomador] = useState("");
  const [servico, setServico] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ tom: "perigo" | "atencao"; texto: string } | null>(null);

  const [confirmando, setConfirmando] = useState(false);
  const [entendi, setEntendi] = useState(false);
  const [erroDaConfirmacao, setErroDaConfirmacao] = useState<string | null>(null);
  const [emitindo, startEmitir] = useTransition();

  function carregar(atualizar: boolean) {
    setErroDasListas(null);
    startCarregar(async () => {
      const r = await carregarListasAction(companyId, atualizar);
      if (!r.ok) {
        setErroDasListas(r.erro);
        return;
      }
      setListas(r.listas);
    });
  }

  function abrir() {
    setAberto(true);
    setResultado(null);
    if (!listas) carregar(false);
  }

  function limpar() {
    setTomador("");
    setServico("");
    setValor("");
    setDescricao("");
    setErro(null);
  }

  const cliente = listas?.clientes.find((c) => c.codigo === tomador) ?? null;
  const doServico = listas?.servicos.find((s) => s.codigo === servico) ?? null;
  const centavos = centavosDeTexto(valor);

  function revisar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (!cliente) return setErro("Escolha o tomador.");
    if (!doServico) return setErro("Escolha o serviço.");
    if (centavos === null || centavos <= 0) return setErro("Informe o valor da nota.");
    setEntendi(false);
    setErroDaConfirmacao(null);
    setConfirmando(true);
  }

  function emitir() {
    if (!entendi) {
      setErroDaConfirmacao("Marque a caixa para confirmar que esta é uma nota de verdade.");
      return;
    }
    setErroDaConfirmacao(null);
    startEmitir(async () => {
      const r = await emitirNfseAction({
        companyId,
        tomadorCodigo: tomador,
        servicoCodigo: servico,
        valor,
        competencia: competenciaAtual,
        descricao,
        confirmado: entendi,
      });
      if (!r.ok) {
        setErroDaConfirmacao(r.erro);
        return;
      }
      setConfirmando(false);
      router.refresh();
      if (r.estado === "PROCESSANDO") {
        toast.success("Nota enviada ao Omie. A resposta da prefeitura aparece na lista em alguns minutos.");
        limpar();
        setAberto(false);
      } else if (r.estado === "ENVIANDO") {
        limpar();
        setAberto(false);
        toast.show("O Omie não confirmou o envio. O Connect confere em alguns minutos — não peça de novo antes disso.");
      } else {
        // Recusada: o formulário fica aberto e preenchido, com a mensagem do Omie.
        setResultado({ tom: "perigo", texto: r.mensagem ?? "O Omie recusou a nota." });
      }
    });
  }

  if (!aberto) {
    return (
      <Button onClick={abrir}>
        <FilePlus2 size={14} /> Nova NFS-e
      </Button>
    );
  }

  const opcoesDeTomador: Opcao[] = (listas?.clientes ?? []).map((c) => ({
    value: c.codigo,
    label: c.nome,
    descricao: [documento(c.documento), c.cidade].filter(Boolean).join(" · ") || undefined,
    busca: c.documento ?? undefined,
  }));
  const opcoesDeServico: Opcao[] = (listas?.servicos ?? []).map((s) => ({
    value: s.codigo,
    label: s.descricao,
    descricao: [s.codigoInterno, s.precoUnitario !== null ? formatarReaisDeCentavos(Math.round(s.precoUnitario * 100)) : null].filter(Boolean).join(" · ") || undefined,
    busca: s.codigoInterno ?? undefined,
  }));
  const conferencia = listas?.conferencia;

  return (
    <Card className="p-4 w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-card-title font-semibold">Nova NFS-e — {empresaNome}</h2>
        {listas && (
          <Button variant="ghost" size="xs" onClick={() => carregar(true)} loading={carregando} loadingLabel="Lendo o Omie…">
            <RefreshCw size={12} /> Listas lidas às {formatInstantDateTime(new Date(listas.lidasEm), { hour: "2-digit", minute: "2-digit" })} — atualizar
          </Button>
        )}
      </div>

      {!listas && carregando && <p className="text-ui text-fg-muted">Lendo tomadores e serviços no Omie da empresa…</p>}
      {erroDasListas && (
        <div className="flex flex-col gap-2">
          <Aviso>{erroDasListas}</Aviso>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => carregar(true)} loading={carregando}>
              Tentar de novo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {conferencia && !conferencia.pode && (
        <div className="flex flex-col gap-2">
          <Aviso>{conferencia.motivo}</Aviso>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {listas && conferencia?.pode && (
        <form onSubmit={revisar} className="flex flex-col gap-4">
          {conferencia.empresasNaConta > 1 && (
            <Aviso tom="atencao">
              Esta conta do Omie tem {conferencia.empresasNaConta} empresas cadastradas, e a ordem de serviço não diz qual delas emite: a nota sai pela empresa do
              aplicativo no Omie. Na primeira nota, confira o CNPJ do prestador — o Connect avisa se vier outro.
            </Aviso>
          )}
          {(listas.clientesCortados || listas.servicosCortados) && (
            <Aviso tom="atencao">
              A lista {listas.clientesCortados ? "de tomadores" : "de serviços"} parou nos primeiros registros do Omie. Se quem você procura não aparece, emita esta pela
              tela do Omie.
            </Aviso>
          )}
          {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}

          <FieldGrid columns="sm:grid-cols-2">
            <CampoForm label="Tomador" htmlFor={`${id}-tomador`} required helper="Clientes cadastrados no Omie da empresa.">
              <SearchableSelect
                id={`${id}-tomador`}
                name="tomador"
                options={opcoesDeTomador}
                defaultValue={tomador}
                placeholder={opcoesDeTomador.length ? "Buscar por nome ou CNPJ…" : "Nenhum cliente ativo no Omie"}
                onChange={setTomador}
              />
            </CampoForm>
            <CampoForm label="Serviço" htmlFor={`${id}-servico`} required helper="Do cadastro de serviços do Omie — é de lá que vêm código municipal, tributação e alíquotas.">
              <SearchableSelect
                id={`${id}-servico`}
                name="servico"
                options={opcoesDeServico}
                defaultValue={servico}
                placeholder={opcoesDeServico.length ? "Buscar serviço…" : "Nenhum serviço ativo no Omie"}
                onChange={(v) => {
                  setServico(v);
                  const s = listas.servicos.find((x) => x.codigo === v);
                  if (!valor && s?.precoUnitario) setValor(valorParaCampo(s.precoUnitario));
                }}
              />
            </CampoForm>
            <CampoForm label="Valor" htmlFor={`${id}-valor`} required>
              <Input id={`${id}-valor`} prefix="R$" inputMode="decimal" placeholder="1.234,56" value={valor} onChange={(e) => setValor(e.target.value)} required />
            </CampoForm>
            <CampoForm
              label="Competência"
              htmlFor={`${id}-competencia`}
              helper="O Omie não recebe competência pela API: a nota sai com a data do faturamento, no mês corrente. Para outra competência, emita pela tela do Omie."
            >
              <CampoMes id={`${id}-competencia`} value={competenciaAtual} min={competenciaAtual} max={competenciaAtual} disabled />
            </CampoForm>
            <CampoForm
              label="Descrição do serviço na nota"
              htmlFor={`${id}-descricao`}
              className="sm:col-span-2"
              helper="Em branco, vale a descrição do serviço no cadastro do Omie."
            >
              <Textarea id={`${id}-descricao`} rows={3} maxLength={MAXIMO_DA_DESCRICAO} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </CampoForm>
          </FieldGrid>

          <FormFooter
            pending={false}
            submitLabel="Revisar e emitir"
            onCancel={() => setAberto(false)}
            erro={erro}
            nota="Nada é enviado antes da confirmação."
          />
        </form>
      )}

      <ConfirmDialog
        open={confirmando}
        title="Emitir esta NFS-e?"
        description={`Isto emite uma nota de verdade na prefeitura, pelo Omie de ${empresaNome}. Desfazer é cancelar a nota, dentro do prazo da prefeitura.`}
        confirmLabel="Emitir nota"
        pendingLabel="Enviando ao Omie…"
        pending={emitindo}
        error={erroDaConfirmacao}
        onConfirm={emitir}
        onCancel={() => setConfirmando(false)}
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ui mb-3">
          <dt className="text-fg-muted">Tomador</dt>
          <dd className="min-w-0 break-words">
            {cliente?.nome}
            {cliente?.documento ? ` · ${documento(cliente.documento)}` : ""}
          </dd>
          <dt className="text-fg-muted">Serviço</dt>
          <dd className="min-w-0 break-words">{doServico?.descricao}</dd>
          <dt className="text-fg-muted">Valor</dt>
          <dd className="tabular-nums">{centavos !== null ? formatarReaisDeCentavos(centavos) : "—"}</dd>
          <dt className="text-fg-muted">Competência</dt>
          <dd>{formatarCompetencia(competenciaAtual)}</dd>
          {descricao.trim() && (
            <>
              <dt className="text-fg-muted">Descrição</dt>
              <dd className="min-w-0 break-words whitespace-pre-line">{descricao.trim()}</dd>
            </>
          )}
        </dl>
        <Checkbox
          id={`${id}-entendi`}
          checked={entendi}
          onChange={(e) => setEntendi(e.target.checked)}
          label="Entendo que isto emite uma nota de verdade na prefeitura."
        />
      </ConfirmDialog>
    </Card>
  );
}
