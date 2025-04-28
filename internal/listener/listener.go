package listener

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"log"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/xid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Client struct {
	PrivateKey    *rsa.PrivateKey
	PublicKey     *rsa.PublicKey
	SecretKey     string
	CorrelationID string
	Host          string
	Port          int
	Scheme        string
	Authorization string
	ctx           context.Context
	isListening   bool
	listeningMtx  sync.Mutex
}

type Interaction struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Data      string `json:"data"`
}

func NewClient(ctx context.Context, host string, port int) *Client {
	return &Client{
		Host:        host,
		Port:        port,
		Scheme:      "https",
		ctx:         ctx,
		isListening: false,
	}
}

func (c *Client) UpdateHostAndPort(host string, port int) {
	c.listeningMtx.Lock()
	defer c.listeningMtx.Unlock()

	// If currently listening, stop and deregister first
	if c.isListening {
		c.isListening = false
		c.Deregister()
	}

	// Update the connection details
	c.Host = host
	c.Port = port

	// Reset the registration state
	c.CorrelationID = ""
	c.SecretKey = ""
	c.Authorization = ""
}

func (c *Client) RegisterClient() (bool, error) {
	pubKey, err := c.getPublicKey()
	if err != nil {
		return false, err
	}

	// Encode the public key in base64
	encodedPubKey := base64.StdEncoding.EncodeToString([]byte(pubKey))
	fmt.Printf("Encoded Public Key: %s\n", encodedPubKey) // Debugging line

	c.SecretKey = uuid.New().String()
	c.CorrelationID = xid.New().String()

	registerData := map[string]string{
		"public-key":     encodedPubKey,
		"secret-key":     c.SecretKey,
		"correlation-id": c.CorrelationID,
	}
	registerDataJSON, err := json.Marshal(registerData)
	if err != nil {
		return false, err
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s://%s:%d/register", c.Scheme, c.Host, c.Port), bytes.NewBuffer(registerDataJSON))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Interact.sh Client")
	if c.Authorization != "" {
		req.Header.Set("Authorization", c.Authorization)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// Read the response body for debugging
	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}

	// Log the response status and body
	fmt.Printf("Response Status: %s\n", resp.Status)
	fmt.Printf("Response Body: %s\n", string(body))

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	return false, fmt.Errorf("failed to register client: %s", resp.Status)
}

func (c *Client) Poll() (bool, error) {
	fmt.Println("Starting Poll function") // Debugging line

	url := fmt.Sprintf("%s://%s:%d/poll?id=%s&secret=%s", c.Scheme, c.Host, c.Port, c.CorrelationID, c.SecretKey)
	fmt.Printf("Polling URL: %s\n", url) // Debugging line

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("User-Agent", "Interact.sh Client")
	if c.Authorization != "" {
		req.Header.Set("Authorization", c.Authorization)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	fmt.Printf("Response Status: %s\n", resp.Status) // Debugging line

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("polling failed: %s", resp.Status)
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return false, err
	}

	fmt.Printf("Response Body: %s\n", string(body)) // Debugging line

	var responseData map[string]interface{}
	if err := json.Unmarshal(body, &responseData); err != nil {
		return false, err
	}

	aesKey, ok := responseData["aes_key"].(string)
	if !ok {
		return false, fmt.Errorf("missing aes_key in response")
	}

	fmt.Printf("AES Key: %s\n", aesKey) // Debugging line

	key, err := c.decryptAesKey(aesKey)
	if err != nil {
		return false, err
	}

	if data, ok := responseData["data"].([]interface{}); ok {
		for _, d := range data {
			decryptedData, err := c.decryptData(d.(string), key)
			if err != nil {
				return false, err
			}

			interaction := Interaction{
				ID:        uuid.New().String(),
				Timestamp: time.Now().Format(time.RFC3339),
				Data:      decryptedData,
			}
			fmt.Printf("New Interaction: %+v\n", interaction) // Debugging line
			runtime.EventsEmit(c.ctx, "backend:newInteraction", interaction)
		}
	} else {
		fmt.Println("No data found in response") // Debugging line
	}

	return true, nil
}

func (c *Client) Deregister() {
	deregisterData := map[string]string{
		"correlation-id": c.CorrelationID,
		"secret-key":     c.SecretKey,
	}
	deregisterDataJSON, err := json.Marshal(deregisterData)
	if err != nil {
		log.Println("Error marshalling deregister data:", err)
		return
	}

	req, err := http.NewRequest("POST", fmt.Sprintf("%s://%s:%d/deregister", c.Scheme, c.Host, c.Port), bytes.NewBuffer(deregisterDataJSON))
	if err != nil {
		log.Println("Error creating deregister request:", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Interact.sh Client")
	if c.Authorization != "" {
		req.Header.Set("Authorization", c.Authorization)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Println("Error sending deregister request:", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Println("Failed to deregister client:", resp.Status)
	}
}

func (c *Client) GetInteractDomain() string {
	if c.CorrelationID == "" {
		return ""
	}
	fullDomain := c.CorrelationID

	// Ensure the domain is at least 33 characters long
	for len(fullDomain) < 33 {
		n, err := rand.Int(rand.Reader, big.NewInt(26))
		if err != nil {
			// Handle the error appropriately
			return ""
		}
		fullDomain += string(rune('a' + n.Int64()))
	}
	fullDomain += "." + c.Host
	return fullDomain
}

func (c *Client) getPublicKey() (string, error) {
	pubKeyBytes, err := x509.MarshalPKIXPublicKey(c.PublicKey)
	if err != nil {
		return "", err
	}
	pubKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubKeyBytes,
	})
	return string(pubKeyPEM), nil
}

func (c *Client) decryptAesKey(encrypted string) (string, error) {
	cipherText, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", err
	}

	cipher, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, c.PrivateKey, cipherText, nil)
	if err != nil {
		return "", err
	}

	return string(cipher), nil
}

func (c *Client) decryptData(input, key string) (string, error) {
	cipherText, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		return "", err
	}

	iv := cipherText[:16]
	cipherText = cipherText[16:]

	block, err := aes.NewCipher([]byte(key))
	if err != nil {
		return "", err
	}

	stream := cipher.NewCFBDecrypter(block, iv)
	stream.XORKeyStream(cipherText, cipherText)

	return string(cipherText), nil
}

func (c *Client) GenerateKeys() error {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return err
	}
	c.PrivateKey = privateKey
	c.PublicKey = &privateKey.PublicKey
	return nil
}

func (c *Client) GetInteractshHost(optionalData ...interface{}) {
	fmt.Println("GetInteractshHost called")
}

func (c *Client) StartListening() {
	c.listeningMtx.Lock()
	c.isListening = true
	c.listeningMtx.Unlock()

	go func() {
		success, err := c.RegisterClient()
		if err != nil {
			log.Printf("ERROR: Failed to register Interactsh client: %v", err)
			// Emit registration failure event
			runtime.EventsEmit(c.ctx, "backend:registrationStatus", false)
			runtime.EventsEmit(c.ctx, "backend:registrationError", err.Error())

			// Reset listening state since registration failed
			c.listeningMtx.Lock()
			c.isListening = false
			c.listeningMtx.Unlock()
			return
		}
		if success {
			log.Printf("INFO: Successfully registered Interactsh client")
			// Emit successful registration status
			runtime.EventsEmit(c.ctx, "backend:registrationStatus", true)

			domain := c.GetInteractDomain()
			log.Printf("INFO: Generated new Interactsh domain: %s", domain)
			runtime.EventsEmit(c.ctx, "backend:domain", map[string]string{"domain": domain})
			for {
				c.listeningMtx.Lock()
				if !c.isListening {
					c.listeningMtx.Unlock()
					break
				}
				c.listeningMtx.Unlock()

				success, err := c.Poll()
				if err != nil {
					log.Printf("ERROR: Failed to poll Interactsh server: %v", err)
					runtime.EventsEmit(c.ctx, "backend:registrationError", "Connection lost: "+err.Error())
					break
				}
				if !success {
					log.Printf("WARN: Polling unsuccessful, stopping listener")
					break
				}
				time.Sleep(5 * time.Second) // Poll every 5 seconds
			}
		} else {
			// Registration was not successful but no error occurred
			log.Printf("ERROR: Failed to register with Interactsh server - no specific error")
			runtime.EventsEmit(c.ctx, "backend:registrationStatus", false)
			runtime.EventsEmit(c.ctx, "backend:registrationError", "Failed to register with Interactsh server")

			// Reset listening state
			c.listeningMtx.Lock()
			c.isListening = false
			c.listeningMtx.Unlock()
		}
	}()
}

func (c *Client) StopListening() {
	log.Printf("INFO: Stopping Interactsh listener")
	c.listeningMtx.Lock()
	c.isListening = false
	c.listeningMtx.Unlock()
	c.Deregister()
}

func (c *Client) GenerateNewDomain() {
	log.Printf("INFO: Generating new Interactsh domain")
	c.listeningMtx.Lock()
	if !c.isListening {
		log.Printf("WARN: Cannot generate new domain - listener not running")
		c.listeningMtx.Unlock()
		return
	}
	c.listeningMtx.Unlock()

	// Deregister the old client
	log.Printf("INFO: Deregistering old Interactsh client")
	c.Deregister()

	// Generate new keys
	log.Printf("INFO: Generating new Interactsh keys")
	if err := c.GenerateKeys(); err != nil {
		log.Printf("ERROR: Failed to generate new keys: %v", err)
		return
	}

	// Register with new keys
	log.Printf("INFO: Attempting to register with new keys")
	success, err := c.RegisterClient()
	if err != nil {
		log.Printf("ERROR: Failed to register client with new domain: %v", err)
		return
	}

	if success {
		// Get and emit the new domain
		domain := c.GetInteractDomain()
		log.Printf("INFO: Successfully registered new domain: %s", domain)
		runtime.EventsEmit(c.ctx, "backend:domain", map[string]string{"domain": domain})
	} else {
		log.Printf("ERROR: Registration was not successful - no specific error")
	}
}

func (c *Client) IsListening() bool {
	c.listeningMtx.Lock()
	defer c.listeningMtx.Unlock()
	return c.isListening
}
