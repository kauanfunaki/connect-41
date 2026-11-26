"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FilePlus2, ReceiptText, RefreshCw, Search } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { CadeadoDoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { EmpresaDoRegistro } from "@/components/empresas/EmpresaDaTela";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { formatarReaisDeCentavos, formatInstantDateTime } from "@/lib/format";
import { MAXIMO_DA_DESCRICAO } from "@/lib/integracoes/omie/emissao";
import {
  assinaturaDoPedido,
  categoriaInicial,
  codigosSugeridos,
  documentoFormatado,
  fraseDoQueFalta,
  montarPrevia,
  origemDaCategoria,
  pendenciasDoPedido,
  resumoDosCodigos,
  servicoSemCodigoFiscal,
  valorParaCampo,
  type CamposDaNfse,
  type PreviaDaNfse,
} from "@/lib/integracoes/omie/previaDaNfse";
import type { ListasParaATela } from "@/lib/fiscal/nfse/emissor";
import { buscarTomadoresAction, carregarListasAction, emitirNfseAction } from "@/app/(app)/emitir-nfse/actions";

const MOTIVO_DA_COMPETENCIA =
  "O Omie não recebe competência pela API: a nota sai com a data do faturamento, no mês corrente. Para outra competência, emita pela tela do Omie.";

/**
 * "Nova NFS-e" — o formulário da emissão pelo Omie (Fase 2, 13/10/2026).
 *
 * As listas vêm do Omie da empresa na hora em que o formulário abre (e ficam
 * 10 min guardadas no servidor): tomador e serviço são os do cadastro de lá,
 * porque a configuração fiscal mora no Omie e a OS aponta para códigos que
 * existem lá. A categoria é obrigatória e editável — a do cadastro do serviço,
 * ou, sem ela, a da OS mais recente não cancelada da empresa.
 *
 * Janela com a prévia da nota ao lado (melhoria-855, alternativa A escolhida
 * pelo Kauan em 26/11/2026): à esquerda os campos, em uma coluna e sem frases
 * de ajuda; à direita a nota como vai sair, atualizada a cada campo. Embaixo
 * da prévia, a caixa "Entendo que isto emite uma nota de verdade na
 * prefeitura." e o "Emitir nota", que só acende com ela marcada — no lugar do
 * diálogo de confirmação que repetia tudo depois de a janela fechar. A caixa
 * vale para a nota como estava ao marcar: mudou um campo, desmarca. O Enter
 * num campo não emite; só o clique no botão. Abaixo de 1.100 px a prévia
 * desce para baixo dos campos.
 *
 * Serviço sem código municipal nem LC 116 no cadastro traz os da OS mais
 * recente com ele já preenchidos, num recolhível fechado com o resumo na
 * linha — antes era um aviso, dois campos e um "Usar o da OS" em cada.
 */
export function NovaNfse({
  companyId,
  empresaNome,
  empresaCnpj,
  competenciaAtual,
}: {
  companyId: string;
  empresaNome: string;
  /** Só dígitos — o prestador da prévia. */
  empresaCnpj?: string | null;
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
  const [categoria, setCategoria] = useState("");
  const [codigoMunicipal, setCodigoMunicipal] = useState("");
  const [codigoLC116, setCodigoLC116] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  /** A recusa do Omie: o formulário fica aberto e preenchido, com a mensagem. */
  const [recusa, setRecusa] = useState<string | null>(null);

  /** A assinatura da nota quando a caixa foi marcada — ver `assinaturaDoPedido`. */
  const [confirmadoPara, setConfirmadoPara] = useState<string | null>(null);
  const [emitindo, startEmitir] = useTransition();
  // O clique duplo chega antes de o botão travar: a segunda chamada para aqui.
  const emitindoAgora = useRef(false);

  // Busca do tomador que ficou fora da lista (28/10/2026): a lista para em
  // 1.000 clientes. Os achados entram nas opções; um achado só já fica escolhido.
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoDaBusca, setTermoDaBusca] = useState("");
  const [avisoDaBusca, setAvisoDaBusca] = useState<string | null>(null);
  const [buscando, startBuscar] = useTransition();
  const [versaoDoTomador, setVersaoDoTomador] = useState(0);

  function buscarTomador() {
    setAvisoDaBusca(null);
    startBuscar(async () => {
      const r = await buscarTomadoresAction(companyId, termoDaBusca);
      if (!r.ok) {
        setAvisoDaBusca(r.erro);
        return;
      }
      const bloqueados = r.bloqueados > 0 ? ` ${r.bloqueados === 1 ? "1 achado está" : `${r.bloqueados} achados estão`} com o faturamento bloqueado no Omie e ficou de fora.` : "";
      if (r.clientes.length === 0) {
        setAvisoDaBusca(`Nenhum cliente ativo com esse nome ou documento no Omie desta empresa.${bloqueados}`);
        return;
      }
      setListas((atual) => {
        if (!atual) return atual;
        const novos = r.clientes.filter((c) => !atual.clientes.some((x) => x.codigo === c.codigo));
        return { ...atual, clientes: [...atual.clientes, ...novos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
      });
      if (r.clientes.length === 1) setTomador(r.clientes[0].codigo);
      setVersaoDoTomador((v) => v + 1);
      setAvisoDaBusca(
        r.clientes.length === 1
          ? `Achado e escolhido: ${r.clientes[0].nome}.${bloqueados}`
          : `${r.clientes.length} achados entraram na lista do campo Tomador.${bloqueados}`
      );
    });
  }

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
    setRecusa(null);
    setErro(null);
    setConfirmadoPara(null);
    if (!listas) carregar(false);
  }

  function fechar() {
    // Com o pedido no meio do caminho, a janela não fecha: a resposta volta para ela.
    if (emitindo || emitindoAgora.current) return;
    setAberto(false);
  }

  function limpar() {
    setTomador("");
    setServico("");
    setValor("");
    setDescricao("");
    setCategoria("");
    setCodigoMunicipal("");
    setCodigoLC116("");
    setErro(null);
    setRecusa(null);
    setConfirmadoPara(null);
  }

  const cliente = listas?.clientes.find((c) => c.codigo === tomador) ?? null;
  const doServico = listas?.servicos.find((s) => s.codigo === servico) ?? null;
  const categoriaSugerida = listas?.categoriaSugerida ?? null;
  const semCodigoFiscal = servicoSemCodigoFiscal(doServico);
  const daUltimaOS = doServico?.naUltimaOS ?? null;

  const campos: CamposDaNfse = { tomador, servico, valor, descricao, categoria, codigoMunicipal, codigoLC116 };
  const assinatura = assinaturaDoPedido(campos, competenciaAtual);
  const falta = pendenciasDoPedido({ cliente, servico: doServico, valor, categoria });
  const confirmado = confirmadoPara === assinatura;
  const previa = montarPrevia({ prestador: { nome: empresaNome, cnpj: empresaCnpj ?? null }, cliente, servico: doServico, campos, competencia: competenciaAtual });

  function escolherServico(v: string) {
    setServico(v);
    const s = listas?.servicos.find((x) => x.codigo === v) ?? null;
    if (!valor && s?.precoUnitario) setValor(valorParaCampo(s.precoUnitario));
    // A categoria acompanha o serviço: a do cadastro dele, senão a sugerida pelas OS.
    setCategoria(categoriaInicial(s, categoriaSugerida));
    // Os códigos da OS mais recente já entram como sugestão (melhoria-855).
    const sugeridos = codigosSugeridos(s);
    setCodigoMunicipal(sugeridos.codigoMunicipal);
    setCodigoLC116(sugeridos.codigoLC116);
  }

  function emitir() {
    if (emitindoAgora.current) return;
    const oQueFalta = fraseDoQueFalta(falta);
    if (oQueFalta) return setErro(oQueFalta);
    if (!confirmado) return setErro("Marque a caixa para confirmar que esta é uma nota de verdade.");
    emitindoAgora.current = true;
    setErro(null);
    setRecusa(null);
    startEmitir(async () => {
      try {
        const r = await emitirNfseAction({
          companyId,
          tomadorCodigo: tomador,
          servicoCodigo: servico,
          valor,
          competencia: competenciaAtual,
          descricao,
          categoria,
          codigoServicoMunicipal: codigoMunicipal,
          codigoLC116,
          confirmado,
        });
        if (!r.ok) {
          setErro(r.erro);
          return;
        }
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
          // Recusada: fica tudo preenchido, com a mensagem do Omie, e a caixa
          // desmarca — outra tentativa é outra nota, confirmada de novo.
          setRecusa(r.mensagem ?? "O Omie recusou a nota.");
          setConfirmadoPara(null);
        }
      } finally {
        emitindoAgora.current = false;
      }
    });
  }

  const opcoesDeTomador: Opcao[] = (listas?.clientes ?? []).map((c) => ({
    value: c.codigo,
    label: c.nome,
    descricao: [documentoFormatado(c.documento), c.cidade].filter(Boolean).join(" · ") || undefined,
    busca: c.documento ?? undefined,
  }));
  const opcoesDeServico: Opcao[] = (listas?.servicos ?? []).map((s) => ({
    value: s.codigo,
    label: s.descricao,
    descricao: [s.codigoInterno, s.precoUnitario !== null ? formatarReaisDeCentavos(Math.round(s.precoUnitario * 100)) : null].filter(Boolean).join(" · ") || undefined,
    busca: s.codigoInterno ?? undefined,
  }));
  const conferencia = listas?.conferencia;
  const comFormulario = Boolean(listas && conferencia?.pode);
  const origem = origemDaCategoria(doServico, categoriaSugerida, categoria);
  const idDoQueFalta = `${id}-falta`;

  function ajudaDaCategoria(): string {
    if (origem === "sugerida" && categoriaSugerida) {
      return `Sugerida pela OS ${categoriaSugerida.numeroOS}, a mais recente da empresa: o serviço não tem categoria no Omie. Confira antes de emitir.`;
    }
    if (origem === "servico") return "A do cadastro do serviço no Omie.";
    return "O código da categoria de receita, como aparece no Omie (ex.: 1.01.02). A ordem de serviço não sai sem ela.";
  }

  function avisoDaCategoria(): string | undefined {
    if (!doServico) return undefined;
    if (doServico.categoria && categoria.trim() !== doServico.categoria) return `O serviço usa ${doServico.categoria} no Omie.`;
    if (!doServico.categoria && !categoriaSugerida && !categoria.trim()) return "Sem categoria no serviço nem nas OS recentes: informe a do Omie.";
    return undefined;
  }

  return (
    <>
      <Button onClick={abrir}>
        <FilePlus2 size={14} /> Nova NFS-e
      </Button>
      <Modal
        open={aberto}
        onClose={fechar}
        title="Nova NFS-e"
        aoLadoDoTitulo={
          <Selo className="max-w-full">
            <span className="min-w-0 truncate" title={empresaNome}>
              {empresaNome}
            </span>
          </Selo>
        }
        maxWidth={comFormulario ? "max-w-5xl" : "max-w-lg"}
      >
        {!listas && carregando && <p className="text-ui text-fg-muted">Lendo tomadores e serviços no Omie da empresa…</p>}
        {erroDasListas && (
          <div className="flex flex-col gap-2">
            <Aviso>{erroDasListas}</Aviso>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => carregar(true)} loading={carregando}>
                Tentar de novo
              </Button>
              <Button variant="ghost" size="sm" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {conferencia && !conferencia.pode && (
          <div className="flex flex-col gap-2">
            <Aviso>{conferencia.motivo}</Aviso>
            <div>
              <Button variant="ghost" size="sm" onClick={fechar}>
                Fechar
              </Button>
            </div>
          </div>
        )}

        {listas && conferencia?.pode && (
          // O Enter num campo não emite: só o clique em "Emitir nota".
          <form onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
            <div className="grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_400px]">
              {/* ── Os campos ── */}
              <div className="flex min-w-0 flex-col gap-4">
                <CampoForm
                  label="Tomador"
                  htmlFor={`${id}-tomador`}
                  required
                  helper={
                    opcoesDeTomador.length === 0
                      ? "Nenhum cliente ativo no Omie desta empresa. Cadastre lá e atualize as listas."
                      : listas.clientesBloqueados > 0
                        ? `${listas.clientesBloqueados === 1 ? "1 cliente com faturamento bloqueado no Omie ficou" : `${listas.clientesBloqueados} clientes com faturamento bloqueado no Omie ficaram`} de fora.`
                        : undefined
                  }
                >
                  <SearchableSelect
                    key={`tomador-${versaoDoTomador}`}
                    id={`${id}-tomador`}
                    name="tomador"
                    options={opcoesDeTomador}
                    defaultValue={tomador}
                    placeholder={opcoesDeTomador.length ? "Buscar por nome ou CNPJ…" : "Nenhum cliente ativo no Omie"}
                    onChange={setTomador}
                  />
                </CampoForm>
                {listas.clientesCortados && (
                  // A lista para em 1.000 clientes: quem ficou de fora se busca no cadastro do Omie.
                  <div className="-mt-2 flex flex-col gap-1.5">
                    {buscaAberta ? (
                      <div className="flex gap-2">
                        <Input
                          id={`${id}-busca-tomador`}
                          aria-label="Buscar tomador no Omie"
                          value={termoDaBusca}
                          placeholder="CNPJ, CPF ou nome"
                          autoFocus
                          onChange={(e) => setTermoDaBusca(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              buscarTomador();
                            }
                          }}
                        />
                        <Button type="button" variant="secondary" onClick={buscarTomador} loading={buscando} loadingLabel="Buscando…">
                          Buscar no Omie
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="link" className="self-start text-helper" onClick={() => setBuscaAberta(true)}>
                        <Search size={12} aria-hidden /> Não está na lista? Buscar no Omie
                      </Button>
                    )}
                    {avisoDaBusca && (
                      <p className="text-helper text-fg-muted" role="status">
                        {avisoDaBusca}
                      </p>
                    )}
                  </div>
                )}

                <CampoForm
                  label="Serviço"
                  htmlFor={`${id}-servico`}
                  required
                  helper={
                    opcoesDeServico.length === 0
                      ? "Nenhum serviço ativo no Omie desta empresa. Cadastre lá e atualize as listas."
                      : listas.servicosCortados
                        ? "A lista parou nos primeiros serviços do Omie. Não achou? Emita pela tela do Omie."
                        : undefined
                  }
                >
                  <SearchableSelect
                    id={`${id}-servico`}
                    name="servico"
                    options={opcoesDeServico}
                    defaultValue={servico}
                    placeholder={opcoesDeServico.length ? "Buscar serviço…" : "Nenhum serviço ativo no Omie"}
                    onChange={escolherServico}
                  />
                </CampoForm>
                {semCodigoFiscal && (
                  <BlocoRecolhivel
                    className="-mt-2"
                    titulo="Códigos fiscais desta nota"
                    cor="var(--color-warning)"
                    resumo={
                      <>
                        <span className="hidden sm:inline">sem código no Omie · </span>
                        {resumoDosCodigos(doServico, codigoMunicipal, codigoLC116)}
                      </>
                    }
                  >
                    <div className="flex flex-col gap-3">
                      <FieldGrid columns="sm:grid-cols-2">
                        <CampoForm
                          label="Código de serviço municipal"
                          htmlFor={`${id}-municipal`}
                          acao={
                            daUltimaOS?.codigoMunicipal && codigoMunicipal !== daUltimaOS.codigoMunicipal ? (
                              <Button variant="link" onClick={() => setCodigoMunicipal(daUltimaOS.codigoMunicipal ?? "")}>
                                Usar o da OS {daUltimaOS.numeroOS}
                              </Button>
                            ) : codigoMunicipal ? (
                              <Button variant="linkMuted" onClick={() => setCodigoMunicipal("")}>
                                Limpar
                              </Button>
                            ) : undefined
                          }
                        >
                          <Input id={`${id}-municipal`} maxLength={20} value={codigoMunicipal} onChange={(e) => setCodigoMunicipal(e.target.value)} />
                        </CampoForm>
                        <CampoForm
                          label="Código da LC 116"
                          htmlFor={`${id}-lc116`}
                          acao={
                            daUltimaOS?.codigoLC116 && codigoLC116 !== daUltimaOS.codigoLC116 ? (
                              <Button variant="link" onClick={() => setCodigoLC116(daUltimaOS.codigoLC116 ?? "")}>
                                Usar o da OS {daUltimaOS.numeroOS}
                              </Button>
                            ) : codigoLC116 ? (
                              <Button variant="linkMuted" onClick={() => setCodigoLC116("")}>
                                Limpar
                              </Button>
                            ) : undefined
                          }
                        >
                          <Input id={`${id}-lc116`} maxLength={20} placeholder="Ex.: 1.07" value={codigoLC116} onChange={(e) => setCodigoLC116(e.target.value)} />
                        </CampoForm>
                      </FieldGrid>
                      <p className="text-helper text-fg-muted">
                        {daUltimaOS ? `Sugeridos pela OS ${daUltimaOS.numeroOS}, a mais recente com este serviço. ` : ""}Em branco, vale o que o Omie tiver para o
                        serviço.
                      </p>
                    </div>
                  </BlocoRecolhivel>
                )}

                <CampoForm label="Descrição na nota" htmlFor={`${id}-descricao`} acao={<span className="text-fg-muted">opcional</span>}>
                  <Textarea
                    id={`${id}-descricao`}
                    rows={3}
                    maxLength={MAXIMO_DA_DESCRICAO}
                    placeholder="Em branco, vai a descrição do cadastro do Omie."
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />
                </CampoForm>

                <FieldGrid columns="sm:grid-cols-2">
                  <CampoForm label="Valor" htmlFor={`${id}-valor`} required>
                    <Input id={`${id}-valor`} prefix="R$" inputMode="decimal" placeholder="1.234,56" value={valor} onChange={(e) => setValor(e.target.value)} required />
                  </CampoForm>
                  <CampoForm
                    label="Categoria no Omie"
                    htmlFor={`${id}-categoria`}
                    required
                    dica={ajudaDaCategoria()}
                    acao={origem === "sugerida" ? <Selo tom="atencao">sugerida</Selo> : undefined}
                    helper={avisoDaCategoria()}
                  >
                    <Input id={`${id}-categoria`} maxLength={20} placeholder="1.01.02" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
                  </CampoForm>
                </FieldGrid>

                <p className="flex flex-wrap items-center gap-1 text-helper text-fg-muted">
                  <RefreshCw size={12} aria-hidden />
                  Listas do Omie lidas às {formatInstantDateTime(new Date(listas.lidasEm), { hour: "2-digit", minute: "2-digit" })} ·
                  <Button variant="link" onClick={() => carregar(true)} loading={carregando} loadingLabel="Lendo o Omie…">
                    Atualizar
                  </Button>
                </p>
              </div>

              {/* ── A nota e a confirmação ── */}
              <div className="flex min-w-0 flex-col gap-3 min-[1100px]:sticky min-[1100px]:top-0">
                <PreviaDaNota previa={previa} empresasNaConta={conferencia.empresasNaConta} />

                {recusa && <Aviso>{recusa}</Aviso>}

                <div className="flex flex-col gap-2.5 rounded-lg border border-warning/40 bg-warning/8 px-3.5 py-3">
                  <Checkbox
                    id={`${id}-entendi`}
                    checked={confirmado}
                    disabled={falta.length > 0 || emitindo}
                    aria-describedby={falta.length > 0 ? idDoQueFalta : undefined}
                    onChange={(e) => {
                      setErro(null);
                      setConfirmadoPara(e.target.checked ? assinatura : null);
                    }}
                    label={<span className="font-medium text-fg">Entendo que isto emite uma nota de verdade na prefeitura.</span>}
                    helper="Desfazer é cancelar a nota, dentro do prazo da prefeitura."
                  />
                  {falta.length > 0 && (
                    <p id={idDoQueFalta} className="text-helper text-fg-secondary">
                      {fraseDoQueFalta(falta)}
                    </p>
                  )}
                  {erro && (
                    <p className="text-helper font-medium text-danger" role="alert">
                      {erro}
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full justify-center"
                    onClick={emitir}
                    disabled={!confirmado || falta.length > 0}
                    loading={emitindo}
                    loadingLabel="Enviando ao Omie…"
                  >
                    Emitir nota
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
              <EmpresaDoRegistro className="mr-auto" />
              <Button type="button" variant="secondary" onClick={fechar} disabled={emitindo}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Um bloco da prévia: o rótulo em caixa alta, o dado e uma linha de apoio. */
function BlocoDaPrevia({
  rotulo,
  children,
  apoio,
  aviso,
}: {
  rotulo: string;
  children: React.ReactNode;
  apoio?: string | null;
  /** Condição rara que pede atenção — em âmbar, com ícone. */
  aviso?: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-2.5">
      <dt className="c41-rotulo">{rotulo}</dt>
      <dd className="min-w-0 text-label text-fg break-words">{children}</dd>
      {apoio && <dd className="text-helper text-fg-muted">{apoio}</dd>}
      {aviso && (
        <dd className="flex items-start gap-1.5 text-helper text-warning-fg">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden />
          <span>{aviso}</span>
        </dd>
      )}
    </div>
  );
}

function Falta({ children }: { children: React.ReactNode }) {
  return <span className="text-fg-muted">{children}</span>;
}

/** A nota como vai sair — o que o Omie recebe, montado do formulário a cada campo. */
function PreviaDaNota({ previa, empresasNaConta }: { previa: PreviaDaNfse; empresasNaConta: number }) {
  const idDoTitulo = useId();
  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-surface-2 px-3.5 py-2.5">
        <ReceiptText size={16} className="flex-shrink-0 text-brand" aria-hidden />
        <h3 id={idDoTitulo} className="text-card-title font-semibold text-fg">
          Prévia da nota
        </h3>
        <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-helper text-fg-muted">
          <CadeadoDoCampo motivo={MOTIVO_DA_COMPETENCIA} rotulo="Competência" />
          Competência {previa.competencia}
        </span>
      </div>
      <dl className="divide-y divide-border">
        <BlocoDaPrevia
          rotulo="Prestador"
          apoio={previa.prestador.documento ? `CNPJ ${previa.prestador.documento}` : null}
          aviso={empresasNaConta > 1 ? `A conta do Omie tem ${empresasNaConta} empresas: na primeira nota, confira o CNPJ do prestador.` : null}
        >
          {previa.prestador.nome}
        </BlocoDaPrevia>
        <BlocoDaPrevia rotulo="Tomador" apoio={previa.tomador?.documento ?? null}>
          {previa.tomador ? previa.tomador.nome : <Falta>Escolha o tomador</Falta>}
        </BlocoDaPrevia>
        <BlocoDaPrevia
          rotulo="Discriminação"
          apoio={previa.discriminacao ? (previa.discriminacao.origem === "cadastro" ? "Do cadastro do serviço no Omie" : "Escrita para esta nota") : null}
        >
          {previa.discriminacao ? (
            <span className="line-clamp-4 whitespace-pre-line" title={previa.discriminacao.texto}>
              {previa.discriminacao.texto}
            </span>
          ) : (
            <Falta>Escolha o serviço</Falta>
          )}
        </BlocoDaPrevia>
        <BlocoDaPrevia
          rotulo="Códigos e categoria"
          aviso={previa.semCodigo ? "Sem código municipal nem LC 116: a prefeitura pode recusar." : null}
        >
          {previa.codigos ? <span className="tabular-nums">{previa.codigos}</span> : <Falta>—</Falta>}
        </BlocoDaPrevia>
        <BlocoDaPrevia rotulo="Valor do serviço" apoio="Tributação e alíquotas do cadastro do serviço no Omie">
          {previa.valorCentavos !== null ? (
            <span className="font-display text-title font-semibold tabular-nums leading-tight">{formatarReaisDeCentavos(previa.valorCentavos)}</span>
          ) : (
            <Falta>Informe o valor</Falta>
          )}
        </BlocoDaPrevia>
      </dl>
    </section>
  );
}
