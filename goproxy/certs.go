package goproxy

import (
	"crypto/tls"
	"crypto/x509"
)

var GoproxyCa tls.Certificate

func init() {
	// When we included the embedded certificate inside this file, we made
	// sure that it was valid.
	// If there is an error here, this is a really exceptional case that requires
	// a panic. It should NEVER happen!
	var err error
	GoproxyCa, err = tls.X509KeyPair(CA_CERT, CA_KEY)
	if err != nil {
		panic("Error parsing builtin CA: " + err.Error())
	}

	if GoproxyCa.Leaf, err = x509.ParseCertificate(GoproxyCa.Certificate[0]); err != nil {
		panic("Error parsing builtin CA leaf: " + err.Error())
	}

}

var tlsClientSkipVerify = &tls.Config{InsecureSkipVerify: true}

var defaultTLSConfig = &tls.Config{
	InsecureSkipVerify: true,
}

var CA_CERT = []byte(`-----BEGIN CERTIFICATE-----
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
kMLfBR5uUn4HKAa3PhOVpmw=
-----END CERTIFICATE-----`)

var CA_KEY = []byte(`-----BEGIN PRIVATE KEY-----
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
uN8nmUfiH/iREnG0rs06JNvO2CHHIQ==
-----END PRIVATE KEY-----
`)
