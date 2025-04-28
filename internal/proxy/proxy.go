package proxy

import (
	"bytes"
	"context"
	"encoding/pem"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"prokzee/internal/certificate"

	"crypto/tls"

	"github.com/elazarl/goproxy"
	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Proxy struct holds all proxy-related fields and functionality
type Proxy struct {
	ApprovalChs       map[string]chan ApprovalResponse
	ApprovalChsM      sync.Mutex
	PendingRequests   map[string]*http.Request
	PendingRequestsM  sync.Mutex
	ActiveRequests    map[int]context.CancelFunc
	CertManager       *certificate.CertificateManager
	InterceptionOn    bool
	InterceptionMtx   sync.Mutex
	ProxyServer       *goproxy.ProxyHttpServer
	server            *http.Server
	proxyIsListening  bool
	proxyListeningMtx sync.Mutex
}

// ApprovalResponse represents the response from the frontend for request approval
type ApprovalResponse struct {
	Approved        bool
	Headers         http.Header
	Body            string
	Method          string
	ProtocolVersion string
	URL             string
	RequestID       string
}

// NewProxy creates a new Proxy instance
func NewProxy() *Proxy {
	return &Proxy{
		ApprovalChs:      make(map[string]chan ApprovalResponse),
		PendingRequests:  make(map[string]*http.Request),
		ActiveRequests:   make(map[int]context.CancelFunc),
		InterceptionOn:   true,
		proxyIsListening: false,
		ProxyServer:      goproxy.NewProxyHttpServer(),
		CertManager:      certificate.NewCertificateManager(),
	}
}

// SetupCertificates sets up the certificates using the certificate manager
func (p *Proxy) SetupCertificates() error {
	err := p.CertManager.SetupCertificates()
	if err != nil {
		// Provide more detailed error messages for Windows users
		if runtime.GOOS == "windows" {
			return fmt.Errorf("failed to setup certificates on Windows: %v\nYou may need to run the application as administrator the first time, or check your user permissions", err)
		}
		return fmt.Errorf("failed to setup certificates: %v", err)
	}
	return nil
}

// StartServer starts the proxy server on the specified port
func (p *Proxy) StartServer(port string) error {
	p.proxyListeningMtx.Lock()
	p.proxyIsListening = true
	p.proxyListeningMtx.Unlock()

	p.server = &http.Server{
		Addr:    ":" + port,
		Handler: p.ProxyServer,
	}

	log.Printf("Starting HTTPS proxy server on :%s", port)
	go func() {
		if err := p.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("ListenAndServe(): %v", err)
		}
	}()

	return nil
}

// StopServer stops the proxy server
func (p *Proxy) StopServer() error {
	p.proxyListeningMtx.Lock()
	defer p.proxyListeningMtx.Unlock()

	if p.proxyIsListening {
		p.proxyIsListening = false
		log.Println("Stopping HTTPS proxy server")
		if p.server != nil {
			if err := p.server.Shutdown(context.Background()); err != nil {
				return fmt.Errorf("HTTP server Shutdown: %v", err)
			}
		}
	}

	return nil
}

// SetupHandlers configures the proxy request handlers for certificate serving and HTTPS MITM
func (p *Proxy) SetupHandlers() {
	// Handler for prokzee domain to serve root CA
	p.ProxyServer.OnRequest(goproxy.DstHostIs("prokzee")).DoFunc(
		func(req *http.Request, ctx *goproxy.ProxyCtx) (*http.Request, *http.Response) {
			if req.URL.Path == "/" {
				return req, goproxy.NewResponse(req, goproxy.ContentTypeHtml, http.StatusOK, CertificateDownloadPage)
			} else if req.URL.Path == "/rootCA.pem" || req.URL.Path == "/rootCA.crt" || req.URL.Path == "/rootCA.cer" {
				caCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: p.CertManager.GetCertificate().Raw})
				// For .pem format, serve as application/x-x509-ca-cert
				// For .crt and .cer format, serve as application/x-x509-ca-cert (same content)
				return req, goproxy.NewResponse(req, "application/x-x509-ca-cert", http.StatusOK, string(caCertPEM))
			} else if req.URL.Path == "/appicon.png" {
				iconData, err := os.ReadFile("frontend/src/assets/images/appicon.png")
				if err != nil {
					return req, p.CreateErrorResponse(req, http.StatusInternalServerError, "Failed to read app icon")
				}
				return req, goproxy.NewResponse(req, "image/png", http.StatusOK, string(iconData))
			}
			return req, p.CreateErrorResponse(req, http.StatusNotFound, "Not Found")
		})

	// Configure HTTPS MITM
	p.ProxyServer.OnRequest().HandleConnect(goproxy.FuncHttpsHandler(func(host string, ctx *goproxy.ProxyCtx) (*goproxy.ConnectAction, string) {
		// Skip MITM for WebSocket connections
		if ctx.Req != nil && isWebSocketHandshake(ctx.Req.Header) {
			return goproxy.OkConnect, host
		}

		// Create a custom MITM action with our CA certificate
		tlsCert := p.CertManager.GetTLSCertificate()
		customCaMitm := &goproxy.ConnectAction{
			Action:    goproxy.ConnectMitm,
			TLSConfig: goproxy.TLSConfigFromCA(&tlsCert),
		}

		// Always return the host with the action to ensure proper routing
		return customCaMitm, host
	}))
}

// ToggleInterception toggles the interception state
func (p *Proxy) ToggleInterception() bool {
	p.InterceptionMtx.Lock()
	p.InterceptionOn = !p.InterceptionOn
	newState := p.InterceptionOn
	p.InterceptionMtx.Unlock()

	// If turning off interception, approve all pending requests
	if !newState {
		p.ApprovalChsM.Lock()
		p.PendingRequestsM.Lock()

		// Create a copy of the maps to iterate over
		approvalChsCopy := make(map[string]chan ApprovalResponse)
		pendingRequestsCopy := make(map[string]*http.Request)
		for k, v := range p.ApprovalChs {
			approvalChsCopy[k] = v
		}
		for k, v := range p.PendingRequests {
			pendingRequestsCopy[k] = v
		}

		// Clear the maps
		p.ApprovalChs = make(map[string]chan ApprovalResponse)
		p.PendingRequests = make(map[string]*http.Request)

		p.PendingRequestsM.Unlock()
		p.ApprovalChsM.Unlock()

		// Process all pending requests
		for requestID, ch := range approvalChsCopy {
			if req, ok := pendingRequestsCopy[requestID]; ok {
				// Create approval response from the original request
				response := ApprovalResponse{
					Approved:        true,
					Headers:         req.Header,
					Method:          req.Method,
					ProtocolVersion: req.Proto,
					URL:             req.URL.String(),
					RequestID:       requestID,
				}

				// Try to send the response with a short timeout
				select {
				case ch <- response:
					log.Printf("Successfully forwarded request %s when turning off interception", requestID)
				case <-time.After(100 * time.Millisecond):
					log.Printf("Could not send approval for request %s, channel may be closed", requestID)
				}
			}
		}
	}

	return newState
}

// GetInterceptionState returns the current interception state
func (p *Proxy) GetInterceptionState() bool {
	p.InterceptionMtx.Lock()
	state := p.InterceptionOn
	p.InterceptionMtx.Unlock()
	return state
}

// CreateErrorResponse creates an HTML error response
func (p *Proxy) CreateErrorResponse(req *http.Request, statusCode int, errorMessage string) *http.Response {
	html := fmt.Sprintf(ErrorResponseTemplate, errorMessage, req.URL.String())
	return goproxy.NewResponse(req, goproxy.ContentTypeHtml, statusCode, html)
}

// Helper function to check if a request is a WebSocket handshake
func isWebSocketHandshake(header http.Header) bool {
	return headerContains(header, "Connection", "Upgrade") &&
		headerContains(header, "Upgrade", "websocket")
}

// Helper function to check if a header contains a value
func headerContains(header http.Header, name string, value string) bool {
	for _, v := range header[name] {
		for _, s := range strings.Split(v, ",") {
			if strings.EqualFold(value, strings.TrimSpace(s)) {
				return true
			}
		}
	}
	return false
}

// RequestHandler is a function type for handling proxy requests
type RequestHandler func(*http.Request)

// ResponseHandler is a function type for handling proxy responses
type ResponseHandler func(*http.Request, *http.Response)

// UserData holds request-specific data
type UserData struct {
	RequestID         string
	BodyBytes         []byte
	requestProcessed  bool
	responseProcessed bool
}

// HandleRequest sets up the request interception handler
func (p *Proxy) HandleRequest(ctx context.Context, scopeClient ScopeClient, matchReplaceClient MatchReplaceClient, rulesClient RulesClient, logger Logger, requestHandler RequestHandler) {
	log.Printf("DEBUG: Setting up request handler")
	p.ProxyServer.OnRequest().DoFunc(func(req *http.Request, proxyCtx *goproxy.ProxyCtx) (*http.Request, *http.Response) {
		// Initialize ctx.UserData if it's nil
		if proxyCtx.UserData == nil {
			proxyCtx.UserData = &UserData{}
		}

		userData, ok := proxyCtx.UserData.(*UserData)
		if !ok || userData.requestProcessed {
			return req, nil
		}
		userData.requestProcessed = true

		log.Printf("DEBUG: Proxy request handler called for URL: %s", req.URL.String())

		// Check for WebSocket requests first and bypass them completely
		if isWebSocketHandshake(req.Header) {
			// logger.LogMessage("info", fmt.Sprintf("WebSocket request bypassed: %s", req.URL.String()), "ProxyServer")
			return req, nil
		}

		log.Printf("DEBUG: Handling request for URL: %s", req.URL.String())
		log.Printf("DEBUG: Request headers before: %+v", req.Header)

		// Initialize headers if nil
		if req.Header == nil {
			log.Printf("DEBUG: Headers were nil, initializing")
			req.Header = make(http.Header)
		}

		// Only set Connection: close for non-websocket requests
		if !isWebSocketHandshake(req.Header) {
			log.Printf("DEBUG: Setting Connection header")
			req.Header.Set("Connection", "close")
		}

		log.Printf("DEBUG: Request headers after: %+v", req.Header)

		// Call the request handler for ALL requests, regardless of scope or rules
		requestHandler(req)

		p.InterceptionMtx.Lock()
		interceptionOn := p.InterceptionOn
		p.InterceptionMtx.Unlock()

		// If interception is off, just pass through the request without modification
		if !interceptionOn {
			// logger.LogMessage("info", fmt.Sprintf("Request bypassed (interception off): %s", req.URL.String()), "ProxyServer")
			return req, nil
		}

		// Create a custom transport based on the requested protocol version
		transport := &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true,
			},
		}

		// Disable HTTP/2 if HTTP/1.1 is requested
		if req.Proto == "HTTP/1.1" {
			transport.TLSNextProto = make(map[string]func(authority string, c *tls.Conn) http.RoundTripper)
		}

		// Set the transport on the proxy server
		p.ProxyServer.Tr = transport

		// Check if the request should be intercepted based on scope and rules
		host := req.Host
		log.Printf("Proxy checking scope for host: %s (from URL: %s)", host, req.URL.String())

		shouldIntercept := scopeClient.IsInScope(host)
		if !shouldIntercept {
			//logger.LogMessage("info", fmt.Sprintf("Request URL %s is out of scope, bypassing interception", host), "ProxyServer")
			log.Printf("Host %s is out of scope, bypassing interception", host)
			return req, nil
		}

		// Now check rules
		shouldInterceptRules := rulesClient.RuleEvaluation(req)
		if !shouldInterceptRules {
			// logger.LogMessage("info", fmt.Sprintf("Request URL %s is excluded by rules, bypassing interception", host), "ProxyServer")
			//log.Printf("Request URL %s is excluded by rules, bypassing interception", host)
			return req, nil
		}

		var bodyContent []byte
		var err error

		// Read the entire body
		bodyContent, err = ioutil.ReadAll(req.Body)
		if err != nil {
			log.Printf("Error reading request body: %v", err)
			return req, p.CreateErrorResponse(req, http.StatusInternalServerError, "Error reading request body")
		}

		// Restore the body for further processing
		req.Body = ioutil.NopCloser(bytes.NewBuffer(bodyContent))

		userData.BodyBytes = bodyContent

		requestDetails := map[string]interface{}{
			"url":             req.URL.String(),
			"headers":         req.Header,
			"method":          req.Method,
			"protocolVersion": req.Proto,
			"body":            string(bodyContent),
		}

		log.Printf("Sending request details to frontend: %+v", requestDetails)

		// Create a unique request ID
		requestID := uuid.New().String()
		approvalCh := make(chan ApprovalResponse)

		// Create a context with creation time for stale detection
		reqCtx := context.WithValue(req.Context(), creationTimeKey, time.Now())
		reqWithTime := req.Clone(reqCtx)

		p.ApprovalChsM.Lock()
		p.PendingRequestsM.Lock()
		p.ApprovalChs[requestID] = approvalCh
		p.PendingRequests[requestID] = reqWithTime
		p.PendingRequestsM.Unlock()
		p.ApprovalChsM.Unlock()

		userData.RequestID = requestID

		// Emit an event to the frontend to request approval
		wailsRuntime.EventsEmit(ctx, "app:requestApproval", map[string]interface{}{
			"requestID": requestID,
			"details":   requestDetails,
		})

		// Wait for approval and modifications
		var approvalResponse ApprovalResponse
		select {
		case approvalResponse = <-approvalCh:
			// Clean up the channel after receiving a response
			p.ApprovalChsM.Lock()
			delete(p.ApprovalChs, requestID)
			p.ApprovalChsM.Unlock()

			p.PendingRequestsM.Lock()
			delete(p.PendingRequests, requestID)
			p.PendingRequestsM.Unlock()

		case <-time.After(60 * 5 * time.Second):
			log.Printf("Request approval timed out for %s", requestID)

			// Clean up on timeout
			p.ApprovalChsM.Lock()
			delete(p.ApprovalChs, requestID)
			p.ApprovalChsM.Unlock()

			p.PendingRequestsM.Lock()
			delete(p.PendingRequests, requestID)
			p.PendingRequestsM.Unlock()

			return req, p.CreateErrorResponse(req, http.StatusGatewayTimeout, "Request approval timed out")
		}

		if !approvalResponse.Approved {
			log.Printf("Request not approved for %s", requestID)
			return req, p.CreateErrorResponse(req, http.StatusForbidden, "Request was dropped")
		}

		// Apply modifications
		req.Header = approvalResponse.Headers
		req.Method = approvalResponse.Method
		req.Proto = approvalResponse.ProtocolVersion
		req.Host = req.Header.Get("Host")

		// Update the URL with the new path
		newURL, err := url.Parse(approvalResponse.URL)
		if err != nil {
			log.Printf("Error parsing new URL: %v", err)
			return req, p.CreateErrorResponse(req, http.StatusInternalServerError, "Error parsing new URL")
		}
		req.URL = newURL

		// Handle multipart form requests
		if strings.HasPrefix(req.Header.Get("Content-Type"), "multipart/form-data") {
			if err := handleMultipartForm(req); err != nil {
				return req, p.CreateErrorResponse(req, http.StatusInternalServerError, err.Error())
			}
		} else {
			// Update the body with the new content for non-multipart requests
			bodyBytes := []byte(approvalResponse.Body)
			req.Body = ioutil.NopCloser(bytes.NewReader(bodyBytes))
			req.ContentLength = int64(len(bodyBytes))
			req.Header.Set("Content-Length", strconv.FormatInt(req.ContentLength, 10))
		}

		// Apply Match and Replace to the request
		req, err = matchReplaceClient.ApplyToRequest(req)
		if err != nil {
			logger.LogMessage("ERROR", fmt.Sprintf("Error applying match replace rules to request: %v", err), "MatchReplace")
		}
		return req, nil
	})
}

// HandleResponse sets up the response interception handler
func (p *Proxy) HandleResponse(ctx context.Context, matchReplaceClient MatchReplaceClient, logger Logger, responseHandler ResponseHandler) {
	log.Printf("DEBUG: Setting up response handler")
	p.ProxyServer.OnResponse().DoFunc(func(resp *http.Response, proxyCtx *goproxy.ProxyCtx) *http.Response {
		if proxyCtx.UserData == nil {
			proxyCtx.UserData = &UserData{}
		}

		userData, ok := proxyCtx.UserData.(*UserData)
		if !ok || userData.responseProcessed {
			return resp
		}
		userData.responseProcessed = true

		log.Printf("DEBUG: Proxy response handler called for URL: %s", proxyCtx.Req.URL.String())

		// Check for WebSocket responses and bypass them completely
		if proxyCtx.Req != nil && isWebSocketHandshake(proxyCtx.Req.Header) {
			// logger.LogMessage("info", fmt.Sprintf("WebSocket response bypassed: %s", proxyCtx.Req.URL.String()), "ProxyServer")
			return resp
		}

		// Call the response handler regardless of interception state
		responseHandler(proxyCtx.Req, resp)

		p.InterceptionMtx.Lock()
		interceptionOn := p.InterceptionOn
		p.InterceptionMtx.Unlock()

		// If interception is off, just pass through the response without modification
		if !interceptionOn {
			return resp
		}

		// Apply match and replace rules to the response
		resp, err := matchReplaceClient.ApplyToResponse(resp)
		if err != nil {
			logger.LogMessage("ERROR", fmt.Sprintf("Error applying match replace rules to response: %v", err), "MatchReplace")
		}

		return resp
	})
}

// Helper function to handle multipart form requests
func handleMultipartForm(req *http.Request) error {
	// Parse the multipart form
	err := req.ParseMultipartForm(32 << 20) // 32MB max memory
	if err != nil {
		return fmt.Errorf("error parsing multipart form: %v", err)
	}

	// Create a new multipart writer
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	// Copy the form values and files to the new writer
	for key, values := range req.MultipartForm.Value {
		for _, value := range values {
			writer.WriteField(key, value)
		}
	}
	for key, fileHeaders := range req.MultipartForm.File {
		for _, fileHeader := range fileHeaders {
			part, err := writer.CreateFormFile(key, fileHeader.Filename)
			if err != nil {
				return fmt.Errorf("error creating form file: %v", err)
			}
			file, err := fileHeader.Open()
			if err != nil {
				return fmt.Errorf("error opening form file: %v", err)
			}
			io.Copy(part, file)
			file.Close()
		}
	}

	// Close the multipart writer
	writer.Close()

	// Update the request body and headers
	req.Body = ioutil.NopCloser(body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.ContentLength = int64(body.Len())
	req.Header.Set("Content-Length", strconv.FormatInt(req.ContentLength, 10))

	return nil
}

// Interface for request storage
type RequestStorage interface {
	StoreRequest(req *http.Request, resp *http.Response) (string, int, error)
}

// Interface for scope client
type ScopeClient interface {
	IsInScope(host string) bool
	GetOutScopeList() []string
	GetInScopeList() []string
}

// Interface for match replace client
type MatchReplaceClient interface {
	ApplyToRequest(req *http.Request) (*http.Request, error)
	ApplyToResponse(resp *http.Response) (*http.Response, error)
}

// Interface for rules client
type RulesClient interface {
	RuleEvaluation(req *http.Request) bool
}

// Interface for logger
type Logger interface {
	LogMessage(level string, message string, source string)
}

// Key type for context values
type contextKey int

const creationTimeKey contextKey = iota
