import { randomUUID } from "node:crypto";
import { createSecureContext } from "node:tls";
import { describe, expect, it } from "vitest";
import { ERRO_DO_FORMATO_ANTIGO, lerCertificado } from "./certificado";
import { blocoRc2, converterPfxAntigo } from "./pkcs12";
import { certificadoDeTeste } from "./pfx.fixture";

// O A1 em formato antigo (20/10/2026): o OpenSSL 3 não abre o .pfx com os
// certificados em RC2, e a tela dizia "senha errada". O .pfx é montado pelo
// próprio teste (pfx.fixture.ts), sem arquivo de certificado no repositório.

const SENHA = randomUUID();
const cert = certificadoDeTeste();

describe("RC2 (RFC 2268, seção 5)", () => {
  it.each([
    ["0000000000000000", 63, "0000000000000000", "ebb773f993278eff"],
    ["ffffffffffffffff", 64, "ffffffffffffffff", "278b27e42e2f0d49"],
    ["3000000000000000", 64, "1000000000000001", "30649edf9be7d2c2"],
    ["88", 64, "0000000000000000", "61a8a244adacccf0"],
    ["88bca90e90875a", 64, "0000000000000000", "6ccf4308974c267f"],
    ["88bca90e90875a7f0f79c384627bafb2", 64, "0000000000000000", "1a807d272bbe5db1"],
    ["88bca90e90875a7f0f79c384627bafb2", 128, "0000000000000000", "2269552ab0f85ca6"],
  ])("chave %s com %i bits efetivos", (chave, bits, claro, cifrado) => {
    const k = Buffer.from(chave, "hex");
    expect(blocoRc2("cifrar", k, bits, Buffer.from(claro, "hex")).toString("hex")).toBe(cifrado);
    expect(blocoRc2("decifrar", k, bits, Buffer.from(cifrado, "hex")).toString("hex")).toBe(claro);
  });
});

describe("o certificado em formato antigo", () => {
  const legado = cert.legado(SENHA);

  it("o Node de hoje não abre o .pfx legado", () => {
    expect(() => createSecureContext({ pfx: legado, passphrase: SENHA })).toThrow(/Unsupported PKCS12 PFX data/);
  });

  it("é convertido no servidor: lê titular, CNPJ e validade, e devolve o arquivo moderno", () => {
    const lido = lerCertificado(legado, SENHA);
    expect(lido).toMatchObject({ ok: true, titular: cert.titular, cnpj: cert.cnpj, validoAte: cert.validoAte });
    const convertido = lido.ok ? lido.convertido : undefined;
    expect(convertido).toBeInstanceOf(Buffer);
    // O convertido abre direto, com a mesma senha, e não precisa de nova conversão.
    expect(() => createSecureContext({ pfx: convertido!, passphrase: SENHA })).not.toThrow();
    const relido = lerCertificado(convertido!, SENHA);
    expect(relido).toMatchObject({ ok: true, cnpj: cert.cnpj });
    expect(relido.ok && relido.convertido).toBeFalsy();
  });

  it("senha errada continua sendo senha errada", () => {
    expect(lerCertificado(legado, "outra")).toEqual({ ok: false, erro: "A senha não abre o certificado." });
    expect(converterPfxAntigo(legado, "outra")).toEqual({ ok: false, erro: "senha" });
  });

  it("o que nem a conversão abre pede para reexportar com AES, e não fala em senha", () => {
    const CIFRA_DESCONHECIDA = "1.2.840.113549.1.12.1.99";
    expect(converterPfxAntigo(cert.legado(SENHA, { cifraDosCertificados: CIFRA_DESCONHECIDA }), SENHA)).toEqual({ ok: false, erro: "formato" });
    // Certificados em RC2 (o Node para aí, com "Unsupported") e a chave numa cifra que a conversão não conhece.
    const lido = lerCertificado(cert.legado(SENHA, { cifraDaChave: CIFRA_DESCONHECIDA }), SENHA);
    expect(lido).toEqual({ ok: false, erro: ERRO_DO_FORMATO_ANTIGO });
    expect(ERRO_DO_FORMATO_ANTIGO).toMatch(/formato antigo/);
    expect(ERRO_DO_FORMATO_ANTIGO).toMatch(/AES/);
  });

  it("arquivo que não é .pfx", () => {
    expect(lerCertificado(Buffer.from("não é certificado"), SENHA)).toEqual({ ok: false, erro: "O arquivo não é um certificado .pfx válido." });
    expect(converterPfxAntigo(Buffer.from("não é certificado"), SENHA)).toEqual({ ok: false, erro: "formato" });
  });
});
