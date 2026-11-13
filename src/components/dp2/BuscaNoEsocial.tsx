"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { TD, TH, TR } from "@/components/dp2/Secao";
import { formatCpf } from "@/lib/format";
import { baixarEventos, certificadoDaEmpresa, consultarTrabalhador, statusDoAssinador, type CertificadoNoWindows } from "@/lib/dp2/esocial/assinador";
import { LIMITE_DE_ACESSOS_POR_DIA, janelaDaConsulta, pacotesParaBaixar, type ItemDaBusca, type SituacaoDaBusca } from "@/lib/dp2/esocial/buscaPorCpf";
import {
  abrirBuscaEsocialAction,
  corrigirItemDaBuscaAction,
  criarBuscaEsocialAction,
  registrarResultadoEsocialAction,
  reservarAcessoEsocialAction,
  type BuscaNaTela,
  type EstadoDaBusca,
} from "@/app/(app)/dp2/actions";

const NOME: Record<SituacaoDaBusca, string> = { PENDENTE: "Na fila", ENCONTRADO: "Achado, falta baixar", NAO_ENCONTRADO: "Não achado", BAIXADO: "Baixado", ERRO: "Com erro" };
const TOM: Record<SituacaoDaBusca, "neutro" | "marca" | "atencao" | "sucesso" | "perigo"> = { PENDENTE: "neutro", ENCONTRADO: "marca", NAO_ENCONTRADO: "atencao", BAIXADO: "sucesso", ERRO: "perigo" };
const dataBr = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

/**
 * Buscar os colaboradores no eSocial por CPF e admissão, como a Domínio faz
 * (13/11/2026, funcionalidade-671). O Assinador do Connect, neste computador,
 * consulta e baixa com o certificado ligado no CertDigital; o servidor conta os
 * acessos do dia (o eSocial deixa 10 por empresa) e guarda o andamento, para a
 * busca continuar no dia seguinte. O que vier vai para a prévia da importação.
 */
export function BuscaNoEsocial({ companyId, cnpj, onArquivos, ocupado }: { companyId: string; cnpj: string | null; onArquivos: (arquivos: File[]) => void; ocupado: boolean }) {
  const [certs, setCerts] = useState<CertificadoNoWindows[] | null>(null);
  const [semAssinador, setSemAssinador] = useState<string | null>(null);
  const [thumbprint, setThumbprint] = useState("");
  const [busca, setBusca] = useState<BuscaNaTela | null>(null);
  const [lista, setLista] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [andamento, setAndamento] = useState<string | null>(null);
  const [correcao, setCorrecao] = useState<Record<string, string>>({});

  const aplicar = (r: EstadoDaBusca) => {
    if (!r.ok) {
      setAviso(r.texto);
      return null;
    }
    setBusca(r.busca);
    if (r.erros.length) setAviso(r.erros.join(" "));
    return r.busca;
  };

  const lerDados = useCallback(() => Promise.all([statusDoAssinador(), abrirBuscaEsocialAction(companyId)]), [companyId]);

  const aplicarDados = useCallback(
    ([s, b]: Awaited<ReturnType<typeof lerDados>>) => {
      if (b.ok) setBusca(b.busca);
      if (!s.ok) {
        setSemAssinador(s.erro);
        setCerts(null);
        return;
      }
      setSemAssinador(null);
      const ligados = s.certificados.filter((c) => c.chaveAcessivel);
      setCerts(ligados);
      setThumbprint((t) => t || certificadoDaEmpresa(ligados, cnpj)?.thumbprint || ligados[0]?.thumbprint || "");
    },
    [cnpj]
  );

  const carregar = async () => aplicarDados(await lerDados());

  useEffect(() => {
    let vivo = true;
    void lerDados().then((d) => {
      if (vivo) aplicarDados(d);
    });
    return () => {
      vivo = false;
    };
  }, [lerDados, aplicarDados]);

  const preparar = async () => {
    setAviso(null);
    const b = aplicar(await criarBuscaEsocialAction(companyId, lista));
    if (b) setLista("");
  };

  const corrigir = async (cpf: string) => {
    if (!busca) return;
    aplicar(await corrigirItemDaBuscaAction(companyId, busca.id, cpf, correcao[cpf] ?? ""));
  };

  const buscar = async () => {
    if (!busca || !cnpj || !thumbprint) return;
    setAviso(null);
    let atual: BuscaNaTela = busca;
    const arquivos: File[] = [];
    try {
      for (;;) {
        const livres = LIMITE_DE_ACESSOS_POR_DIA - atual.usadosHoje;
        const pendente = atual.itens.find((i) => i.situacao === "PENDENTE");
        const pacote = pacotesParaBaixar(atual.itens)[0];
        // Guarda um acesso para baixar o que for achado.
        const consultar = pendente && (livres > 1 || (!pacote && livres > 0));
        if (!consultar && !(pacote && livres > 0)) break;

        const reserva = await reservarAcessoEsocialAction(companyId, atual.id);
        if (!reserva.ok) {
          setAviso(reserva.texto);
          break;
        }

        if (consultar && pendente) {
          const j = janelaDaConsulta(pendente.admissao);
          setAndamento(`Consultando ${formatCpf(pendente.cpf)} (eventos recebidos de ${dataBr(j.dtIni)} a ${dataBr(j.dtFim)})…`);
          const r = await consultarTrabalhador({ cnpj, cpf: pendente.cpf, dtIni: j.dtIni, dtFim: j.dtFim, thumbprint });
          let resultado: { cpf: string; situacao: SituacaoDaBusca; ids?: string[]; mensagem?: string | null };
          if (!r.ok) resultado = { cpf: pendente.cpf, situacao: "ERRO", mensagem: r.erro };
          else if (r.cdResposta === 200 && r.identificadores.length > 0) resultado = { cpf: pendente.cpf, situacao: "ENCONTRADO", ids: r.identificadores.map((x) => x.id), mensagem: null };
          else if (r.cdResposta === 200 || r.cdResposta === 201)
            resultado = {
              cpf: pendente.cpf,
              situacao: "NAO_ENCONTRADO",
              mensagem: `Nenhum evento recebido de ${dataBr(j.dtIni)} a ${dataBr(j.dtFim)}. Se a pessoa entrou antes de a empresa usar o eSocial, tente com a data em que a empresa começou a enviar.`,
            };
          else resultado = { cpf: pendente.cpf, situacao: "ERRO", mensagem: `eSocial: ${r.descResposta || r.cdResposta}` };
          const reg = await registrarResultadoEsocialAction(companyId, atual.id, [resultado]);
          if (!reg.ok || !reg.busca) break;
          atual = reg.busca;
          setBusca(atual);
          if (!r.ok) {
            setAviso(r.erro);
            break;
          }
        } else if (pacote) {
          setAndamento(`Baixando ${pacote.ids.length} evento(s) de ${pacote.cpfs.length} pessoa(s)…`);
          const r = await baixarEventos({ cnpj, ids: pacote.ids, thumbprint });
          const ok = r.ok && r.cdResposta === 200;
          if (r.ok && ok) arquivos.push(new File([r.xml], `esocial-download-${arquivos.length + 1}.xml`, { type: "application/xml" }));
          const reg = await registrarResultadoEsocialAction(
            companyId,
            atual.id,
            pacote.cpfs.map((cpf) => ({ cpf, situacao: ok ? "BAIXADO" : "ENCONTRADO", mensagem: ok ? null : r.ok ? `eSocial: ${r.descResposta || r.cdResposta}` : r.erro }))
          );
          if (!reg.ok || !reg.busca) break;
          atual = reg.busca;
          setBusca(atual);
          if (!ok) {
            setAviso(r.ok ? `O download não deu certo: ${r.descResposta || r.cdResposta}.` : r.erro);
            break;
          }
        }
      }
    } finally {
      setAndamento(null);
    }
    const faltam = atual.itens.filter((i) => i.situacao === "PENDENTE" || i.situacao === "ENCONTRADO").length;
    if (faltam > 0 && LIMITE_DE_ACESSOS_POR_DIA - atual.usadosHoje <= 0) {
      setAviso(`Faltam ${faltam} pessoa(s). O eSocial libera mais ${LIMITE_DE_ACESSOS_POR_DIA} acessos amanhã (menos do dia 1 ao 7); abra esta tela de novo para continuar de onde parou.`);
    }
    if (arquivos.length) onArquivos(arquivos);
  };

  const livres = busca ? Math.max(0, LIMITE_DE_ACESSOS_POR_DIA - busca.usadosHoje) : LIMITE_DE_ACESSOS_POR_DIA;
  const temO_que_fazer = Boolean(busca?.itens.some((i) => i.situacao === "PENDENTE" || i.situacao === "ENCONTRADO"));

  return (
    <section className="rounded-lg border border-border p-4 flex flex-col gap-3">
      <h3 className="text-fs-4 font-semibold text-fg flex items-center gap-2">
        <CloudDownload size={18} aria-hidden="true" />
        Buscar no eSocial por CPF e admissão
      </h3>
      <p className="text-fs-2 text-fg-muted">
        Como na Domínio: informe o CPF e a admissão de cada um, e o Connect busca no eSocial com o certificado ligado no CertDigital deste computador. O eSocial deixa {LIMITE_DE_ACESSOS_POR_DIA}{" "}
        acessos por dia por empresa (cerca de 9 pessoas) e nenhum do dia 1 ao 7; o que faltar continua no dia seguinte.
      </p>

      {semAssinador ? (
        <Aviso tom="atencao">
          {semAssinador}{" "}
          <button type="button" className="underline" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </Aviso>
      ) : certs === null ? (
        <p className="text-fs-2 text-fg-muted" role="status">
          Procurando o Assinador do Connect…
        </p>
      ) : certs.length === 0 ? (
        <Aviso tom="atencao">
          Nenhum certificado ligado. Ligue no CertDigital o certificado da empresa (ou o do escritório, com procuração) e{" "}
          <button type="button" className="underline" onClick={() => void carregar()}>
            procure de novo
          </button>
          .
        </Aviso>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="certificadoDaBusca" className="text-fs-2 font-medium text-fg">
            Certificado
          </label>
          <Select id="certificadoDaBusca" value={thumbprint} onChange={(e) => setThumbprint(e.target.value)}>
            {certs.map((c) => (
              <option key={c.thumbprint} value={c.thumbprint}>
                {c.nome}
                {c.documento ? ` · ${c.documento}` : ""}
                {certificadoDaEmpresa([c], cnpj) ? " (da empresa)" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="listaDeCpfs" className="text-fs-2 font-medium text-fg">
          CPF e admissão, um por linha
        </label>
        <Textarea id="listaDeCpfs" rows={3} value={lista} onChange={(e) => setLista(e.target.value)} placeholder={"529.982.247-25;03/02/2025\n153.509.460-56;10/06/2019"} className="font-mono text-fs-2" />
        <div>
          <Button variant="secondary" size="sm" onClick={preparar} disabled={!lista.trim() || ocupado || Boolean(andamento)}>
            {busca ? "Juntar à lista" : "Montar a lista"}
          </Button>
        </div>
      </div>

      {busca && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-fs-2">
            <span>
              {busca.itens.length} pessoa(s) · {busca.itens.filter((i) => i.situacao === "BAIXADO").length} baixada(s)
            </span>
            <span className="text-fg-muted">
              Acessos ao eSocial hoje: {busca.usadosHoje} de {LIMITE_DE_ACESSOS_POR_DIA}
            </span>
          </div>
          <div className="overflow-x-auto max-h-56 overflow-y-auto border border-border rounded-md">
            <table className="w-full min-w-[560px] text-fs-2">
              <thead className="sticky top-0 bg-surface-elevated">
                <tr>
                  <th className={`${TH} pl-3`}>CPF</th>
                  <th className={TH}>Admissão</th>
                  <th className={TH}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {busca.itens.map((i: ItemDaBusca) => (
                  <tr key={i.cpf} className={TR}>
                    <td className={`${TD} pl-3 tabular-nums`}>{formatCpf(i.cpf)}</td>
                    <td className={`${TD} tabular-nums`}>{dataBr(i.admissao)}</td>
                    <td className={TD}>
                      <Selo tom={TOM[i.situacao]}>{NOME[i.situacao]}</Selo>
                      {i.mensagem && <span className="block text-fg-muted mt-1">{i.mensagem}</span>}
                      {(i.situacao === "NAO_ENCONTRADO" || i.situacao === "ERRO") && (
                        <span className="flex items-center gap-2 mt-1">
                          <Input
                            aria-label={`Outra data para ${formatCpf(i.cpf)}`}
                            placeholder="dd/mm/aaaa"
                            compact
                            className="w-32"
                            value={correcao[i.cpf] ?? ""}
                            onChange={(e) => setCorrecao({ ...correcao, [i.cpf]: e.target.value })}
                          />
                          <Button variant="ghost" size="xs" onClick={() => void corrigir(i.cpf)} disabled={!correcao[i.cpf]}>
                            Tentar com esta data
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={buscar} loading={Boolean(andamento)} loadingLabel="Buscando…" disabled={!temO_que_fazer || !thumbprint || !cnpj || busca.bloqueadaHoje || livres === 0 || ocupado}>
              Buscar no eSocial
            </Button>
            {busca.bloqueadaHoje && <span className="text-fs-2 text-fg-muted">Do dia 1 ao 7 o eSocial não aceita consultas.</span>}
            {!busca.bloqueadaHoje && livres === 0 && <span className="text-fs-2 text-fg-muted">Os acessos de hoje acabaram; continue amanhã.</span>}
          </div>
        </>
      )}
      {andamento && (
        <p className="text-fs-2 text-fg-muted" role="status">
          {andamento}
        </p>
      )}
      {!cnpj && <Aviso tom="atencao">A empresa está sem CNPJ no cadastro.</Aviso>}
      {aviso && <Aviso tom="atencao">{aviso}</Aviso>}
    </section>
  );
}
