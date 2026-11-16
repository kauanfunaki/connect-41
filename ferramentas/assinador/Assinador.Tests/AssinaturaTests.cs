using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Xml;
using System.Xml.Schema;
using Xunit;

namespace Assinador.Tests;

public class AssinaturaTests
{
    /// <summary>Um certificado de teste no padrão ICP-Brasil de e-CNPJ no CN ("EMPRESA:CNPJ").</summary>
    private static X509Certificate2 CertificadoDeTeste()
    {
        using var rsa = RSA.Create(2048);
        var pedido = new CertificateRequest("CN=PANIFICADORA TESTE LTDA:48291730000115", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        var c = pedido.CreateSelfSigned(DateTimeOffset.Now.AddDays(-1), DateTimeOffset.Now.AddDays(30));
        return X509CertificateLoader.LoadPkcs12(c.Export(X509ContentType.Pfx), null);
    }

    private static void ValidarNoXsd(XmlDocument doc, string arquivo)
    {
        var esquemas = new XmlSchemaSet();
        var pasta = Path.Combine(AppContext.BaseDirectory, "xsd");
        using (var ds = XmlReader.Create(Path.Combine(pasta, "xmldsig-core-schema.xsd"), new XmlReaderSettings { DtdProcessing = DtdProcessing.Parse }))
            esquemas.Add("http://www.w3.org/2000/09/xmldsig#", ds);
        esquemas.Add(null, Path.Combine(pasta, arquivo));
        var erros = new List<string>();
        doc.Schemas = esquemas;
        doc.Validate((_, e) => erros.Add(e.Message));
        Assert.Empty(erros);
    }

    [Fact]
    public void Consulta_do_trabalhador_assinada_passa_no_xsd_oficial_e_na_conferencia()
    {
        using var cert = CertificadoDeTeste();
        var xml = ClienteEsocial.XmlDaConsultaTrabalhador("48291730", "52998224725", new DateTime(2025, 1, 20), new DateTime(2025, 2, 19, 23, 59, 59));
        var doc = AssinaturaXml.Assinar(xml, cert);

        ValidarNoXsd(doc, "ConsultaIdentificadoresEventosTrabalhador-v1_0_0.xsd");
        Assert.True(AssinaturaXml.Conferir(doc));

        var s = doc.OuterXml;
        Assert.Contains("http://www.w3.org/2001/04/xmldsig-more#rsa-sha256", s);
        Assert.Contains("http://www.w3.org/2001/04/xmlenc#sha256", s);
        Assert.Contains("<Reference URI=\"\">", s);
        Assert.Contains("http://www.w3.org/2000/09/xmldsig#enveloped-signature", s);
        Assert.Contains("<X509Certificate>", s);
        Assert.DoesNotContain("<X509IssuerSerial>", s);
        Assert.Contains("<dtIni>2025-01-20T00:00:00</dtIni>", s);
    }

    [Fact]
    public void Download_por_id_assinado_passa_no_xsd_oficial()
    {
        using var cert = CertificadoDeTeste();
        var xml = ClienteEsocial.XmlDoDownloadPorId("48291730", ["ID1482917300000002025012010000000001", "ID1482917300000002025012010000000002"]);
        var doc = AssinaturaXml.Assinar(xml, cert);
        ValidarNoXsd(doc, "SolicitacaoDownloadEventosPorId-v1_0_0.xsd");
        Assert.True(AssinaturaXml.Conferir(doc));
    }

    [Fact]
    public void Xml_alterado_depois_da_assinatura_nao_confere()
    {
        using var cert = CertificadoDeTeste();
        var doc = AssinaturaXml.Assinar(ClienteEsocial.XmlDaConsultaTrabalhador("48291730", "52998224725", new DateTime(2025, 1, 1), new DateTime(2025, 1, 30)), cert);
        doc.DocumentElement!.InnerXml = doc.DocumentElement.InnerXml.Replace("52998224725", "11144477735");
        Assert.False(AssinaturaXml.Conferir(doc));
    }

    [Fact]
    public void Envelope_soap_segue_o_wsdl()
    {
        var env = ClienteEsocial.Envelope("http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0", "ConsultarIdentificadoresEventosTrabalhador", "consultaEventosTrabalhador", "<eSocial/>");
        Assert.Contains("<v1:ConsultarIdentificadoresEventosTrabalhador><v1:consultaEventosTrabalhador><eSocial/></v1:consultaEventosTrabalhador>", env);
        Assert.Contains("http://schemas.xmlsoap.org/soap/envelope/", env);
    }

    [Fact]
    public void Le_o_retorno_da_consulta()
    {
        const string soap = """
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>
            <ConsultarIdentificadoresEventosTrabalhadorResponse xmlns="http://www.esocial.gov.br/servicos/empregador/consulta/identificadores-eventos/v1_0_0">
            <ConsultarIdentificadoresEventosTrabalhadorResult>
            <eSocial xmlns="http://www.esocial.gov.br/schema/consulta/identificadores-eventos/retorno/v1_0_0">
              <retornoConsultaIdentificadoresEvts>
                <status><cdResposta>200</cdResposta><descResposta>Sucesso.</descResposta></status>
                <retornoIdentificadoresEvts>
                  <qtdeTotEvtsConsulta>2</qtdeTotEvtsConsulta>
                  <dhUltimoEvtRetornado>2025-01-21T10:00:00</dhUltimoEvtRetornado>
                  <identificadoresEvts>
                    <identificadorEvt><id>ID1</id><nrRec>1.2.0000000000000000001</nrRec></identificadorEvt>
                    <identificadorEvt><id>ID2</id><nrRec>1.2.0000000000000000002</nrRec></identificadorEvt>
                  </identificadoresEvts>
                </retornoIdentificadoresEvts>
              </retornoConsultaIdentificadoresEvts>
            </eSocial>
            </ConsultarIdentificadoresEventosTrabalhadorResult></ConsultarIdentificadoresEventosTrabalhadorResponse>
            </s:Body></s:Envelope>
            """;
        var r = ClienteEsocial.LerConsulta(soap);
        Assert.Equal(200, r.CdResposta);
        Assert.Equal(2, r.QtdeTotal);
        Assert.Equal(["ID1", "ID2"], r.Identificadores.Select(i => i.Id));
    }

    [Fact]
    public void Documento_do_titular_pelo_cn()
    {
        using var cert = CertificadoDeTeste();
        Assert.Equal("48291730000115", Certificados.Documento(cert));
        Assert.Equal("48291730", ClienteEsocial.Raiz("48.291.730/0001-15"));
    }

    [Fact]
    public async Task Periodo_maior_que_31_dias_e_recusado_antes_de_chamar_o_esocial()
    {
        using var cert = CertificadoDeTeste();
        var e = await Assert.ThrowsAsync<ErroParaOConnect>(() =>
            ClienteEsocial.ConsultarTrabalhador(cert, "48291730000115", "52998224725", new DateTime(2025, 1, 1), new DateTime(2025, 3, 1), restrita: true, CancellationToken.None));
        Assert.Contains("31 dias", e.Message);
    }
}
