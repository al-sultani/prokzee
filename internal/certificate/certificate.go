package certificate

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

// CertificateManager handles all certificate-related operations
type CertificateManager struct {
	CaCert    *x509.Certificate
	CaTLSCert tls.Certificate
}

// NewCertificateManager creates a new CertificateManager instance
func NewCertificateManager() *CertificateManager {
	return &CertificateManager{}
}

// generateCA generates a self-signed CA certificate and key
func generateCA() (*x509.Certificate, *rsa.PrivateKey, error) {
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, nil, err
	}

	caCertTemplate := &x509.Certificate{
		SerialNumber: big.NewInt(16877104),
		Subject: pkix.Name{
			Country:            []string{"UK"},
			Province:           []string{"London"},
			Locality:           []string{"ProKZee"},
			Organization:       []string{"ProKZee"},
			OrganizationalUnit: []string{"ProKZee CA"},
			CommonName:         "ProKZee CA",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour), // 10 years
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	caCertDER, err := x509.CreateCertificate(rand.Reader, caCertTemplate, caCertTemplate, &caKey.PublicKey, caKey)
	if err != nil {
		return nil, nil, err
	}

	caCert, err := x509.ParseCertificate(caCertDER)
	if err != nil {
		return nil, nil, err
	}

	return caCert, caKey, nil
}

// saveCertAndKey saves the certificate and key to files
func saveCertAndKey(certPath string, keyPath string, caCert *x509.Certificate, caKey *rsa.PrivateKey) error {
	// Save the root CA certificate to a file
	caCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCert.Raw})
	err := os.WriteFile(certPath, caCertPEM, 0644)
	if err != nil {
		return fmt.Errorf("failed to save root CA certificate: %v", err)
	}

	// Save the root CA key to a file
	caKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(caKey)})
	err = os.WriteFile(keyPath, caKeyPEM, 0600)
	if err != nil {
		return fmt.Errorf("failed to save root CA key: %v", err)
	}

	return nil
}

// SetupCertificates checks if certificate files exist, and if not, generates new ones
func (cm *CertificateManager) SetupCertificates() error {
	// Get the appropriate directory for storing certificates
	certDir, err := os.UserConfigDir()
	if err != nil {
		// Fall back to home directory if config dir isn't available
		certDir, err = os.UserHomeDir()
		if err != nil {
			// As a last resort, use current directory
			certDir = "."
		}
	}

	// Create a dedicated app data directory for certificates
	certDir = filepath.Join(certDir, "ProKZee", "certs")

	// Create the directory if it doesn't exist
	if err := os.MkdirAll(certDir, 0755); err != nil {
		log.Printf("Failed to create certificate directory, using current directory: %v", err)
		certDir = "."
	}

	certPath := filepath.Join(certDir, "rootCA.pem")
	keyPath := filepath.Join(certDir, "rootCA-key.pem")

	log.Printf("Using certificate path: %s", certPath)
	log.Printf("Using key path: %s", keyPath)

	// Check if certificate files exist
	_, certErr := os.Stat(certPath)
	_, keyErr := os.Stat(keyPath)

	if os.IsNotExist(certErr) || os.IsNotExist(keyErr) {
		// One or both files don't exist, generate new certificates
		log.Println("Certificate files not found. Generating new CA certificate...")

		caCert, caKey, err := generateCA()
		if err != nil {
			return fmt.Errorf("failed to generate CA certificate: %v", err)
		}

		// Save the CA certificate and key to files
		err = saveCertAndKey(certPath, keyPath, caCert, caKey)
		if err != nil {
			return fmt.Errorf("failed to save CA certificate and key: %v", err)
		}

		cm.CaCert = caCert
		cm.CaTLSCert = tls.Certificate{
			Certificate: [][]byte{caCert.Raw},
			PrivateKey:  caKey,
			Leaf:        caCert,
		}
	} else {
		// Load existing certificate and key
		certPEM, err := os.ReadFile(certPath)
		if err != nil {
			return fmt.Errorf("failed to read CA certificate: %v", err)
		}

		keyPEM, err := os.ReadFile(keyPath)
		if err != nil {
			return fmt.Errorf("failed to read CA key: %v", err)
		}

		// Parse the certificate
		cert, err := tls.X509KeyPair(certPEM, keyPEM)
		if err != nil {
			return fmt.Errorf("failed to parse X509 key pair: %v", err)
		}

		// Parse the certificate for the leaf
		cm.CaCert, err = x509.ParseCertificate(cert.Certificate[0])
		if err != nil {
			return fmt.Errorf("failed to parse CA certificate: %v", err)
		}

		cm.CaTLSCert = cert
		cm.CaTLSCert.Leaf = cm.CaCert
	}

	return nil
}

// GetCertificate returns the CA certificate
func (cm *CertificateManager) GetCertificate() *x509.Certificate {
	return cm.CaCert
}

// GetTLSCertificate returns the TLS certificate
func (cm *CertificateManager) GetTLSCertificate() tls.Certificate {
	return cm.CaTLSCert
}
