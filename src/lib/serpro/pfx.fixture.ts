// Um e-CNPJ A1 de mentira, montado na hora para os testes (20/10/2026).
//
// Nenhum arquivo de certificado entra no repositório: a chave RSA, o
// certificado autoassinado e o .pfx saem daqui a cada execução. O .pfx
// "legado" é o que a AC e o Windows antigo exportam — certificados em
// pbeWithSHA1And40BitRC2-CBC, chave em 3DES, MAC em SHA-1 —, o mesmo que o
// `openssl pkcs12 -export -legacy` gera, e que o OpenSSL 3 não abre.

import { createCipheriv, createHmac, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { der, derivarPkcs12, OID, rc2Cbc, senhaBmp, tlv } from "./pkcs12";

const ITERACOES = 2048;

function nome(cn: string): Buffer {
  const parte = (id: string, valor: Buffer) => der.conjunto(der.sequencia(der.oid(id), valor));
  return der.sequencia(
    parte("2.5.4.6", tlv(0x13, Buffer.from("BR"))),
    parte("2.5.4.10", tlv(0x0c, Buffer.from("ICP-Brasil"))),
    parte("2.5.4.3", tlv(0x0c, Buffer.from(cn, "utf8")))
  );
}

/** UTCTime: AAMMDDHHMMSSZ. */
const utc = (d: Date) => tlv(0x17, Buffer.from(`${d.toISOString().replace(/[-:T]/g, "").slice(2, 14)}Z`));

function autoassinado(privada: KeyObject, publica: KeyObject, cn: string, de: Date, ate: Date): Buffer {
  const algoritmo = der.sequencia(der.oid("1.2.840.113549.1.1.11"), der.nulo()); // sha256WithRSAEncryption
  const tbs = der.sequencia(
    der.explicito(0, der.inteiro(2)),
    der.inteiro(1),
    algoritmo,
    nome(cn),
    der.sequencia(utc(de), utc(ate)),
    nome(cn),
    publica.export({ type: "spki", format: "der" })
  );
  return der.sequencia(tbs, algoritmo, tlv(0x03, Buffer.concat([Buffer.from([0]), sign("sha256", tbs, privada)])));
}

const pbe = (oidDaCifra: string, sal: Buffer) => der.sequencia(der.oid(oidDaCifra), der.sequencia(der.octetos(sal), der.inteiro(ITERACOES)));
const dados = (conteudo: Buffer) => der.sequencia(der.oid(OID.data), der.explicito(0, der.octetos(conteudo)));

export type CertificadoDeTeste = { titular: string; cnpj: string; validoAte: string; legado: (senha: string, opcoes?: OpcoesDoLegado) => Buffer };

/** Cifras trocadas por uma que ninguém conhece, para o teste do arquivo que nem a conversão abre. */
type OpcoesDoLegado = { cifraDosCertificados?: string; cifraDaChave?: string };

/** O certificado e um gerador do .pfx legado com a senha pedida. */
export function certificadoDeTeste(titular = "ESCRITORIO FICTICIO LTDA", cnpj = "11222333000181", validoAte = "2031-12-31"): CertificadoDeTeste {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certificado = autoassinado(privateKey, publicKey, `${titular}:${cnpj}`, new Date(Date.now() - 86_400_000), new Date(`${validoAte}T12:00:00Z`));

  const legado = (senha: string, opcoes: OpcoesDoLegado = {}) => {
    const bmp = senhaBmp(senha);
    const idLocal = der.conjunto(der.sequencia(der.oid(OID.localKeyId), der.conjunto(der.octetos(Buffer.from([1, 2, 3, 4])))));

    // A chave, em 3DES (o Node abre essa sozinho).
    const salDaChave = randomBytes(8);
    const c = createCipheriv("des-ede3-cbc", derivarPkcs12("sha1", bmp, salDaChave, 1, ITERACOES, 24), derivarPkcs12("sha1", bmp, salDaChave, 2, ITERACOES, 8));
    const pkcs8 = privateKey.export({ type: "pkcs8", format: "der" });
    const epki = der.sequencia(pbe(opcoes.cifraDaChave ?? OID.pbeSha1TripleDes, salDaChave), der.octetos(Buffer.concat([c.update(pkcs8), c.final()])));
    const bolsaDaChave = der.sequencia(der.oid(OID.pkcs8ShroudedKeyBag), der.explicito(0, epki), idLocal);

    // O certificado, em RC2 de 40 bits: é esta parte que o OpenSSL 3 recusa.
    const bolsaDoCertificado = der.sequencia(
      der.oid(OID.certBag),
      der.explicito(0, der.sequencia(der.oid(OID.x509Certificate), der.explicito(0, der.octetos(certificado)))),
      idLocal
    );
    const salDoCertificado = randomBytes(8);
    const cifrado = rc2Cbc(
      "cifrar",
      derivarPkcs12("sha1", bmp, salDoCertificado, 1, ITERACOES, 5),
      40,
      derivarPkcs12("sha1", bmp, salDoCertificado, 2, ITERACOES, 8),
      der.sequencia(bolsaDoCertificado)
    );
    const cifradoInfo = der.sequencia(
      der.oid(OID.encryptedData),
      der.explicito(
        0,
        der.sequencia(der.inteiro(0), der.sequencia(der.oid(OID.data), pbe(opcoes.cifraDosCertificados ?? OID.pbeSha1Rc2de40, salDoCertificado), der.implicito(0, cifrado)))
      )
    );

    const autenticado = der.sequencia(cifradoInfo, dados(der.sequencia(bolsaDaChave)));
    const salDoMac = randomBytes(8);
    const mac = createHmac("sha1", derivarPkcs12("sha1", bmp, salDoMac, 3, ITERACOES, 20)).update(autenticado).digest();
    const macData = der.sequencia(der.sequencia(der.sequencia(der.oid(OID.sha1), der.nulo()), der.octetos(mac)), der.octetos(salDoMac), der.inteiro(ITERACOES));
    return der.sequencia(der.inteiro(3), dados(autenticado), macData);
  };

  return { titular, cnpj, validoAte, legado };
}
