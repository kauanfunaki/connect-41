import { describe, expect, it } from "vitest";
import { VIDEOS_DO_CONNECT, VIDEOS_DO_PORTAL } from "./videos";
import { idDoVideo } from "./youtube";
import { artigoDaChave } from "./artigos";
import { CHAVES_DOS_PASSOS } from "@/lib/portal/ajuda";

// O arquivo dos links é editado à mão (05/10/2026): estes testes pegam a chave
// digitada errado e o link colado pela metade antes de ir para o ar.
describe("o arquivo dos vídeos", () => {
  it("toda chave do Connect é de um artigo que existe", () => {
    for (const chave of Object.keys(VIDEOS_DO_CONNECT)) expect(artigoDaChave(chave), chave).not.toBeNull();
  });

  it("toda chave do portal é de um passo da ajuda do portal", () => {
    for (const chave of Object.keys(VIDEOS_DO_PORTAL)) expect(CHAVES_DOS_PASSOS, chave).toContain(chave);
  });

  it("os sete vídeos do portal têm lugar, na ordem da série", () => {
    expect(Object.keys(VIDEOS_DO_PORTAL)).toEqual(["entrar", "solicitacao", "pendencia", "aprovar", "financeiro", "comunicado", "senha"]);
  });

  it("link preenchido é de um vídeo do YouTube", () => {
    for (const [chave, link] of [...Object.entries(VIDEOS_DO_CONNECT), ...Object.entries(VIDEOS_DO_PORTAL)]) {
      if (link.trim()) expect(idDoVideo(link), `${chave}: ${link}`).not.toBeNull();
    }
  });
});
