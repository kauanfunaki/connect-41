"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileSignature, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { Select } from "@/components/ui/Select";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { baixarAssinadorDoTermo, enviarTermoAssinado } from "@/app/(app)/admin/integracoes/serpro-actions";
import { BOM_DO_ASSINADOR, NOME_DO_ASSINADOR, NOME_DO_TERMO_ASSINADO, VIGENCIAS_DO_TERMO } from "@/lib/serpro/assinador";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export type TermoNaTela = {
  assinadoEm: string;
  vigencia: string;
  certificadoTitular: string | null;
  certificadoValidoAte: string;
  /** A vigência ou o vencimento do certificado de quem assinou, o que vier antes. */
  validoAte: string;
  aceitoEm: string | null;
  erro: string | null;
};

/**
 * O termo de autorização do modelo software house (27/10/2026): quem contratou
 * o Serpro pede em nome de quem recebe as autorizações. O Connect gera o termo
 * dentro de um assinador (script do PowerShell); o escritório roda na máquina
 * do e-CNPJ dele e devolve o termo assinado aqui. A chave privada não passa
 * pelo Connect.
 */
export function TermoDoSerpro({
  contratante,
  autor,
  termo,
  problema,
}: {
  contratante: { nome: string; cnpj: string };
  autor: { nome: string; cnpj: string };
  termo: TermoNaTela | null;
  /** Por que o termo guardado não serve (ou falta); null = serve. */
  problema: string | null;
}) {
  const [meses, setMeses] = useState<number>(12);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<{ tom: "sucesso" | "atencao" | "perigo"; texto: string } | null>(null);
  const [baixando, startBaixar] = useTransition();
  const [enviando, startEnviar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const situacao: { tom: TomDoSelo; texto: string } = !termo
    ? { tom: "atencao", texto: "Sem termo" }
    : problema
      ? { tom: "perigo", texto: "Não serve" }
      : termo.erro
        ? { tom: "perigo", texto: "Recusado pelo Serpro" }
        : termo.aceitoEm
          ? { tom: "sucesso", texto: "Aceito pelo Serpro" }
          : { tom: "neutro", texto: "Guardado, ainda não enviado" };

  const baixar = () =>
    startBaixar(async () => {
      setResultado(null);
      const r = await baixarAssinadorDoTermo(meses);
      if (!r.ok) {
        setResultado({ tom: "perigo", texto: r.erro });
        return;
      }
      // Com o BOM: o PowerShell 5.1 lê o .ps1 sem ele como ANSI e troca os acentos do termo.
      const url = URL.createObjectURL(new Blob([BOM_DO_ASSINADOR + r.conteudo], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.nome;
      a.click();
      URL.revokeObjectURL(url);
    });

  const enviar = () =>
    startEnviar(async () => {
      if (!arquivo) return;
      const form = new FormData();
      form.set("termo", arquivo);
      const r = await enviarTermoAssinado(form);
      setResultado(r.ok ? { tom: r.tom, texto: r.texto } : { tom: "perigo", texto: r.erro });
      if (r.ok) {
        setArquivo(null);
        if (entrada.current) entrada.current.value = "";
      }
    });

  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="min-w-0">
        <h3 className="text-fs-4 font-medium text-fg flex flex-wrap items-center gap-1.5">
          <FileSignature size={16} className="text-brand" /> Termo de autorização
          <Selo tom={situacao.tom}>{situacao.texto}</Selo>
        </h3>
        <p className="text-ui text-fg-secondary mt-1">
          {autor.nome} <span className="tabular-nums">({autor.cnpj})</span> autoriza {contratante.nome}{" "}
          <span className="tabular-nums">({contratante.cnpj})</span>, que contratou o Serpro, a pedir em nome dele.
        </p>
        {termo && (
          <p className="text-ui text-fg-secondary mt-1 tabular-nums">
            Assinado em {dataBr(termo.assinadoEm)}
            {termo.certificadoTitular && <> com o certificado de {termo.certificadoTitular}</>} · vale até {dataBr(termo.validoAte)}
            {termo.validoAte !== termo.vigencia && <> (o certificado de quem assinou vence antes da vigência, {dataBr(termo.vigencia)})</>}
            {termo.aceitoEm && <> · último aceite em {dataBr(termo.aceitoEm)}</>}
          </p>
        )}
      </div>
      {problema && termo && <Aviso tom="perigo">{problema}</Aviso>}
      {!problema && termo?.erro && <Aviso tom="perigo">{termo.erro}</Aviso>}
      {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}

      <BlocoRecolhivel titulo={termo ? "Gerar e enviar um termo novo" : "Gerar e enviar o termo"} resumo="3 passos" espacoDaAcao="pr-4">
        <ol className="flex flex-col gap-4 text-ui text-fg-secondary list-decimal pl-5">
          <li>
            <p>Baixe o assinador, com o termo dentro.</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <label htmlFor="termo-vigencia" className="text-ui text-fg-muted">
                Vigência
              </label>
              <Select id="termo-vigencia" value={String(meses)} onChange={(e) => setMeses(Number(e.target.value))} className="w-36">
                {VIGENCIAS_DO_TERMO.map((m) => (
                  <option key={m} value={m}>
                    {m} meses
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" loading={baixando} onClick={baixar}>
                <Download size={14} /> Baixar o assinador
              </Button>
            </div>
          </li>
          <li>
            <p>
              Na máquina onde está o e-CNPJ de {autor.nome}, abra o PowerShell na pasta do arquivo e rode o comando abaixo. Ele assina com o certificado instalado (o
              token A3 pede o PIN) e grava <code className="text-micro">{NOME_DO_TERMO_ASSINADO}</code> na mesma pasta. O certificado não sai da máquina.
            </p>
            <code className="block mt-2 text-micro break-all">powershell.exe -ExecutionPolicy Bypass -File .\{NOME_DO_ASSINADOR}</code>
            <p className="mt-1 text-micro text-fg-muted">
              O “Executar com o PowerShell” do botão direito costuma fechar sem fazer nada: o Windows barra script baixado da internet. O comando libera só esta
              execução.
            </p>
          </li>
          <li>
            <p>Envie o termo assinado. O Connect confere a assinatura e, com a conexão pronta, já o leva ao Serpro (não é cobrado).</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <input
                ref={entrada}
                type="file"
                accept=".xml,text/xml,application/xml"
                className="sr-only"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              />
              <Button type="button" size="sm" variant="secondary" onClick={() => entrada.current?.click()}>
                <Upload size={14} /> {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
              </Button>
              <span className="text-ui text-fg-muted truncate min-w-0">{arquivo?.name ?? "Nenhum arquivo"}</span>
              <Button size="sm" loading={enviando} disabled={!arquivo} onClick={enviar}>
                Enviar o termo
              </Button>
            </div>
          </li>
        </ol>
      </BlocoRecolhivel>
    </Card>
  );
}
