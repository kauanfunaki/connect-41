"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, Clock, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ItemDoMenu, Popover } from "@/components/ui/Popover";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { SlideOver } from "@/components/ui/SlideOver";
import { useToast } from "@/components/ui/Toast";
import { Cartao, CartoesNoCelular, InfoDoCartao, PeDoCartao, TabelaNoDesktop } from "@/components/shared/ListaResponsiva";
import { MarcarCertidaoComoVista } from "@/components/societario/BotoesDaCertidao";
import { emitirCertidaoAction } from "@/app/(app)/certidoes/actions";
import { PRECO_EM_CENTAVOS, ROTULO_DA_CERTIDAO, ROTULO_DA_SITUACAO, TIPOS_DE_CERTIDAO, type SituacaoDaCertidao, type TipoDeCertidao } from "@/lib/certidoes/regras";
import { estadoDaCertidao, NOME_CURTO, proximoVencimento, rotuloDeEmitirTodas, type EstadoDaCertidao } from "@/lib/certidoes/lista-regras";
import type { LinhaDaLista } from "@/lib/certidoes/lista";
import type { CertidaoNaTela } from "@/lib/certidoes/servidor";
import { dataBR, hojeIso } from "@/lib/datas/calendario";
import { moeda } from "@/lib/financeiro/formato";

type Props = {
  linhas: LinhaDaLista[];
  /** Pode pedir certidão e marcar como vista: age no setor e a InfoSimples está pronta. */
  podeEmitir: boolean;
  /** Pode marcar como vista: age no setor. */
  podeEditar: boolean;
  hoje: string;
};

/**
 * A lista de /certidoes (opção A escolhida pelo Kauan em 05/11/2026): uma
 * linha por empresa, as certidões que ela precisa em selos com o nome escrito,
 * o próximo vencimento e um só "Emitir ▾". Clicar no nome abre o painel com
 * cada certidão — antes eram cinco colunas com "Emitir agora" em cada célula, e
 * achar a federal de uma empresa do fim da lista era rolar e adivinhar a coluna.
 */
export function ListaDasCertidoes({ linhas, podeEmitir, podeEditar, hoje }: Props) {
  const [aberta, setAberta] = useState<string | null>(null);
  const emissao = useEmissao();
  // O painel lê a linha da página a cada render: depois de emitir, o refresh
  // traz a certidão nova e o painel aberto mostra sem fechar.
  const daPainel = aberta ? linhas.find((l) => l.companyId === aberta) ?? null : null;

  // No cartão do celular, o botão no tamanho do "Ver certidões" ao lado (32px).
  const menuDeEmitir = (l: LinhaDaLista, tamanho: "xs" | "sm" = "xs") =>
    podeEmitir ? <MenuDeEmitir linha={l} tamanho={tamanho} emitindo={emissao.emitindo[l.companyId]} onEmitir={(tipos) => emissao.pedir(l, tipos)} /> : null;

  return (
    <>
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[860px]">
          <thead>
            <tr>
              <th scope="col" className="py-2 px-3">Empresa</th>
              <th scope="col" className="py-2 px-3">Certidões</th>
              <th scope="col" className="py-2 px-3">Próximo vencimento</th>
              {podeEmitir && (
                <th scope="col" className="py-2 px-3">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.companyId} className="border-b border-border-soft">
                <td className="py-2 px-3">
                  <BotaoDaEmpresa linha={l} onAbrir={() => setAberta(l.companyId)} />
                </td>
                <td className="py-2 px-3">
                  <SelosDaEmpresa linha={l} hoje={hoje} />
                </td>
                <td className="py-2 px-3 whitespace-nowrap">
                  <Vencimento linha={l} hoje={hoje} />
                </td>
                {podeEmitir && <td className="py-2 px-3">{menuDeEmitir(l)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>

      <CartoesNoCelular>
        {linhas.map((l) => (
          <Cartao key={l.companyId}>
            <BotaoDaEmpresa linha={l} onAbrir={() => setAberta(l.companyId)} />
            <div className="mt-2">
              <SelosDaEmpresa linha={l} hoje={hoje} alinhamento="start" />
            </div>
            <InfoDoCartao className="mt-2">
              Próximo vencimento: <Vencimento linha={l} hoje={hoje} />
            </InfoDoCartao>
            <PeDoCartao>
              <Button variant="secondary" size="sm" onClick={() => setAberta(l.companyId)} aria-haspopup="dialog">
                <FileText size={14} aria-hidden /> Ver certidões
              </Button>
              {menuDeEmitir(l, "sm")}
            </PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      <SlideOver open={!!daPainel} onClose={() => setAberta(null)} title={daPainel?.empresa} width="max-w-lg">
        {daPainel && (
          <PainelDaEmpresa
            linha={daPainel}
            hoje={hoje}
            podeEmitir={podeEmitir}
            podeEditar={podeEditar}
            emitindo={emissao.emitindo[daPainel.companyId]}
            onEmitir={(tipos) => emissao.pedir(daPainel, tipos)}
          />
        )}
      </SlideOver>

      {emissao.dialogo}
    </>
  );
}

// ─── A linha ─────────────────────────────────────────────────────────────────

function BotaoDaEmpresa({ linha, onAbrir }: { linha: LinhaDaLista; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      className="group inline-flex flex-col items-start md:items-center text-left md:text-center rounded-md px-1 -mx-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <span className="font-medium text-fg group-hover:text-brand group-hover:underline underline-offset-2">{linha.empresa}</span>
      <span className="text-micro text-fg-muted tabular-nums">{linha.cnpj}</span>
    </button>
  );
}

const TOM_DO_ESTADO: Record<EstadoDaCertidao["tipo"], TomDoSelo> = {
  regular: "sucesso",
  vencendo: "atencao",
  vencida: "perigo",
  positiva: "perigo",
  sem: "atencao",
};

const ICONE_DO_ESTADO: Record<EstadoDaCertidao["tipo"], typeof CheckCircle2> = {
  regular: CheckCircle2,
  vencendo: Clock,
  vencida: AlertTriangle,
  positiva: AlertTriangle,
  sem: CircleDashed,
};

/** O que o selo escreve depois do nome: nada quando está tudo certo; a palavra do problema quando não. */
function textoDoEstado(e: EstadoDaCertidao): string | null {
  switch (e.tipo) {
    case "regular":
      return null;
    case "vencendo":
      return `vence ${dataBR(e.validaAte).slice(0, 5)}`;
    case "vencida":
      return "vencida";
    case "positiva":
      return e.aVer ? "positiva" : "positiva, vista";
    case "sem":
      return "sem certidão";
  }
}

/** A frase inteira, para o leitor de tela e a dica. */
function descricaoDoEstado(tipo: TipoDeCertidao, e: EstadoDaCertidao): string {
  const nome = ROTULO_DA_CERTIDAO[tipo];
  switch (e.tipo) {
    case "regular":
      return `${nome}: regular${e.validaAte ? `, válida até ${dataBR(e.validaAte)}` : ""}`;
    case "vencendo":
      return `${nome}: regular, vence em ${dataBR(e.validaAte)}`;
    case "vencida":
      return `${nome}: vencida em ${dataBR(e.validaAte)}`;
    case "positiva":
      return `${nome}: positiva${e.aVer ? ", ainda não vista pelo setor" : ", já vista pelo setor"}`;
    case "sem":
      return `${nome}: sem certidão`;
  }
}

function SelosDaEmpresa({ linha, hoje, alinhamento = "center" }: { linha: LinhaDaLista; hoje: string; alinhamento?: "center" | "start" }) {
  const tipos = TIPOS_DE_CERTIDAO.filter((t) => t in linha.certidoes);
  return (
    <ul className={`flex flex-wrap gap-1 ${alinhamento === "center" ? "justify-center" : "justify-start"}`} aria-label={`Certidões de ${linha.empresa}`}>
      {tipos.map((t) => {
        const e = estadoDaCertidao(linha.certidoes[t] ?? null, hoje);
        const Icone = ICONE_DO_ESTADO[e.tipo];
        const texto = textoDoEstado(e);
        const descricao = descricaoDoEstado(t, e);
        return (
          <li key={t} data-dica={descricao}>
            <Selo tom={TOM_DO_ESTADO[e.tipo]} className="gap-1">
              <Icone size={11} aria-hidden className="shrink-0" />
              <span aria-hidden>
                {NOME_CURTO[t]}
                {texto && <> · {texto}</>}
              </span>
              <span className="sr-only">{descricao}</span>
            </Selo>
          </li>
        );
      })}
    </ul>
  );
}

function Vencimento({ linha, hoje }: { linha: LinhaDaLista; hoje: string }) {
  const p = proximoVencimento(linha.certidoes, hoje);
  if (!p) return <span className="text-fg-muted">—</span>;
  if (p.tipo === "sem") return <span className="text-warning-fg font-medium">{NOME_CURTO[p.certidao]} · sem certidão</span>;
  const cor = p.vencida ? "text-danger font-medium" : p.vencendo ? "text-warning-fg font-medium" : "text-fg-secondary";
  return (
    <span className={`tabular-nums ${cor}`}>
      {NOME_CURTO[p.certidao]} · {p.vencida ? `vencida em ${dataBR(p.validaAte)}` : dataBR(p.validaAte)}
    </span>
  );
}

function MenuDeEmitir({
  linha,
  tamanho,
  emitindo,
  onEmitir,
}: {
  linha: LinhaDaLista;
  tamanho: "xs" | "sm";
  emitindo?: Andamento;
  onEmitir: (tipos: TipoDeCertidao[]) => void;
}) {
  const tipos = TIPOS_DE_CERTIDAO.filter((t) => t in linha.certidoes);
  if (emitindo) {
    return (
      <Button variant="secondary" size={tamanho} loading loadingLabel={rotuloDoAndamento(emitindo)}>
        Emitir
      </Button>
    );
  }
  return (
    <Popover
      align="right"
      width={220}
      aria-label={`Emitir certidão de ${linha.empresa}`}
      trigger={({ open, toggle }) => (
        <Button variant="secondary" size={tamanho} onClick={toggle} aria-expanded={open} aria-label={`Emitir certidão de ${linha.empresa}`}>
          Emitir <ChevronDown size={12} aria-hidden />
        </Button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col">
          {tipos.map((t) => (
            <ItemDoMenu
              key={t}
              icone={<RefreshCw />}
              onClick={() => {
                close();
                onEmitir([t]);
              }}
            >
              {ROTULO_DA_CERTIDAO[t]}
            </ItemDoMenu>
          ))}
          {tipos.length > 1 && (
            <>
              <div className="my-1 border-t border-border" role="separator" />
              <ItemDoMenu
                icone={<RefreshCw />}
                onClick={() => {
                  close();
                  onEmitir(tipos);
                }}
              >
                Emitir todas ({tipos.length})
              </ItemDoMenu>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

// ─── O painel ────────────────────────────────────────────────────────────────

const TOM_DA_SITUACAO: Record<SituacaoDaCertidao, TomDoSelo> = { NEGATIVA: "sucesso", POSITIVA_COM_EFEITO: "marca", POSITIVA: "perigo", NAO_SAIU: "atencao" };

function PainelDaEmpresa({
  linha,
  hoje,
  podeEmitir,
  podeEditar,
  emitindo,
  onEmitir,
}: {
  linha: LinhaDaLista;
  hoje: string;
  podeEmitir: boolean;
  podeEditar: boolean;
  emitindo?: Andamento;
  onEmitir: (tipos: TipoDeCertidao[]) => void;
}) {
  const tipos = TIPOS_DE_CERTIDAO.filter((t) => t in linha.certidoes);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ui text-fg-secondary tabular-nums">
          {linha.cnpj}
          {linha.local && ` · ${linha.local}`}
        </p>
        <Button href={`/empresas/${linha.companyId}`} variant="ghost" size="xs">
          Abrir a empresa
        </Button>
      </div>

      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {tipos.map((t) => (
          <LinhaDoPainel
            key={t}
            tipo={t}
            certidao={linha.certidoes[t] ?? null}
            hoje={hoje}
            empresa={linha.empresa}
            podeEmitir={podeEmitir}
            ocupado={!!emitindo}
            podeEditar={podeEditar}
            onEmitir={() => onEmitir([t])}
          />
        ))}
      </ul>

      {emitindo && (
        <p className="text-ui text-fg-secondary" role="status">
          {rotuloDoAndamento(emitindo)} Cada consulta pode levar alguns minutos.
        </p>
      )}

      {podeEmitir && tipos.length > 1 && (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" loading={!!emitindo} loadingLabel="Emitindo…" onClick={() => onEmitir(tipos)}>
            <RefreshCw size={14} aria-hidden /> {rotuloDeEmitirTodas(tipos.length)}
          </Button>
        </div>
      )}
    </div>
  );
}

function LinhaDoPainel({
  tipo,
  certidao,
  hoje,
  empresa,
  podeEmitir,
  ocupado,
  podeEditar,
  onEmitir,
}: {
  tipo: TipoDeCertidao;
  certidao: CertidaoNaTela | null;
  hoje: string;
  empresa: string;
  podeEmitir: boolean;
  /** Já há uma emissão desta empresa andando: o botão fica, desligado, para a linha não pular. */
  ocupado: boolean;
  podeEditar: boolean;
  onEmitir: () => void;
}) {
  const e = estadoDaCertidao(certidao, hoje);
  const nome = ROTULO_DA_CERTIDAO[tipo];
  return (
    <li className="py-3 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-fg">{nome}</span>
        {certidao ? (
          <Selo tom={TOM_DA_SITUACAO[certidao.situacao]}>{ROTULO_DA_SITUACAO[certidao.situacao]}</Selo>
        ) : (
          <Selo tom="neutro">Ainda não consultada</Selo>
        )}
        {e.tipo === "vencida" && <Selo tom="perigo">Vencida</Selo>}
        {e.tipo === "vencendo" && <Selo tom="atencao">Vence em breve</Selo>}
        {e.tipo === "positiva" && !e.aVer && <Selo tom="neutro">Vista</Selo>}
      </div>
      <p className="text-ui text-fg-secondary tabular-nums">{detalheDaCertidao(certidao, e)}</p>
      {(certidao?.arquivoId || podeEmitir || (podeEditar && e.tipo === "positiva" && e.aVer)) && (
        <div className="flex flex-wrap items-center gap-2">
          {certidao?.arquivoId && (
            <Button href={`/api/arquivos/${certidao.arquivoId}?ver=1`} nativo target="_blank" rel="noreferrer" variant="secondary" size="xs" aria-label={`Abrir o PDF da certidão ${nome}`}>
              <FileText size={12} aria-hidden /> PDF
            </Button>
          )}
          {podeEmitir && (
            <Button variant="secondary" size="xs" onClick={onEmitir} disabled={ocupado} aria-label={`Emitir a certidão ${nome} de ${empresa}`}>
              <RefreshCw size={12} aria-hidden /> Emitir
            </Button>
          )}
          {podeEditar && certidao && e.tipo === "positiva" && e.aVer && <MarcarCertidaoComoVista certidaoId={certidao.id} />}
        </div>
      )}
    </li>
  );
}

function detalheDaCertidao(c: CertidaoNaTela | null, e: EstadoDaCertidao): string {
  if (!c) return "A rotina do trimestre ainda não chegou nela.";
  const consultada = `Consultada em ${dataBR(hojeIso(c.consultadaEm))}`;
  if (c.situacao === "NAO_SAIU") return [c.mensagem ?? "O órgão não emitiu.", consultada].join(" · ");
  const partes = [
    e.tipo === "vencida" ? `Venceu em ${dataBR(c.validaAte)}` : c.validaAte ? `Válida até ${dataBR(c.validaAte)}` : null,
    c.emitidaEm ? `emitida em ${dataBR(c.emitidaEm)}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : consultada;
}

// ─── A emissão ───────────────────────────────────────────────────────────────

type Andamento = { feitas: number; total: number };

function rotuloDoAndamento(a: Andamento): string {
  return a.total === 1 ? "Emitindo…" : `Emitindo ${a.feitas + 1} de ${a.total}…`;
}

/**
 * Pedir certidão é uma consulta cobrada que pode levar minutos: confirma com a
 * empresa, as certidões e o preço, e depois consulta uma por vez (a InfoSimples
 * emite no site do órgão). A que não sai não segura as outras.
 */
function useEmissao() {
  const router = useRouter();
  const toast = useToast();
  const [emitindo, setEmitindo] = useState<Record<string, Andamento>>({});
  const [pedido, setPedido] = useState<{ linha: LinhaDaLista; tipos: TipoDeCertidao[] } | null>(null);

  async function emitir(linha: LinhaDaLista, tipos: TipoDeCertidao[]) {
    const id = linha.companyId;
    let sairam = 0;
    for (const [i, tipo] of tipos.entries()) {
      setEmitindo((e) => ({ ...e, [id]: { feitas: i, total: tipos.length } }));
      const r = await emitirCertidaoAction(id, tipo);
      if (r.ok) {
        sairam++;
        if (tipos.length === 1) toast.success(r.texto);
      } else toast.error(r.erro);
      router.refresh();
    }
    if (tipos.length > 1 && sairam > 0) toast.success(`${linha.empresa}: ${sairam} de ${tipos.length} certidões saíram.`);
    setEmitindo((e) => {
      const resto = { ...e };
      delete resto[id];
      return resto;
    });
  }

  const preco = pedido ? pedido.tipos.reduce((s, t) => s + PRECO_EM_CENTAVOS[t], 0) : 0;
  const nomes = pedido ? pedido.tipos.map((t) => ROTULO_DA_CERTIDAO[t]) : [];
  const dialogo = (
    <ConfirmDialog
      open={!!pedido}
      title={pedido?.tipos.length === 1 ? `Emitir a certidão ${nomes[0]}?` : `Emitir ${pedido?.tipos.length ?? 0} certidões?`}
      description={
        pedido
          ? `${pedido.linha.empresa}${pedido.tipos.length > 1 ? ` — ${nomes.join(", ")}` : ""}. ${
              pedido.tipos.length === 1 ? "É uma consulta cobrada" : "São consultas cobradas, uma por vez,"
            } pela InfoSimples (${moeda(preco)}) e pode levar alguns minutos; o resultado aparece nesta tela.`
          : undefined
      }
      confirmLabel="Emitir"
      onConfirm={() => {
        const p = pedido;
        setPedido(null);
        if (p) void emitir(p.linha, p.tipos);
      }}
      onCancel={() => setPedido(null)}
    />
  );

  return { emitindo, dialogo, pedir: (linha: LinhaDaLista, tipos: TipoDeCertidao[]) => setPedido({ linha, tipos }) };
}
