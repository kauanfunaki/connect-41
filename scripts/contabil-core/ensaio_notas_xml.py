"""XMLs inventados de notas fiscais para o ensaio das notas (Bloco C, Fase C1, 18/11/2026).

Gera, em `scripts/contabil-core/ensaio-notas/`, notas fictícias assinadas de verdade (XMLDSig RSA-SHA1 com
digest SHA-1, como a SEFAZ exige, por um certificado autoassinado gerado aqui), e confere cada uma com o
`parse_nota_xml` do original, gravando o que ele leu em `esperado.json`:

- `nfe-assinada.xml`: NF-e autorizada (nfeProc com protNFe), da fornecedora para a empresa do ensaio;
- `nfe-alterada.xml`: outra NF-e, alterada DEPOIS de assinada (a assinatura não fecha: entra como
  `xml_nao_verificado`, com o motivo);
- `nfse-assinada.xml`: NFS-e ABRASF assinada, a empresa como prestadora;
- `nfe-de-outra-empresa.xml`: NF-e entre duas empresas que não são a do ensaio (recusada pelo CNPJ);
- `notas.zip`: as duas NF-e de novo (as duas duplicadas) e um XML quebrado.

Nenhum dado real: CNPJs de exemplo com os verificadores calculados. Uso, da raiz do contabil-core:
    PYTHONPATH=. python -I <connect>/scripts/contabil-core/ensaio_notas_xml.py <connect>/scripts/contabil-core/ensaio-notas
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import zipfile

sys.path.insert(0, os.getcwd())

from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402
from lxml import etree  # noqa: E402
from signxml import DigestAlgorithm, SignatureMethod, XMLSigner  # noqa: E402
from signxml.algorithms import CanonicalizationMethod  # noqa: E402

NFE = "http://www.portalfiscal.inf.br/nfe"
ABRASF = "http://www.abrasf.org.br/nfse.xsd"


def cnpj(base12: str) -> str:
    def dv(d, pesos):
        resto = sum(int(a) * p for a, p in zip(d, pesos)) % 11
        return "0" if resto < 2 else str(11 - resto)

    d = base12 + dv(base12, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    return d + dv(d, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))


EMPRESA = cnpj("123456780007")
FORNECEDOR = cnpj("999999990001")
CLIENTE = cnpj("111111110001")


def chave(emitente: str, numero: int) -> str:
    return f"3526019{emitente[1:]}55001{numero:09d}1{numero:08d}"[:43] + str(numero % 10)


def certificado():
    chave_privada = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "EMPRESA FICTICIA DO ENSAIO:99999999000191")])
    agora = dt.datetime(2026, 1, 1, tzinfo=dt.UTC)
    cert = (
        x509.CertificateBuilder().subject_name(nome).issuer_name(nome).public_key(chave_privada.public_key())
        .serial_number(41).not_valid_before(agora).not_valid_after(agora + dt.timedelta(days=3650))
        .sign(chave_privada, hashes.SHA256())
    )
    return (
        chave_privada.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()),
        cert.public_bytes(serialization.Encoding.PEM),
    )


class _SignerDaNfe(XMLSigner):
    def check_deprecated_methods(self):  # a NF-e exige RSA-SHA1 e SHA-1 (norma da SEFAZ)
        pass


def assinar(elemento, referencia: str, chave_pem: bytes, cert_pem: bytes):
    signer = _SignerDaNfe(
        signature_algorithm=SignatureMethod.RSA_SHA1, digest_algorithm=DigestAlgorithm.SHA1,
        c14n_algorithm=CanonicalizationMethod.CANONICAL_XML_1_0,
    )
    return signer.sign(elemento, key=chave_pem, cert=cert_pem, reference_uri=f"#{referencia}")


def nfe(numero: int, emitente: str, destinatario: str, valor: str, chave_pem, cert_pem, alterar: bool = False) -> bytes:
    ch = chave(emitente, numero)
    e = etree.SubElement
    nfe_ = etree.Element(f"{{{NFE}}}NFe", nsmap={None: NFE})
    inf = e(nfe_, f"{{{NFE}}}infNFe", Id=f"NFe{ch}", versao="4.00")
    ide = e(inf, f"{{{NFE}}}ide")
    e(ide, f"{{{NFE}}}serie").text = "1"
    e(ide, f"{{{NFE}}}nNF").text = str(numero)
    e(ide, f"{{{NFE}}}dhEmi").text = "2026-01-06T10:00:00-03:00"
    emit = e(inf, f"{{{NFE}}}emit")
    e(emit, f"{{{NFE}}}CNPJ").text = emitente
    e(emit, f"{{{NFE}}}xNome").text = "FORNECEDORA FICTICIA DO ENSAIO LTDA"
    dest = e(inf, f"{{{NFE}}}dest")
    e(dest, f"{{{NFE}}}CNPJ").text = destinatario
    e(dest, f"{{{NFE}}}xNome").text = "EMPRESA ENSAIO NOTAS LTDA"
    tot = e(e(inf, f"{{{NFE}}}total"), f"{{{NFE}}}ICMSTot")
    e(tot, f"{{{NFE}}}vNF").text = valor
    assinada = assinar(nfe_, f"NFe{ch}", chave_pem, cert_pem)
    if alterar:
        # O downloader de DF-e reempacota e muda o conteúdo depois de assinado (aqui, o nome do destinatário).
        assinada.find(f".//{{{NFE}}}dest/{{{NFE}}}xNome").text = "E*****A E*****O N***S"
    proc = etree.Element(f"{{{NFE}}}nfeProc", nsmap={None: NFE}, versao="4.00")
    proc.append(assinada)
    inf_prot = e(e(proc, f"{{{NFE}}}protNFe", versao="4.00"), f"{{{NFE}}}infProt")
    e(inf_prot, f"{{{NFE}}}chNFe").text = ch
    e(inf_prot, f"{{{NFE}}}dhRecbto").text = "2026-01-06T10:00:05-03:00"
    e(inf_prot, f"{{{NFE}}}nProt").text = f"1352600000{numero:05d}"
    e(inf_prot, f"{{{NFE}}}cStat").text = "100"
    return etree.tostring(proc, xml_declaration=True, encoding="UTF-8")


def nfse(numero: int, prestador: str, tomador: str, valor: str, chave_pem, cert_pem) -> bytes:
    e = etree.SubElement
    comp = etree.Element(f"{{{ABRASF}}}CompNfse", nsmap={None: ABRASF})
    nf = e(comp, f"{{{ABRASF}}}Nfse", versao="2.04")
    inf = e(nf, f"{{{ABRASF}}}InfNfse", Id=f"nfse{numero}")
    e(inf, f"{{{ABRASF}}}Numero").text = str(numero)
    e(inf, f"{{{ABRASF}}}CodigoVerificacao").text = "ABC12345"
    e(inf, f"{{{ABRASF}}}DataEmissao").text = "2026-01-07T09:30:00"
    serv = e(inf, f"{{{ABRASF}}}Servico")
    val = e(serv, f"{{{ABRASF}}}Valores")
    e(val, f"{{{ABRASF}}}ValorServicos").text = valor
    e(val, f"{{{ABRASF}}}ValorIss").text = "17.50"
    prest = e(inf, f"{{{ABRASF}}}PrestadorServico")
    e(e(prest, f"{{{ABRASF}}}IdentificacaoPrestador"), f"{{{ABRASF}}}Cnpj").text = prestador
    e(prest, f"{{{ABRASF}}}RazaoSocial").text = "EMPRESA ENSAIO NOTAS LTDA"
    tom = e(inf, f"{{{ABRASF}}}TomadorServico")
    e(e(e(tom, f"{{{ABRASF}}}IdentificacaoTomador"), f"{{{ABRASF}}}CpfCnpj"), f"{{{ABRASF}}}Cnpj").text = tomador
    assinada = assinar(nf, f"nfse{numero}", chave_pem, cert_pem)
    comp.remove(nf)
    comp.append(assinada)
    return etree.tostring(comp, xml_declaration=True, encoding="UTF-8")


def main(pasta: str) -> None:
    from src.domain.notas.xml_parser import parse_nota_xml

    os.makedirs(pasta, exist_ok=True)
    chave_pem, cert_pem = certificado()
    arquivos = {
        "nfe-assinada.xml": nfe(84086, FORNECEDOR, EMPRESA, "800.00", chave_pem, cert_pem),
        "nfe-alterada.xml": nfe(84087, FORNECEDOR, EMPRESA, "1500.50", chave_pem, cert_pem, alterar=True),
        "nfse-assinada.xml": nfse(2026, EMPRESA, CLIENTE, "350.00", chave_pem, cert_pem),
        "nfe-de-outra-empresa.xml": nfe(84088, FORNECEDOR, CLIENTE, "99.90", chave_pem, cert_pem),
    }
    esperado = {"empresa": EMPRESA, "arquivos": {}}
    for nome, conteudo in arquivos.items():
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)
        n = parse_nota_xml(conteudo)
        esperado["arquivos"][nome] = {
            "tipo": n.tipo, "numero": n.numero, "cnpj_emitente": n.cnpj_emitente, "cnpj_destinatario": n.cnpj_destinatario,
            "valor": str(n.valor), "data_emissao": n.data_emissao.isoformat(), "chave_acesso": n.chave_acesso,
            "assinatura_nao_verificada": n.assinatura_nao_verificada,
        }
    with zipfile.ZipFile(os.path.join(pasta, "notas.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("lote/nfe-assinada.xml", arquivos["nfe-assinada.xml"])
        z.writestr("lote/nfe-alterada.xml", arquivos["nfe-alterada.xml"])
        z.writestr("lote/quebrado.xml", b"<nfeProc><NFe>")
    with open(os.path.join(pasta, "esperado.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(esperado, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(json.dumps(esperado, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
