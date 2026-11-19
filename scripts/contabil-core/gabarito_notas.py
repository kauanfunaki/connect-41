"""Gabarito dos leitores de notas fiscais, Bloco C, Fase C1 (18/11/2026).

Plugin do pytest: roda a suíte do original (dev41tech/contabil-core) que exercita os leitores de
notas (`src/domain/notas/xml_parser.py` e `visual_parser.py`) e grava cada chamada de
`parse_nota_xml`, `_parse_ai_response`, `_nota_from_item`, `_cnpj_valido_formatado` e
`_parse_data_str`, com a entrada e a saída exatas. Depois acrescenta XML INVENTADOS de NF-e e NFS-e,
assinados aqui mesmo por certificados de teste gerados na hora (RSA, EC, vencido, ainda não válido):
assinatura que confere, alterada depois, ausente, com algoritmo fraco, com e sem namespace, fora do
esquema, eventos, datas, valores e CNPJs de todos os jeitos, e XML malformado. E chamadas diretas a
`_parse_datetime`, `_normalizar_cnpj`, `_is_evento_nfe`, `_validar_assinatura` e às funções puras do
leitor visual.

A leitura visual inteira (`parse_pdf` e `parse_imagem`) entra como CENÁRIO: o PDF ou a imagem, se a
IA está liberada, e as respostas que a IA simulada dá (as da suíte do original, que também simula);
o gabarito guarda as chamadas que o leitor fez (texto ou imagem, o texto enviado) e o resultado. A
IA de verdade nunca é chamada.

O porte em TypeScript repete as chamadas (`src/lib/contabil-core/notas/{xml,visual}.test.ts`), com
o relógio do certificado parado em `gerado_em`.

Dados: os testes do original e os XML daqui são inventados. Os CNPJs que não são de exemplo são
trocados por fictícios começando com 9 (com o dígito verificador refeito, para não mudar a validação)
e as chaves de acesso por chaves fictícias; os nomes da variável GABARITO_NOMES ("REAL=FICTICIO;..."),
fora do git, também. A chamada é REPETIDA com a entrada trocada, e o gabarito guarda a saída dela.

Uso, a partir da raiz do contabil-core (com signxml, cryptography, lxml, pdfplumber, PyMuPDF e pytest):
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_PASTA=<connect>/src/lib/contabil-core/notas/gabarito \\
        python -W ignore -m pytest -q -p gabarito_notas tests/unit/test_nota_xml_parser.py \\
        tests/unit/test_notas_visual_parser.py

Conferência local em arquivos reais (a saída fica FORA do repositório):
    python -W ignore <connect>/scripts/contabil-core/gabarito_notas.py conferir <saida.json> <arquivo>...
"""
from __future__ import annotations

import base64
import dataclasses
import functools
import hashlib
import json
import os
import re
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")

chamadas: dict[str, dict] = {}
conteudos: dict[str, bytes] = {}
nomes_de_arquivo: dict[str, str] = {}

# ─── Sanitização ─────────────────────────────────────────────────────────────

_EXEMPLOS = ("00000000", "11111111", "12345678", "99999999", "22222222", "33333333")
_NOMES = dict(par.split("=", 1) for par in os.environ.get("GABARITO_NOMES", "").split(";") if "=" in par)


def _dv(d: str, pesos) -> str:
    resto = sum(int(x) * p for x, p in zip(d, pesos)) % 11
    return "0" if resto < 2 else str(11 - resto)


def _cnpj_valido(d: str) -> bool:
    if len(d) != 14 or d == d[0] * 14:
        return False
    return d[12] == _dv(d[:12], (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2)) and d[13] == _dv(d[:13], (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))


def cnpj_ficticio(digitos: str) -> str:
    """Troca os 14 dígitos por outros começando com 9, válido se o original era válido."""
    if digitos.startswith(_EXEMPLOS):
        return digitos
    base = "9" + "".join(str(int(c, 16) % 10) for c in hashlib.sha256(digitos.encode()).hexdigest()[:11])
    d1 = _dv(base, (5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    d2 = _dv(base + d1, (6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2))
    novo = base + d1 + d2
    if not _cnpj_valido(digitos):
        novo = novo[:13] + str((int(novo[13]) + 1) % 10)
    return novo


def _troca_digitos(m: re.Match) -> str:
    s = m.group(0)
    if len(s) == 14:
        return cnpj_ficticio(s)
    if len(s) >= 44:
        return "".join(str(int(c, 16) % 10) for c in hashlib.sha256(s.encode()).hexdigest() * 2)[: len(s)]
    return s


_FORMATADO = re.compile(r"(?<![0-9])\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}(?![0-9])")


def sanitizar_texto(v: str) -> str:
    for real, ficticio in _NOMES.items():
        v = v.replace(real, ficticio)

    def formatado(m: re.Match) -> str:
        d = cnpj_ficticio(re.sub(r"\D", "", m.group(0)))
        return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"

    v = _FORMATADO.sub(formatado, v)
    return re.sub(r"(?<![0-9])[0-9]+(?![0-9])", _troca_digitos, v)


def sanitizar(v):
    if isinstance(v, str):
        return sanitizar_texto(v)
    if isinstance(v, bytes):
        try:
            return sanitizar_texto(v.decode("utf-8")).encode("utf-8")
        except UnicodeDecodeError:
            return v
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    return v


# ─── Codificação ─────────────────────────────────────────────────────────────

def codificar(v):
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 2**53:
        return {"$int": str(v)}
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": v.isoformat()}
    if isinstance(v, bytes):
        sha = hashlib.sha256(v).hexdigest()[:12]
        conteudos.setdefault(sha, v)
        return {"$arquivo": sha}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, dict):
        return {"$dict": [[str(k), codificar(x)] for k, x in v.items()]}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _registrar(nome, fn, args, kwargs=None, extra=None):
    kwargs = kwargs or {}
    entrada = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    if extra:
        entrada.update(extra(entrada))
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)
    return entrada


def envolver(modulo, nome_fn, rotulo):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        try:
            return original(*args, **kwargs)
        finally:
            _registrar(rotulo, original, sanitizar(list(args)), sanitizar(kwargs))

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


def _modulos():
    sys.path.insert(0, os.getcwd())
    from src.domain.notas import visual_parser, xml_parser

    return xml_parser, visual_parser


def pytest_configure(config):  # noqa: ARG001
    xml_parser, visual = _modulos()
    envolver(xml_parser, "parse_nota_xml", "xml.parse_nota_xml")
    for fn in ("_parse_ai_response", "_nota_from_item", "_cnpj_valido_formatado", "_parse_data_str"):
        envolver(visual, fn, f"visual.{fn}")


# ─── Certificados e assinatura de teste ──────────────────────────────────────

DS = "http://www.w3.org/2000/09/xmldsig#"
C14N10 = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
C14N10C = C14N10 + "#WithComments"
C14N11 = "http://www.w3.org/2006/12/xml-c14n11"
EXC = "http://www.w3.org/2001/10/xml-exc-c14n#"
ENV = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"
PSS_SHA256 = "http://www.w3.org/2007/05/xmldsig-more#sha256-rsa-MGF1"
ECDSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"
DSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#dsa-sha1"
HMAC_SHA1 = "http://www.w3.org/2000/09/xmldsig#hmac-sha1"
SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1"
SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256"
SHA512 = "http://www.w3.org/2001/04/xmlenc#sha512"


def certificados():
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec, rsa
    from cryptography.hazmat.primitives.serialization import Encoding
    from cryptography.x509.oid import NameOID

    def gerar(chave, de, ate, nome):
        sujeito = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, nome)])
        cert = (
            x509.CertificateBuilder().subject_name(sujeito).issuer_name(sujeito).public_key(chave.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(de).not_valid_after(ate)
            .sign(chave, hashes.SHA256())
        )
        return {"chave": chave, "b64": base64.b64encode(cert.public_bytes(Encoding.DER)).decode()}

    rsa1 = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    rsa2 = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ecc = ec.generate_private_key(ec.SECP256R1())
    return {
        "rsa": gerar(rsa1, datetime(2020, 1, 1, tzinfo=UTC), datetime(2099, 12, 31, tzinfo=UTC), "EMPRESA FICTICIA DE TESTE"),
        "outro": gerar(rsa2, datetime(2020, 1, 1, tzinfo=UTC), datetime(2099, 12, 31, tzinfo=UTC), "OUTRA FICTICIA"),
        "vencido": gerar(rsa1, datetime(2010, 1, 1, tzinfo=UTC), datetime(2015, 1, 1, tzinfo=UTC), "VENCIDO FICTICIO"),
        "futuro": gerar(rsa1, datetime(2090, 1, 1, tzinfo=UTC), datetime(2099, 1, 1, tzinfo=UTC), "FUTURO FICTICIO"),
        "ec": gerar(ecc, datetime(2020, 1, 1, tzinfo=UTC), datetime(2099, 12, 31, tzinfo=UTC), "EC FICTICIO"),
    }


def assinatura_modelo(uri, cert_b64, *, c14n=C14N10, metodo=RSA_SHA1, digest=SHA1, transforms=(ENV, C14N10),
                      prefixo="", keyinfo_extra="", depois_do_digest="", signedinfo_extra="", tem_cert=True):
    p = f"{prefixo}:" if prefixo else ""
    xmlns = f'xmlns:{prefixo}="{DS}"' if prefixo else f'xmlns="{DS}"'
    trans = "".join(f'<{p}Transform Algorithm="{t}"/>' for t in transforms)
    trans = f"<{p}Transforms>{trans}</{p}Transforms>" if transforms else ""
    cert = f"<{p}X509Data><{p}X509Certificate>{cert_b64}</{p}X509Certificate></{p}X509Data>" if tem_cert else ""
    return (
        f'<{p}Signature {xmlns}><{p}SignedInfo{signedinfo_extra}><{p}CanonicalizationMethod Algorithm="{c14n}"/>'
        f'<{p}SignatureMethod Algorithm="{metodo}"/><{p}Reference URI="{uri}">{trans}'
        f'<{p}DigestMethod Algorithm="{digest}"/><{p}DigestValue>__DIGEST__</{p}DigestValue>{depois_do_digest}</{p}Reference>'
        f"</{p}SignedInfo><{p}SignatureValue>__ASSINATURA__</{p}SignatureValue>"
        f"<{p}KeyInfo>{cert}{keyinfo_extra.replace('{p}', p)}</{p}KeyInfo></{p}Signature>"
    )


def assinar(texto: str, chave, *, metodo=RSA_SHA1, digest=SHA1, transforms=(ENV, C14N10), c14n=C14N10, codificacao="utf-8"):
    """Preenche o digest e a assinatura do modelo como o `signxml` confere (cópia, remoção, C14N)."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec, padding
    from lxml import etree

    hashes_ = {SHA1: hashes.SHA1, SHA256: hashes.SHA256, SHA512: hashes.SHA512}
    dados = texto.encode(codificacao)
    raiz = etree.fromstring(dados)
    sig = raiz if raiz.tag == f"{{{DS}}}Signature" else raiz.find(f".//{{{DS}}}Signature")
    uri = sig.find(f".//{{{DS}}}Reference").get("URI").lstrip("#")
    copia = etree.fromstring(etree.tostring(raiz))
    sig_copia = copia if copia.tag == f"{{{DS}}}Signature" else copia.find(f".//{{{DS}}}Signature")
    alvo = copia.xpath("//*[@*[local-name() = 'Id']=$u]", u=uri) or copia.xpath("//*[@*[local-name() = 'ID']=$u]", u=uri)
    alvo = alvo[0]
    if ENV in transforms and sig_copia.getparent() is not None:
        from signxml.util import _remove_sig
        _remove_sig(sig_copia, idempotent=True)
    carga = etree.fromstring(etree.tostring(alvo))
    alg_t = next((t for t in transforms if t != ENV), C14N11)
    carga = etree.tostring(carga, method="c14n", exclusive=alg_t.startswith(EXC), with_comments=alg_t.endswith("#WithComments"))
    h = hashes.Hash(hashes_[digest]())
    h.update(carga)
    texto = texto.replace("__DIGEST__", base64.b64encode(h.finalize()).decode(), 1)
    raiz = etree.fromstring(texto.encode(codificacao))
    sig = raiz if raiz.tag == f"{{{DS}}}Signature" else raiz.find(f".//{{{DS}}}Signature")
    si = etree.fromstring(etree.tostring(sig)).find(f"{{{DS}}}SignedInfo")
    si_c14n = etree.tostring(si, method="c14n", exclusive=c14n.startswith(EXC), with_comments=c14n.endswith("#WithComments"))
    if metodo == RSA_SHA1:
        valor = chave.sign(si_c14n, padding.PKCS1v15(), hashes.SHA1())
    elif metodo == RSA_SHA256:
        valor = chave.sign(si_c14n, padding.PKCS1v15(), hashes.SHA256())
    elif metodo == PSS_SHA256:
        valor = chave.sign(si_c14n, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32), hashes.SHA256())
    elif metodo == ECDSA_SHA256:
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
        r, s = decode_dss_signature(chave.sign(si_c14n, ec.ECDSA(hashes.SHA256())))
        valor = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    else:
        valor = b"\x00" * 256
    return texto.replace("__ASSINATURA__", base64.b64encode(valor).decode(), 1)


# ─── XML inventados ──────────────────────────────────────────────────────────

CHAVE = "35261199999999000191550010000004211000004217"
CNPJ_EMIT = "99999999000191"
CNPJ_DEST = "98765432000198"  # fictício (começa com 9), dígito verificador válido


def nfe(*, chave=CHAVE, ns=True, numero="421", serie="1", dh="2026-11-05T10:20:30-03:00", cnpj=CNPJ_EMIT,
        nome="EMPRESA FICTICIA &amp; CIA LTDA", dest=f"<CNPJ>{CNPJ_DEST}</CNPJ><xNome>CLIENTE FICTICIO</xNome>",
        vnf="1500.00", cstat="100", nprot="135260000000001", recbto="2026-11-05T10:21:00-03:00", chprot=None,
        assinatura="", proc=True, extra_inf="", raiz_attrs="", prot=True):
    x = ' xmlns="http://www.portalfiscal.inf.br/nfe"' if ns else ""
    inf = (
        f'<infNFe versao="4.00" Id="NFe{chave}">{extra_inf}<ide><cUF>35</cUF><nNF>{numero}</nNF><serie>{serie}</serie>'
        f"<dhEmi>{dh}</dhEmi></ide><emit><CNPJ>{cnpj}</CNPJ><xNome>{nome}</xNome></emit>"
        f"<dest>{dest}</dest><total><ICMSTot><vProd>{vnf}</vProd><vNF>{vnf}</vNF></ICMSTot></total></infNFe>"
    )
    corpo = f"<NFe{x}>{inf}{assinatura}</NFe>"
    if not proc:
        return f'<?xml version="1.0" encoding="UTF-8"?>{corpo}'
    protocolo = (
        f'<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>{chprot or chave}</chNFe><dhRecbto>{recbto}</dhRecbto>'
        f"<nProt>{nprot}</nProt><cStat>{cstat}</cStat></infProt></protNFe>" if prot else ""
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><nfeProc{x} versao="4.00"{raiz_attrs}>{corpo}{protocolo}</nfeProc>'


def nfse(*, ns="http://www.abrasf.org.br/nfse.xsd", prefixo="", id_="Nfse421", numero="421", data="2026-11-05T09:00:00",
         codigo="AB12CD34", valor="2500.50", iss="125.03", cnpj=CNPJ_EMIT, tomador=f"<Cnpj>{CNPJ_DEST}</Cnpj>",
         assinatura="", fora=""):
    p = f"{prefixo}:" if prefixo else ""
    x = (f' xmlns:{prefixo}="{ns}"' if prefixo else f' xmlns="{ns}"') if ns else ""
    inf = (
        f'<{p}InfNfse Id="{id_}"><{p}Numero>{numero}</{p}Numero><{p}CodigoVerificacao>{codigo}</{p}CodigoVerificacao>'
        f"<{p}DataEmissao>{data}</{p}DataEmissao><{p}Servico><{p}Valores><{p}ValorServicos>{valor}</{p}ValorServicos>"
        f"<{p}ValorIss>{iss}</{p}ValorIss></{p}Valores></{p}Servico><{p}PrestadorServico><{p}IdentificacaoPrestador>"
        f"<{p}Cnpj>{cnpj}</{p}Cnpj></{p}IdentificacaoPrestador><{p}RazaoSocial>PRESTADORA FICTICIA LTDA</{p}RazaoSocial>"
        f"</{p}PrestadorServico><{p}TomadorServico><{p}IdentificacaoTomador><{p}CpfCnpj>{tomador}</{p}CpfCnpj>"
        f"</{p}IdentificacaoTomador></{p}TomadorServico></{p}InfNfse>"
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><{p}CompNfse{x}><{p}Nfse versao="1.00">{inf}{assinatura}</{p}Nfse>{fora}</{p}CompNfse>'


def casos_xml(certs):
    rsa, ec_ = certs["rsa"], certs["ec"]
    b64 = rsa["b64"]
    ref = f"#NFe{CHAVE}"

    def nfe_assinada(chave_cert="rsa", nome_caso=None, depois=None, **kw):
        c = certs[chave_cert]
        opc = {k: kw.pop(k) for k in ("metodo", "digest", "transforms", "c14n") if k in kw}
        modelo_kw = {k: kw.pop(k) for k in ("prefixo", "keyinfo_extra", "depois_do_digest", "signedinfo_extra", "tem_cert") if k in kw}
        uri = kw.pop("uri", ref)
        sig = assinatura_modelo(uri, c["b64"], **opc, **modelo_kw)
        texto = nfe(assinatura=sig, **kw)
        texto = assinar(texto, c["chave"], **opc)
        return depois(texto) if depois else texto

    def trocar_inicio(t):
        def f(m):
            return m.group(1) + ("B" if m.group(2) == "A" else "A")
        return re.sub(r"(<(?:ds:)?SignatureValue>)(.)", f, t, count=1)

    # Cada caso assinado sai duas vezes: com a assinatura no namespace padrão, como a NF-e, e com o
    # prefixo `ds:`. No padrão, o `signxml` nunca chega à conta (ver `c14n.ts`, raiz falsa).
    assinados = [
        ("nfe-assinada", {}),
        ("nfe-assinada-sem-namespace", {"ns": False}),
        ("nfe-assinada-rsa-sha256", {"metodo": RSA_SHA256, "digest": SHA256}),
        ("nfe-assinada-sha512", {"metodo": RSA_SHA256, "digest": SHA512}),
        ("nfe-assinada-pss", {"metodo": PSS_SHA256, "digest": SHA256}),
        ("nfe-assinada-ecdsa", {"chave_cert": "ec", "metodo": ECDSA_SHA256, "digest": SHA256}),
        ("nfe-assinada-c14n11", {"transforms": (ENV, C14N11), "c14n": C14N11}),
        ("nfe-assinada-exclusiva", {"transforms": (ENV, EXC), "c14n": EXC}),
        ("nfe-assinada-sem-transform-c14n", {"transforms": (ENV,)}),
        ("nfe-assinada-com-comentarios", {"transforms": (ENV, C14N10C), "extra_inf": "<!-- nota -->"}),
        ("nfe-assinada-comentario-ignorado", {"extra_inf": "<!-- nota -->\n"}),
        ("nfe-alterada-depois", {"depois": lambda t: t.replace("CLIENTE FICTICIO", "CLIENTE F*****O")}),
        ("nfe-alterada-comentario", {"depois": lambda t: t.replace("<ide>", "<!-- x --><ide>")}),
        ("nfe-alterada-crlf", {"depois": lambda t: t.replace("<ide>", "\r\n<ide>")}),
        ("nfe-alterada-signedinfo", {"depois": lambda t: re.sub(r"<((?:ds:)?)Reference URI", r'<\1Reference Type="urn:x" URI', t)}),
        ("nfe-assinatura-trocada", {"depois": trocar_inicio}),
        ("nfe-certificado-de-outro", {"depois": lambda t: t.replace(b64, certs["outro"]["b64"])}),
        ("nfe-certificado-vencido", {"chave_cert": "vencido"}),
        ("nfe-certificado-futuro", {"chave_cert": "futuro"}),
        ("nfe-referencia-errada", {"depois": lambda t: t.replace(f'URI="{ref}"', 'URI="#NFe1"')}),
        ("nfe-sem-certificado", {"tem_cert": False, "keyinfo_extra": "<{p}KeyName>x</{p}KeyName>"}),
        ("nfe-certificado-vazio", {"depois": lambda t: t.replace(b64, "  ")}),
        ("nfe-certificado-base64-ruim", {"depois": lambda t: t.replace(b64, b64[:-3] + "*" + b64[-2:])}),
        ("nfe-certificado-base64-preenchimento", {"depois": lambda t: t.replace(b64, b64 + "=")}),
        ("nfe-certificado-nao-ascii", {"depois": lambda t: t.replace(b64, b64[:10] + "\u00e9" + b64[10:])}),
        ("nfe-certificado-lixo", {"depois": lambda t: t.replace(b64, "QUJDRA==")}),
        ("nfe-certificado-com-quebras", {"depois": lambda t: t.replace(b64, "\n".join(b64[i:i + 64] for i in range(0, len(b64), 64)))}),
        ("nfe-certificado-com-sobra", {"depois": lambda t: t.replace(b64, base64.b64encode(base64.b64decode(b64) + b"\x00\x00").decode())}),
        ("nfe-dsa-sha1", {"metodo": DSA_SHA1}),
        ("nfe-hmac-sha1", {"metodo": HMAC_SHA1}),
        ("nfe-metodo-desconhecido", {"depois": lambda t: t.replace(RSA_SHA1, "urn:metodo:inventado")}),
        ("nfe-c14n-desconhecida", {"depois": lambda t: re.sub(r'(CanonicalizationMethod Algorithm=")[^"]*', r"\1urn:c14n:x", t)}),
        ("nfe-digest-desconhecido", {"depois": lambda t: t.replace(SHA1, "urn:digest:x")}),
        ("nfe-esquema-atributo-a-mais", {"signedinfo_extra": ' Outro="1"'}),
        ("nfe-esquema-texto-solto", {"depois": lambda t: re.sub(r"(<(?:ds:)?SignedInfo>)", r"\1texto", t)}),
        ("nfe-esquema-sem-digestvalue", {"depois": lambda t: re.sub(r"<((?:ds:)?)DigestValue>[^<]*</(?:ds:)?DigestValue>", "", t)}),
        ("nfe-esquema-digest-nao-base64", {"depois": lambda t: re.sub(r"(<(?:ds:)?DigestValue>)[^<]*", r"\1QQ=", t)}),
        ("nfe-esquema-keyinfo-vazio", {"tem_cert": False}),
        ("nfe-esquema-inclusive-namespaces", {"transforms": (ENV, EXC), "c14n": EXC,
                                              "depois": lambda t: re.sub(r'(<((?:ds:)?)CanonicalizationMethod Algorithm="[^"]*")/>', r'\1><ec:InclusiveNamespaces xmlns:ec="http://www.w3.org/2001/10/xml-exc-c14n#" PrefixList="xsi"/></\2CanonicalizationMethod>', t)}),
        ("nfe-keyvalue-de-outro", {"keyinfo_extra": "<{p}KeyValue><{p}RSAKeyValue><{p}Modulus>AQAB</{p}Modulus><{p}Exponent>AQAB</{p}Exponent></{p}RSAKeyValue></{p}KeyValue>"}),
        ("nfe-duas-referencias", {"depois": lambda t: re.sub(r"(<(?:ds:)?Reference URI.*?</(?:ds:)?Reference>)", r"\1\1", t, count=1)}),
        ("nfe-cauda-de-texto", {"depois": lambda t: re.sub(r"(</(?:ds:)?Signature>)</NFe>", r"\1texto</NFe>", t)}),
        ("nfe-namespace-relativo", {"depois": lambda t: t.replace('<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">', '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" xmlns:r="relativo" versao="4.00">')}),
        ("nfe-id-ambiguo", {"depois": lambda t: t.replace("<protNFe versao", f'<protNFe Id="NFe{CHAVE}" versao')}),
        ("nfe-reempacotada-xsi", {"depois": lambda t: t.replace('versao="4.00"><NFe', 'versao="4.00" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><NFe', 1)}),
    ]
    for nome, kw in assinados:
        for prefixo in ("", "ds"):
            yield f"{nome}{'-ds' if prefixo else ''}.xml", nfe_assinada(prefixo=prefixo, **kw)
    yield "nfe-assinatura-sem-namespace-ds.xml", nfe_assinada(depois=lambda t: t.replace(f' xmlns="{DS}"', ""))
    yield "nfe-assinada-bom.xml", "\ufeff" + nfe_assinada()
    yield "nfe-assinada-bom-ds.xml", "\ufeff" + nfe_assinada(prefixo="ds")
    yield "nfe-assinada-latin1.xml", nfe_assinada(nome="EMPRESA A\u00c7\u00c3O FICT\u00cdCIA").replace('encoding="UTF-8"', 'encoding="ISO-8859-1"')
    yield "nfe-assinada-latin1-ds.xml", nfe_assinada(prefixo="ds", nome="EMPRESA A\u00c7\u00c3O FICT\u00cdCIA").replace('encoding="UTF-8"', 'encoding="ISO-8859-1"')
    yield "nfe-sem-assinatura.xml", nfe()
    # NFS-e
    def nfse_assinada(chave_cert="rsa", depois=None, uri="#Nfse421", fora_da_nota=False, ds="", **kw):
        c = certs[chave_cert]
        sig = assinatura_modelo(uri, c["b64"], prefixo=ds)
        texto = nfse(fora=sig, **kw) if fora_da_nota else nfse(assinatura=sig, **kw)
        texto = assinar(texto, c["chave"])
        return depois(texto) if depois else texto

    yield "nfse-assinada.xml", nfse_assinada()
    yield "nfse-assinada-ds.xml", nfse_assinada(ds="ds")
    yield "nfse-assinada-prefixo-ds.xml", nfse_assinada(prefixo="ns2", ds="ds")
    yield "nfse-assinada-fora-da-nota-ds.xml", nfse_assinada(fora_da_nota=True, ds="ds")
    yield "nfse-alterada-depois-ds.xml", nfse_assinada(ds="ds", depois=lambda t: t.replace("2500.50", "2500.51"))
    yield "nfse-assinada-prefixo.xml", nfse_assinada(prefixo="ns2")
    yield "nfse-assinada-sem-namespace.xml", nfse_assinada(ns=None)
    yield "nfse-assinada-fora-da-nota.xml", nfse_assinada(fora_da_nota=True)
    yield "nfse-alterada-depois.xml", nfse_assinada(depois=lambda t: t.replace("2500.50", "2500.51"))
    yield "nfse-sem-assinatura.xml", nfse()
    yield "nfse-referencia-errada.xml", nfse_assinada(depois=lambda t: t.replace('URI="#Nfse421"', 'URI="#Rps1"'))
    yield "nfse-sem-id.xml", nfse(id_="")
    yield "nfse-tomador-cpf.xml", nfse(tomador="<Cpf>12345678909</Cpf>")
    yield "nfse-tomador-vazio.xml", nfse(tomador="<Cnpj></Cnpj><Cpf>12345678909</Cpf>")
    yield "nfse-sem-codigo.xml", nfse(codigo=" ")
    yield "nfse-sem-numero.xml", nfse(numero="")
    yield "nfse-data-so-dia.xml", nfse(data="2026-11-05")
    yield "nfse-data-com-fuso.xml", nfse(data="2026-11-05T09:00:00-02:00")
    yield "nfse-data-invalida.xml", nfse(data="05/11/2026")
    yield "nfse-valor-zero.xml", nfse(valor="0.00")
    yield "nfse-valor-texto.xml", nfse(valor="dois mil")
    yield "nfse-cnpj-curto.xml", nfse(cnpj="123")
    yield "nfse-sem-iss.xml", nfse(iss="")
    yield "nfse-raiz-consultar.xml", nfse().replace("CompNfse", "ConsultarNfseResposta")
    # NF-e: campos e recusas
    yield "nfe-sem-protocolo.xml", nfe(prot=False)
    yield "nfe-cstat-150.xml", nfe(cstat="150")
    yield "nfe-cstat-101.xml", nfe(cstat="101")
    yield "nfe-nprot-curto.xml", nfe(nprot="13526000000001")
    yield "nfe-recebimento-invalido.xml", nfe(recbto="ontem")
    yield "nfe-chave-curta.xml", nfe(chave=CHAVE[:-1])
    yield "nfe-chave-diverge.xml", nfe(chprot=CHAVE[:-1] + "8")
    yield "nfe-sem-numero.xml", nfe(numero=" ")
    yield "nfe-cnpj-formatado.xml", nfe(cnpj="99.999.999/0001-91")
    yield "nfe-cnpj-invalido.xml", nfe(cnpj="9999999900019")
    yield "nfe-dest-cpf.xml", nfe(dest="<CPF>12345678909</CPF><xNome>PESSOA FICTICIA</xNome>")
    yield "nfe-dest-vazio.xml", nfe(dest="")
    yield "nfe-sem-serie.xml", nfe(serie="")
    for i, dh in enumerate(["2026-11-05T10:20:30Z", "2026-11-05T10:20:30", "2026-11-05", "2026-11-05T10:20:30+0530",
                            "2026-11-05T10:20:30-03:00:15", "2026-11-05T10:20:30.5-03:00", "2026-02-30T10:00:00-03:00",
                            "2026-11-05T24:00:00-03:00", "2026-11-05T10:20:60-03:00", "2026-11-05T10:20:30+24:00",
                            "2026-11-05t10:20:30-03:00", "2026-11-5T1:2:3-03:00", " 2026-11-05 ", "05/11/2026", "",
                            "2026-11-05T10:20:30-00:00", "2026-11-05T10:20:30 -03:00", "0001-01-01T00:00:00Z"]):
        yield f"nfe-data-{i:02d}.xml", nfe(dh=dh)
    for i, v in enumerate(["0", "-1.00", "1e3", "1_000.50", "NaN", "Infinity", "abc", "", " 12.5 ", "0.001", "١٢٣"]):
        yield f"nfe-valor-{i:02d}.xml", nfe(vnf=v)
    yield "nfe-raiz-NFe.xml", nfe(proc=False)
    yield "nfe-so-infnfe.xml", '<?xml version="1.0"?><lote><infNFe Id="NFe1"/></lote>'
    yield "nfe-sem-infnfe.xml", '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><x/></NFe>'
    yield "nfe-id-sem-prefixo.xml", nfe().replace(f'Id="NFe{CHAVE}"', f'Id="{CHAVE}"')
    # Eventos
    for codigo in ["110110", "110111", "210200", "210210", "210220", "210240", "999999", ""]:
        yield f"evento-{codigo or 'sem-tipo'}.xml", (
            '<procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><evento versao="1.00">'
            f'<infEvento Id="ID{codigo or "0"}{CHAVE}01"><chNFe>{CHAVE}</chNFe><tpEvento>{codigo}</tpEvento></infEvento></evento></procEventoNFe>'
        )
    yield "evento-envevento.xml", "<envEvento><x/></envEvento>"
    yield "evento-solto.xml", "<qualquer><infEvento><tpEvento>110111</tpEvento></infEvento></qualquer>"
    yield "nfelog.xml", "<NFeLog>" + nfe_assinada().split("?>", 1)[1] + "<eveNFe><evento><infEvento><tpEvento>210210</tpEvento></infEvento></evento></eveNFe></NFeLog>"
    # Formato e XML malformado
    yield "formato-desconhecido.xml", "<?xml version='1.0'?><Fatura><Numero>1</Numero></Fatura>"
    yield "dtd.xml", '<!DOCTYPE NFe [<!ENTITY x "valor">]><NFe>&x;</NFe>'
    yield "dtd-minusculo.xml", '<!doctype nfe><NFe/>'
    yield "malformado-tag.xml", "<NFe><infNFe></NFe>"
    yield "malformado-vazio.xml", ""
    yield "malformado-entidade.xml", "<NFe>&nbsp;</NFe>"
    yield "malformado-lixo.xml", "<NFe/>lixo"
    yield "malformado-codificacao.xml", "<?xml version='1.0' encoding='inventada'?><NFe/>"
    yield "malformado-multibyte.xml", "<?xml version='1.0' encoding='shift_jis'?><NFe/>"


def chamadas_xml(xml_parser, certs):
    fixos = []
    for nome, texto in casos_xml(certs):
        if texto is None:
            continue
        if nome.endswith("latin1.xml"):
            dados = texto.encode("latin-1")
        elif nome.endswith("bom.xml"):
            dados = texto.encode("utf-8")
        else:
            dados = texto.encode("utf-8")
        sha = hashlib.sha256(dados).hexdigest()[:12]
        nomes_de_arquivo.setdefault(sha, f"notas-{nome}")
        fixos.append(dados)
        _registrar("xml.parse_nota_xml", xml_parser.parse_nota_xml, [dados])
    # Em UTF-16, com e sem BOM.
    _registrar("xml.parse_nota_xml", xml_parser.parse_nota_xml, [nfe().replace('encoding="UTF-8"', 'encoding="UTF-16"').encode("utf-16-le")])
    _registrar("xml.parse_nota_xml", xml_parser.parse_nota_xml, [nfe().replace('encoding="UTF-8"', 'encoding="UTF-16"').encode("utf-16")])
    for valor in [None, "", "2026-01-15T10:00:00-03:00", "2026-01-15T10:00:00", "2026-01-15", "2026-01-15T10:00:00Z",
                  "2026-01-15T10:00:00z", "2026-01-15T10:00:00+0300", "2026-01-15T10:00:00+03:00:30.5", "2026-01-15T10:00:00+0300:00",
                  "2026-01-15T10:00:00+03:0030", "2026-01-15T10:00:00+24:00", "2026-01-15T10:00:00+23:59", "2026-01-15T10:00:00-00:00",
                  "2026-02-29", "2024-02-29", "1900-02-29", "2000-02-29", "0000-01-01", "2026-1-5", "2026-01- 5", "2026-01-05T 1:02:03",
                  "２０２６-01-05", "2026-01-15T10:00:60", "2026-01-15T10:00:61", "2026-13-01", "2026-01-32", "  2026-01-15  ",
                  "2026-01-15T10:00", "2026-01-15 10:00:00", "2026-01-15T10:00:00.123", "2026-01-15T10:00:00-03:00:00.000001",
                  "2026-01-15T10:00:00-03", "x2026-01-15", "2026-01-15x", "9999-12-31T23:59:59+00:01"]:
        _registrar("xml._parse_datetime", xml_parser._parse_datetime, [valor])
    for valor in [None, "", "12345678000195", "12.345.678/0001-95", "1234567800019", "123456780001955", "１２３４５６７８０００１９５",
                  "12a345678000195", " 12 345 678 0001 95 ", "123.456.789-09", "00000000000000"]:
        _registrar("xml._normalizar_cnpj", xml_parser._normalizar_cnpj, [valor])
    import xml.etree.ElementTree as ET
    for texto in [
        '<NFeLog versao="1.00">  <procNFe><NFe><infNFe Id="NFe123" versao="4.00"/></NFe></procNFe>  <eveNFe><evento><infEvento><tpEvento>210210</tpEvento></infEvento>  </evento></eveNFe></NFeLog>',
        "<procEventoNFe><evento><infEvento><tpEvento>210210</tpEvento></infEvento></evento></procEventoNFe>",
        "<evento/>", "<envEvento/>", "<x><infEvento/></x>", "<x/>", "<a:evento xmlns:a='urn:a'/>",
    ]:
        _registrar("xml._is_evento_nfe", lambda t: xml_parser._is_evento_nfe(ET.fromstring(t)), [texto])
    for conteudo, ref in [
        (b"<NFe><infNFe Id='NFe1'/></NFe>", "NFe1"),
        (b'<NFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><Reference URI="#OUTRA"/></SignedInfo></Signature></NFe>', "NFe1"),
        (b'<NFe><Signature><SignedInfo><Reference/></SignedInfo></Signature></NFe>', "NFe1"),
        (b'<NFe><Signature><SignedInfo><Reference URI="#NFe1"/></SignedInfo><KeyInfo><X509Certificate> </X509Certificate></KeyInfo></Signature></NFe>', "NFe1"),
    ] + [(d, f"NFe{CHAVE}") for d in fixos[:3]]:
        _registrar("xml._validar_assinatura", lambda c, r: xml_parser._validar_assinatura(c, ET.fromstring(c), r), [conteudo, ref])


# ─── Leitor visual: funções puras e cenários ─────────────────────────────────

ITEM = {
    "tipo": "nfe", "numero": "12345", "serie": "1", "cnpj_emitente": "12.345.678/0001-95", "nome_emitente": "EMPRESA LTDA",
    "cnpj_destinatario": "98.765.432/0001-98", "valor": 1500.00, "data_emissao": "05/01/2026",
    "chave_acesso": "35260112345678000195550010000123451234567890",
}


def chamadas_visual(visual):
    respostas = [
        json.dumps(ITEM), "```json\n" + json.dumps(ITEM) + "\n```", "```\n" + json.dumps(ITEM) + "```  ", "[" + json.dumps(ITEM) + "]",
        "[]", "[1, 2]", "42", '"texto"', "null", "", "   ", "não é json", '{"valor": 1.10, "n": 12345678901234567890123}',
        '{"valor": NaN, "x": Infinity, "y": -Infinity}', '{"a": 1, "a": 2}', '{"valor": 1e3, "b": 1E-7, "c": -0.0}',
        '```json {"tipo":"nfse"} ```', 'Aqui está: {"tipo":"nfe"}', '{"tipo":"nfe"}\n```', '\ufeff{"tipo":"nfe"}',
        '{"tipo": "nfe", "valor": "1.234,56"}', '{"x": [1, {"y": 2.50}], "z": {"w": null}}', '{"s": "a\\u00e9\\n\\"b"}',
    ]
    for r in respostas:
        _registrar("visual._parse_ai_response", visual._parse_ai_response, [r])
    D = Decimal
    itens = [
        dict(ITEM), dict(ITEM, tipo="NFSE "), dict(ITEM, tipo=None), dict(ITEM, tipo="nf-e"), dict(ITEM, tipo=0),
        dict(ITEM, numero=None), dict(ITEM, numero=12345), dict(ITEM, numero=D("123.0")), dict(ITEM, numero="  "),
        dict(ITEM, numero=0), dict(ITEM, numero=[1, "a"]), dict(ITEM, numero={"a": D("1.5"), "b": None}), dict(ITEM, numero=True),
        dict(ITEM, cnpj_emitente="12.345.678/0001-00"), dict(ITEM, cnpj_emitente="12345678000195"), dict(ITEM, cnpj_emitente=None),
        dict(ITEM, cnpj_emitente="00.000.000/0000-00"), dict(ITEM, cnpj_emitente=12345678000195), dict(ITEM, cnpj_emitente="１２.３４５.６７８/０００１-９５"),
        dict(ITEM, valor=None), dict(ITEM, valor=D("1500.00")), dict(ITEM, valor=0), dict(ITEM, valor=-5), dict(ITEM, valor="1.234,56"),
        dict(ITEM, valor="1500"), dict(ITEM, valor=" 15.5 "), dict(ITEM, valor=False), dict(ITEM, valor=True), dict(ITEM, valor=float("nan")),
        dict(ITEM, valor=float("inf")), dict(ITEM, valor=D("1E+3")), dict(ITEM, valor=[1]), dict(ITEM, valor="1_000"),
        dict(ITEM, data_emissao=None), dict(ITEM, data_emissao="05/01/26"), dict(ITEM, data_emissao="31/02/2026"),
        dict(ITEM, data_emissao="2026-01-05"), dict(ITEM, data_emissao="05/01/202"), dict(ITEM, data_emissao="05/01/0000"),
        dict(ITEM, data_emissao=" 05/01/2026 10:00"), dict(ITEM, data_emissao="5/1/2026"), dict(ITEM, data_emissao=5012026),
        dict(ITEM, data_emissao="٠٥/٠١/٢٠٢٦"), dict(ITEM, data_emissao="29/02/2024"),
        dict(ITEM, serie="  "), dict(ITEM, serie=None), dict(ITEM, serie=7), dict(ITEM, serie=0),
        dict(ITEM, nome_emitente="  EMPRESA  "), dict(ITEM, nome_emitente=""),
        dict(ITEM, cnpj_destinatario="123.456.789-09"), dict(ITEM, cnpj_destinatario=None), dict(ITEM, cnpj_destinatario="97.531.864/0001-71"),
        dict(ITEM, chave_acesso="123"), dict(ITEM, chave_acesso="3526 0112 3456 7800 0195 5500 1000 0123 4512 3456 7890"),
        dict(ITEM, chave_acesso=None), dict(ITEM, chave_acesso=D("35260112345678000195550010000123451234567890")),
        {}, {"tipo": "nfse", "numero": "9", "cnpj_emitente": "12345678000195", "valor": 1, "data_emissao": "01/12/2025"},
    ]
    for item in itens:
        _registrar("visual._nota_from_item", visual._nota_from_item, [item])
    for v in [None, "", "12.345.678/0001-95", "12345678000195", "12345678000100", "11111111111111", "1234567800019", 0,
              12345678000195, "abc", "12.345.678/0001-95 e mais 1"]:
        _registrar("visual._cnpj_valido_formatado", visual._cnpj_valido_formatado, [v])
    for v in [None, "", "05/01/2026", "05/01/26", "5/1/2026", "31/12/2026 23:59", "00/01/2026", "29/02/2025", "29/02/2024",
              "05-01-2026", 0, D("0"), "٠٥/٠١/٢٠٢٦", "05/01/99", "05/01/0001", " 05/01/2026"]:
        _registrar("visual._parse_data_str", visual._parse_data_str, [v])


class _Segredo:
    def get_secret_value(self):
        return "sk-gabarito"


class _Config:
    def __init__(self, ligada):
        self.openai_enabled = ligada
        self.allow_financial_data_to_openai = ligada
        self.openai_api_key = _Segredo() if ligada else None
        self.pdf_parse_timeout_seconds = 60
        self.pdf_max_pages = 120
        self.pdf_max_ai_calls = 30


def pdf_de_paginas(textos):
    import fitz

    doc = fitz.open()
    for t in textos:
        pagina = doc.new_page()
        if t:
            pagina.insert_text((72, 72), t)
    dados = doc.tobytes()
    doc.close()
    return dados


def png_ficticio():
    import fitz

    doc = fitz.open()
    pagina = doc.new_page(width=120, height=60)
    pagina.insert_text((10, 30), "DANFE")
    dados = pagina.get_pixmap().tobytes("png")
    doc.close()
    return dados


def cenario(visual, nome, conteudo, *, tipo, ligada, respostas, mime="image/png", falha_texto=False):
    """Roda `parse_pdf`/`parse_imagem` com a IA simulada e grava as chamadas e o resultado."""
    import openai

    feitas = []
    filas = {k: list(v) for k, v in respostas.items()}

    class Completions:
        def create(self, *, model, messages, **kw):
            conteudo_user = messages[1]["content"]
            if isinstance(conteudo_user, str):
                feitas.append({"tipo": "texto", "modelo": model, "texto": conteudo_user, "sistema": messages[0]["content"]})
                if falha_texto:
                    raise RuntimeError("falha simulada do provedor")
            else:
                url = conteudo_user[0]["image_url"]["url"]
                feitas.append({"tipo": "visao", "modelo": model, "mime": url.split(";")[0][5:], "prompt": conteudo_user[1]["text"],
                               "detalhe": conteudo_user[0]["image_url"]["detail"], "sistema": messages[0]["content"]})
            fila = filas.get(model) or [""]
            texto = fila.pop(0) if len(fila) > 1 else fila[0]

            class R:
                choices = [type("C", (), {"message": type("M", (), {"content": texto})()})()]

            return R()

    class Cliente:
        def __init__(self, api_key=None):
            self.chat = type("Chat", (), {"completions": Completions()})()

    original_cliente, original_config = openai.OpenAI, visual.get_settings
    openai.OpenAI = Cliente
    visual.get_settings = lambda: _Config(ligada)
    try:
        fn = visual.parse_pdf if tipo == "pdf" else (lambda c: visual.parse_imagem(c, mime))
        args = {"tipo": tipo, "mime": mime, "ia_ligada": ligada, "respostas": respostas, "falha_texto": falha_texto}
        _registrar("visual.cenario", lambda c, a: fn(c), [conteudo, args], extra=lambda e: {"chamadas_ia": list(feitas), "nome": nome})
    finally:
        openai.OpenAI, visual.get_settings = original_cliente, original_config


def cenarios_visual(visual):
    item = json.dumps(ITEM)
    sem_valor = json.dumps(dict(ITEM, valor=None))
    sem_cnpj = json.dumps(dict(ITEM, cnpj_emitente="12.345.678/0001-00"))
    danfe = "NOTA FISCAL ELETRONICA - DANFE " * 5
    png = png_ficticio()
    # Os da suíte do original (`tests/unit/test_notas_visual_parser.py`).
    cenario(visual, "imagem-visao", png, tipo="imagem", ligada=True, respostas={"gpt-4o": [item]})
    cenario(visual, "imagem-desligada", png, tipo="imagem", ligada=False, respostas={})
    cenario(visual, "imagem-incompleta", png, tipo="imagem", ligada=True, respostas={"gpt-4o": [sem_valor]})
    cenario(visual, "pdf-texto", pdf_de_paginas([danfe]), tipo="pdf", ligada=True, respostas={"gpt-4o-mini": [item]})
    cenario(visual, "pdf-em-branco", pdf_de_paginas([""]), tipo="pdf", ligada=True, respostas={"gpt-4o": [item]})
    cenario(visual, "pdf-texto-incompleto", pdf_de_paginas([danfe]), tipo="pdf", ligada=True, respostas={"gpt-4o-mini": [sem_valor], "gpt-4o": [item]})
    cenario(visual, "pdf-desligado", pdf_de_paginas([danfe]), tipo="pdf", ligada=False, respostas={})
    # Os daqui.
    cenario(visual, "imagem-jpeg", png, tipo="imagem", mime="image/jpeg", ligada=True, respostas={"gpt-4o": ["```json\n" + item + "\n```"]})
    cenario(visual, "imagem-lixo", png, tipo="imagem", ligada=True, respostas={"gpt-4o": ["desculpe, não consegui"]})
    cenario(visual, "imagem-cnpj-invalido", png, tipo="imagem", ligada=True, respostas={"gpt-4o": [sem_cnpj]})
    cenario(visual, "pdf-tres-paginas-erram", pdf_de_paginas(["", "", ""]), tipo="pdf", ligada=True,
            respostas={"gpt-4o": [sem_valor, sem_cnpj, "[]"]})
    cenario(visual, "pdf-segunda-pagina", pdf_de_paginas(["", ""]), tipo="pdf", ligada=True, respostas={"gpt-4o": [sem_valor, item]})
    cenario(visual, "pdf-texto-curto", pdf_de_paginas(["DANFE 1"]), tipo="pdf", ligada=True, respostas={"gpt-4o": [item]})
    cenario(visual, "pdf-texto-duas-paginas", pdf_de_paginas(["NOTA FISCAL", "VALOR TOTAL 1.500,00"]), tipo="pdf", ligada=True,
            respostas={"gpt-4o-mini": [item]})
    cenario(visual, "pdf-texto-falha", pdf_de_paginas([danfe]), tipo="pdf", ligada=True, respostas={"gpt-4o": [item]}, falha_texto=True)
    cenario(visual, "pdf-texto-cercado", pdf_de_paginas([danfe]), tipo="pdf", ligada=True, respostas={"gpt-4o-mini": ["```" + item + "```"]})
    cenario(visual, "pdf-chamadas-esgotadas", pdf_de_paginas([""] * 32), tipo="pdf", ligada=True, respostas={"gpt-4o": [sem_valor]})
    cenario(visual, "pdf-paginas-demais", pdf_de_paginas(["x"] * 121), tipo="pdf", ligada=True, respostas={"gpt-4o": [item]})
    cenario(visual, "pdf-desligado-sem-texto", pdf_de_paginas([""]), tipo="pdf", ligada=False, respostas={})
    # PDF que não abre: o original deixa escapar a exceção do PyMuPDF, com a IA ligada ou não (abre antes
    # de conferir a chave). O porte recusa com frase — divergência documentada no teste.
    for nome, dados in (("pdf-sem-objetos", b"%PDF-1.4\n%%EOF"), ("pdf-vazio", b"")):
        for ligada in (True, False):
            cenario(visual, f"{nome}-{'ligada' if ligada else 'desligada'}", dados, tipo="pdf", ligada=ligada, respostas={"gpt-4o": [item]})
    cenario(visual, "pdf-texto-longo", pdf_de_paginas(["LINHA %03d " % i + "X" * 60 for i in range(40)] * 1), tipo="pdf", ligada=True,
            respostas={"gpt-4o-mini": [item]})


def pytest_unconfigure(config):  # noqa: ARG001
    pasta = os.environ.get("GABARITO_PASTA")
    if not pasta:
        return
    xml_parser, visual = _modulos()
    # As chamadas daqui vão direto às funções (os embrulhos da suíte gravariam de novo, sanitizadas).
    for modulo in (xml_parser, visual):
        for nome in dir(modulo):
            fn = getattr(modulo, nome)
            if getattr(fn, "__gabarito__", False):
                setattr(modulo, nome, fn.__wrapped__)
    certs = certificados()
    gerado_em = datetime.now(UTC).replace(microsecond=0)
    chamadas_xml(xml_parser, certs)
    chamadas_visual(visual)
    cenarios_visual(visual)

    for sha, conteudo in conteudos.items():
        nome = nomes_de_arquivo.get(sha)
        if not nome:
            ext = ".pdf" if conteudo[:4] == b"%PDF" else ".png" if conteudo[:4] == b"\x89PNG" else ".xml"
            nome = f"notas-{sha}{ext}"
        nomes_de_arquivo[sha] = nome
        with open(os.path.join(pasta, nome), "wb") as f:
            f.write(conteudo)

    def trocar(v):
        if isinstance(v, dict) and "$arquivo" in v:
            return {"$arquivo": nomes_de_arquivo[v["$arquivo"]]}
        if isinstance(v, list):
            return [trocar(x) for x in v]
        return v

    for r in chamadas.values():
        r["args"] = trocar(r["args"])
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], json.dumps(r["args"], ensure_ascii=False)))
    destino = os.path.join(pasta, "notas-chamadas.json")
    with open(destino, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"gerado_em": gerado_em.isoformat(), "chamadas": registros}, f, ensure_ascii=False, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    print(f"\ngabarito: {len(registros)} chamadas {por_fn} -> {destino}")


# ─── Conferência local ──────────────────────────────────────────────────────

def conferir(saida, arquivos):
    xml_parser, _ = _modulos()
    resultado = {}
    for caminho in arquivos:
        with open(caminho, "rb") as f:
            conteudo = f.read()
        try:
            resultado[caminho] = {"result": codificar(xml_parser.parse_nota_xml(conteudo))}
        except Exception as exc:  # noqa: BLE001
            resultado[caminho] = {"error": {"tipo": type(exc).__name__, "mensagem": str(exc)}}
    with open(saida, "w", encoding="utf-8") as f:
        json.dump({"gerado_em": datetime.now(UTC).replace(microsecond=0).isoformat(), "resultados": resultado}, f, ensure_ascii=False)
    print(f"{len(arquivos)} arquivo(s) -> {saida}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "conferir":
        conferir(sys.argv[2], sys.argv[3:])
    else:
        print(__doc__)
        sys.exit(2)
