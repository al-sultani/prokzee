package intercept

import (
	"context"
	"crypto/tls"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Interceptor struct {
	ctx context.Context
}

func (i *Interceptor) ForwardRequest(data map[string]interface{}) {
	url, ok := data["url"].(string)
	if !ok {
		log.Println("Invalid or missing URL")
		return
	}

	method, ok := data["method"].(string)
	if !ok {
		method = "GET"
	}

	protocolVersion, ok := data["protocolVersion"].(string)
	if !ok || protocolVersion == "" {
		protocolVersion = "HTTP/1.1"
	}

	headers, ok := data["headers"].(map[string]interface{})
	if !ok {
		headers = make(map[string]interface{})
	}

	body, ok := data["body"].(string)
	if !ok {
		body = ""
	}

	// Create the request
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		log.Printf("Error creating request: %v", err)
		runtime.EventsEmit(i.ctx, "backend:interceptResponse", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	// Set the protocol version
	req.Proto = protocolVersion
	req.ProtoMajor = 1
	req.ProtoMinor = 1
	if protocolVersion == "HTTP/2.0" {
		req.ProtoMajor = 2
		req.ProtoMinor = 0
	}

	// Set headers
	for key, value := range headers {
		if strValue, ok := value.(string); ok {
			req.Header.Set(key, strValue)
		}
	}

	// Create a custom transport based on the requested protocol version
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	// Disable HTTP/2 if HTTP/1.1 is requested
	if protocolVersion == "HTTP/1.1" {
		transport.TLSNextProto = make(map[string]func(authority string, c *tls.Conn) http.RoundTripper)
	}

	client := &http.Client{
		Transport: transport,
	}

	// Send the request
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Error sending request: %v", err)
		runtime.EventsEmit(i.ctx, "backend:interceptResponse", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading response body: %v", err)
		runtime.EventsEmit(i.ctx, "backend:interceptResponse", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	// Convert response headers to map
	respHeaders := make(map[string][]string)
	for k, v := range resp.Header {
		respHeaders[k] = v
	}

	// Send response back to frontend
	runtime.EventsEmit(i.ctx, "backend:interceptResponse", map[string]interface{}{
		"statusCode":      resp.StatusCode,
		"statusText":      http.StatusText(resp.StatusCode),
		"headers":         respHeaders,
		"body":            string(respBody),
		"protocolVersion": resp.Proto,
	})
}
