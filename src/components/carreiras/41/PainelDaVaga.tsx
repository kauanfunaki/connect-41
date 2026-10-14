import Link from "next/link";
import { ArrowRight, ArrowUpRight, Hourglass } from "lucide-react";
import { caminhoDoLogoDaVaga, type RotasDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { haQuantoTempo, localLegivel, seloDoPrazo } from "@/lib/carreiras/apresentacao";
import type { VagaDetalhada } from "@/lib/carreiras/vagasDoPortal";
import { LogoDaEmpresa } from "./LogoDaEmpresa";
import { FatosDaVaga, SecoesDaVaga } from "./SecoesDaVaga";

/**
 * A vaga escolhida, ao lado da lista (tela larga) — o mesmo conteúdo da
 * página dela, com "Candidatar-se" levando direto ao formulário de lá.
 */
export function PainelDaVaga({ vaga, slug, rotas, agora }: { vaga: VagaDetalhada; slug: string; rotas: RotasDoPortal; agora: Date }) {
  const local = localLegivel(vaga.cidade, vaga.uf);
  const prazo = seloDoPrazo(vaga.applicationDeadline, agora);
  return (
    <article className="t41-painel" aria-labelledby="painel-titulo">
      <div className="t41-painel__topo">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <LogoDaEmpresa src={vaga.temLogo ? caminhoDoLogoDaVaga(slug, vaga.id) : null} nome={vaga.empresa} grande />
          {prazo && (
            <span className="t41-etiqueta t41-etiqueta--prazo t41-num">
              <Hourglass size={13} aria-hidden="true" />
              {prazo.texto}
            </span>
          )}
        </div>
        <h2 id="painel-titulo" className="t41-painel__titulo">
          {vaga.title}
        </h2>
        <p className="t41-painel__meta">
          <strong>{vaga.empresa}</strong>
          {local && ` · ${local}`} · publicada {haQuantoTempo(vaga.openedAt, agora)}
        </p>
        <div className="t41-painel__acoes">
          <Link href={`${rotas.vaga(vaga.id)}#candidatura`} className="t41-botao t41-botao--primario">
            Candidatar-se <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <Link href={rotas.vaga(vaga.id)} className="t41-botao t41-botao--contorno">
            Página da vaga <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="t41-painel__corpo">
        <FatosDaVaga vaga={vaga} className="t41-fatos--plano" />
        <SecoesDaVaga vaga={vaga} titulo="h3" />
      </div>
    </article>
  );
}
