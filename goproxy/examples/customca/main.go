package main

import (
	"crypto/tls"
	"crypto/x509"
	"flag"
	"log"
	"net/http"

	"github.com/elazarl/goproxy"
)

var _caCert = []byte(`-----BEGIN CERTIFICATE-----
MIIGDTCCAQkqhkiG9w0BAQEFAASCCSwwggkoAgEAAoICAQDTRtbNMKqBahhHOb9s
n8U4F7Ou4Mcyei3Mn15GBXb/Lu/ESIa644TTd1COnWv6A7kXdB+azMchCaQwdmOm
// ... existing code ...
-----END CERTIFICATE-----`)

var _caKey = []byte(`-----BEGIN PRIVATE KEY-----
MIIJQgIBADANBgkqhkiG9w0BAQEFAASCCSwwggkoAgEAAoICAQDTRtbNMKqBahhH
// ... existing code ...
-----END PRIVATE KEY-----`)

func main() {
	verbose := flag.Bool("v", false, "should every proxy request be logged to stdout")
	addr := flag.String("addr", ":8080", "proxy listen address")
	flag.Parse()

	// Parse the CA certificate and private key
	cert, err := parseCA(_caCert, _caKey)
	if err != nil {
		log.Fatal(err)
	}

	// Create a new proxy server
	proxy := goproxy.NewProxyHttpServer()
	proxy.Verbose = *verbose

	// Configure the proxy to use our custom CA for MITM
	customCaMitm := &goproxy.ConnectAction{
		Action:    goproxy.ConnectMitm,
		TLSConfig: goproxy.TLSConfigFromCA(cert),
	}

	// Set up the HTTPS handler to always use our custom CA
	var customAlwaysMitm goproxy.FuncHttpsHandler = func(host string, ctx *goproxy.ProxyCtx) (*goproxy.ConnectAction, string) {
		return customCaMitm, host
	}

	// Configure the proxy to handle HTTPS connections
	proxy.OnRequest().HandleConnect(customAlwaysMitm)

	log.Printf("Starting proxy server on %s", *addr)
	log.Fatal(http.ListenAndServe(*addr, proxy))
}

func parseCA(caCert, caKey []byte) (*tls.Certificate, error) {
	// Parse the certificate pair
	cert, err := tls.X509KeyPair(caCert, caKey)
	if err != nil {
		return nil, err
	}

	// Parse the x509 certificate for the leaf
	if cert.Leaf, err = x509.ParseCertificate(cert.Certificate[0]); err != nil {
		return nil, err
	}

	return &cert, nil
}
