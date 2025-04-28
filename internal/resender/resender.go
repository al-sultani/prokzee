package resender

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"

	"prokzee/internal/storage"

	"bytes"
	"compress/gzip"
	"crypto/tls"
	"io"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// ResenderTab represents a tab in the resender interface
type ResenderTab struct {
	ID        int                    `json:"id"`
	Name      string                 `json:"name"`
	RequestID string                 `json:"requestId"`
	Headers   map[string]interface{} `json:"headers"`
}

// Resender manages the resender functionality
type Resender struct {
	ctx            context.Context
	db             *sql.DB
	activeRequests map[int]context.CancelFunc
	activeReqMutex sync.Mutex
	requestStorage *storage.RequestStorage
}

// NewResender creates a new Resender instance
func NewResender(ctx context.Context, db *sql.DB, requestStorage *storage.RequestStorage) *Resender {
	return &Resender{
		ctx:            ctx,
		db:             db,
		activeRequests: make(map[int]context.CancelFunc),
		activeReqMutex: sync.Mutex{},
		requestStorage: requestStorage,
	}
}

// CreateNewTab creates a new resender tab
func (r *Resender) CreateNewTab(newTabData map[string]interface{}) error {
	defaultRequest, ok := newTabData["defaultRequest"].(map[string]interface{})
	if !ok {
		// Create a default POST request to postman-echo.com with realistic data
		defaultRequest = map[string]interface{}{
			"url":    "https://postman-echo.com/post",
			"method": "POST",
			"requestHeaders": map[string]interface{}{
				"Content-Type":    "application/json",
				"User-Agent":      "Mozilla/5.0",
				"Accept":          "application/json",
				"Accept-Encoding": "gzip, deflate, br",
				"Connection":      "keep-alive",
				"Host":            "postman-echo.com",
			},
			"requestBody":     `{"tool": "prokzee", "test": "This is a test request", "timestamp": "2024"}`,
			"httpVersion":     "HTTP/1.1",
			"status":          "",
			"responseHeaders": "{}",
			"responseBody":    "",
			"port":            "443",
			"path":            "/post",
			"domain":          "postman-echo.com",
			"mime_type":       "",
			"length":          0,
		}
	}

	// Create http.Request from defaultRequest data
	url, _ := defaultRequest["url"].(string)
	method, _ := defaultRequest["method"].(string)
	if method == "" {
		method = "GET"
	}
	body, _ := defaultRequest["requestBody"].(string)
	httpVersion, _ := defaultRequest["httpVersion"].(string)
	httpReq, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	httpReq.Proto = httpVersion

	// Add headers if present
	var headers map[string]interface{}
	if headers, ok = defaultRequest["requestHeaders"].(map[string]interface{}); ok {
		for key, value := range headers {
			if strValue, ok := value.(string); ok {
				httpReq.Header.Set(key, strValue)
			}
		}
	}

	// Extract URL components for storage
	parsedURL := httpReq.URL
	domain := parsedURL.Hostname()
	port := parsedURL.Port()
	if port == "" {
		if parsedURL.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	path := parsedURL.Path
	if path == "" {
		path = "/"
	}
	query := parsedURL.RawQuery

	// Convert headers to JSON string
	headersJSON, err := json.Marshal(headers)
	if err != nil {
		return fmt.Errorf("failed to marshal headers: %v", err)
	}

	// Convert response headers to JSON string if present
	var responseHeaders string
	if respHeaders, ok := defaultRequest["responseHeaders"].(map[string]interface{}); ok {
		respHeadersJSON, err := json.Marshal(respHeaders)
		if err != nil {
			return fmt.Errorf("failed to marshal response headers: %v", err)
		}
		responseHeaders = string(respHeadersJSON)
	} else {
		responseHeaders = "{}"
	}

	// Generate a UUID for the request_id
	requestID := uuid.New().String()

	// Insert request details into the resender_requests table and get the primary key (id)
	var requestId int
	err = r.db.QueryRow(`
		INSERT INTO resender_requests (
			request_id, domain, port, path, query, url, method, 
			request_headers, request_body, response_headers, response_body, 
			http_version, status, mime_type
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id
	`, requestID, domain, port, path, query, url, method,
		string(headersJSON), body, responseHeaders, defaultRequest["responseBody"].(string),
		httpVersion, defaultRequest["status"].(string), "").Scan(&requestId)
	if err != nil {
		return fmt.Errorf("failed to save request to database: %v", err)
	}

	// Get the last tab ID to generate a sequential name
	var lastTabId int
	err = r.db.QueryRow("SELECT COALESCE(MAX(id), 0) FROM resender_tabs").Scan(&lastTabId)
	if err != nil {
		return fmt.Errorf("failed to get last tab ID: %v", err)
	}
	tabName := fmt.Sprintf("Tab %d", lastTabId+1)

	// Insert the new tab into the resender_tabs table, letting the database handle ID generation
	var tabID int64
	result, err := r.db.Exec(`
		INSERT INTO resender_tabs (name, request_ids_arr)
		VALUES (?, ?)
	`, tabName, fmt.Sprintf("[%d]", requestId))
	if err != nil {
		return fmt.Errorf("failed to insert new resender tab: %v", err)
	}

	tabID, err = result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get new tab ID: %v", err)
	}

	// Emit an event to confirm the new tab creation
	runtime.EventsEmit(r.ctx, "backend:newTabCreated", map[string]interface{}{
		"tabId":     tabID,
		"requestId": requestId,
	})

	return nil
}

// SendToResender sends a request to the resender
func (r *Resender) SendToResender(requestData map[string]interface{}) error {
	fullUrl, ok := requestData["url"].(string)
	if !ok {
		return fmt.Errorf("invalid or missing URL")
	}

	headers, ok := requestData["headers"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid or missing headers")
	}

	body, ok := requestData["body"].(string)
	if !ok {
		return fmt.Errorf("invalid or missing body")
	}

	method, ok := requestData["method"].(string)
	if !ok {
		method = "GET" // Default to GET if method is not provided
	}

	// Generate a UUID for the request_id
	requestID := uuid.New().String()

	// Extract URL components
	parsedURL, err := url.Parse(fullUrl)
	if err != nil {
		return fmt.Errorf("failed to parse URL: %v", err)
	}

	// Extract domain and port
	domain := parsedURL.Hostname()
	port := parsedURL.Port()
	if port == "" {
		if parsedURL.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	path := parsedURL.Path
	if path == "" {
		path = "/"
	}
	query := parsedURL.RawQuery
	// Convert headers to JSON string
	headersJSON, err := json.Marshal(headers)
	if err != nil {
		return fmt.Errorf("failed to marshal headers: %v", err)
	}

	// Insert request details into the resender_requests table and get the primary key (id)
	var requestId int
	err = r.db.QueryRow(`
        INSERT INTO resender_requests (request_id, domain, port, path, query, url, method, request_headers, request_body, response_headers, response_body, http_version, status, mime_type) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
    `, requestID, domain, port, path, query, fullUrl, method, string(headersJSON), body, "{}", "", "HTTP/1.1", "", "").Scan(&requestId)
	if err != nil {
		return fmt.Errorf("failed to save request to database: %v", err)
	}

	// Get the last tab ID
	var lastTabId int
	err = r.db.QueryRow("SELECT COALESCE(MAX(id), 0) FROM resender_tabs").Scan(&lastTabId)
	if err != nil {
		return fmt.Errorf("failed to get last tab ID: %v", err)
	}

	// Generate a name for the new tab
	tabName := fmt.Sprintf("Tab %d", lastTabId+1)

	// Insert new tab into the resender_tabs table
	requestIDsArr, _ := json.Marshal([]int{requestId})
	result, err := r.db.Exec(`
        INSERT INTO resender_tabs (name, request_ids_arr)
        VALUES (?, ?)
    `, tabName, string(requestIDsArr))
	if err != nil {
		return fmt.Errorf("failed to save resender tab to database: %v", err)
	}

	tabID, err := result.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last insert ID: %v", err)
	}

	// Emit an event to confirm the new tab creation
	runtime.EventsEmit(r.ctx, "backend:newTabCreated", map[string]interface{}{
		"tabId":     tabID,
		"requestId": requestId,
	})

	return nil
}

// GetTabs retrieves all resender tabs
func (r *Resender) GetTabs() ([]map[string]interface{}, error) {
	rows, err := r.db.Query("SELECT id, name, request_ids_arr FROM resender_tabs ORDER BY id ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch resender tabs: %v", err)
	}
	defer rows.Close()

	var tabs []map[string]interface{}
	for rows.Next() {
		var id int
		var name, requestIDsArrJSON string
		if err := rows.Scan(&id, &name, &requestIDsArrJSON); err != nil {
			return nil, fmt.Errorf("failed to scan resender tab: %v", err)
		}

		// Parse the request IDs array
		var requestIDs []int
		if requestIDsArrJSON != "" {
			if err := json.Unmarshal([]byte(requestIDsArrJSON), &requestIDs); err != nil {
				log.Printf("Failed to unmarshal request IDs: %v", err)
				// Don't set to empty array here, we'll handle it below
			}
		}

		// If requestIDs is nil or empty, try to find the first request for this tab
		if len(requestIDs) == 0 {
			var firstRequestId int
			err = r.db.QueryRow("SELECT id FROM resender_requests ORDER BY id ASC LIMIT 1").Scan(&firstRequestId)
			if err == nil {
				requestIDs = []int{firstRequestId}
				// Update the tab in the database with the request ID
				requestIDsArr := fmt.Sprintf("[%d]", firstRequestId)
				_, err = r.db.Exec("UPDATE resender_tabs SET request_ids_arr = ? WHERE id = ?", requestIDsArr, id)
				if err != nil {
					log.Printf("Warning: Failed to update tab request IDs: %v", err)
				}
			} else {
				requestIDs = []int{} // Use empty array if no requests found
			}
		}

		tabs = append(tabs, map[string]interface{}{
			"id":           id,
			"name":         name,
			"requestIds":   requestIDs,
			"currentIndex": len(requestIDs) - 1,
		})
	}

	if len(tabs) == 0 {
		// Create a default tab if none exist
		defaultTabId := 1
		defaultTabName := "Tab 1"

		// Get the first request from the resender_requests table (which should be the postman-echo.com request)
		var firstRequestId int
		err = r.db.QueryRow("SELECT id FROM resender_requests ORDER BY id ASC LIMIT 1").Scan(&firstRequestId)
		if err != nil {
			return nil, fmt.Errorf("failed to get first request ID: %v", err)
		}
		// TODO: This is a hack change this to use the requestStorage
		// Log the first request details for debugging
		var url, method, requestHeaders, requestBody, responseHeaders, responseBody, httpVersion, status string
		err = r.db.QueryRow(`
			SELECT url, method, request_headers, request_body, response_headers, response_body, http_version, status 
			FROM resender_requests 
			WHERE id = ?
		`, firstRequestId).Scan(&url, &method, &requestHeaders, &requestBody, &responseHeaders, &responseBody, &httpVersion, &status)
		if err != nil {
			log.Printf("Warning: Failed to fetch first request details: %v", err)
		} else {
			log.Printf("First request details - ID: %d, URL: %s, Method: %s", firstRequestId, url, method)
		}

		// Create the request IDs array with the first request
		requestIDsArr := fmt.Sprintf("[%d]", firstRequestId)

		// Insert the default tab with the first request
		_, err = r.db.Exec(`
			INSERT INTO resender_tabs (id, name, request_ids_arr)
			VALUES (?, ?, ?)
		`, defaultTabId, defaultTabName, requestIDsArr)

		if err != nil {
			return nil, fmt.Errorf("failed to insert default resender tab: %v", err)
		}

		// Log the created tab for debugging
		log.Printf("Created default tab with ID %d and request ID %d", defaultTabId, firstRequestId)

		// Immediately emit the request details to ensure it's loaded
		go func() {
			if err := r.GetRequest(firstRequestId); err != nil {
				log.Printf("Failed to emit first request details: %v", err)
			}
		}()

		defaultTab := map[string]interface{}{
			"id":           defaultTabId,
			"name":         defaultTabName,
			"requestIds":   []int{firstRequestId},
			"currentIndex": 0,
		}
		tabs = append(tabs, defaultTab)
	}

	// For each tab, ensure we have the request details
	for _, tab := range tabs {
		if requestIDs, ok := tab["requestIds"].([]int); ok && len(requestIDs) > 0 {
			firstRequestId := requestIDs[0]
			go func(reqId int) {
				if err := r.GetRequest(reqId); err != nil {
					log.Printf("Failed to emit request details for ID %d: %v", reqId, err)
				}
			}(firstRequestId)
		}
	}

	// Log the tabs being returned
	log.Printf("Returning tabs: %+v", tabs)
	return tabs, nil
}

// SendRequest sends a request from a resender tab
func (r *Resender) SendRequest(tabId float64, requestDetails map[string]interface{}) error {
	url, ok := requestDetails["url"].(string)
	if !ok {
		log.Println("Invalid or missing URL")
		return fmt.Errorf("invalid or missing URL")
	}

	method, ok := requestDetails["method"].(string)
	if !ok {
		method = "GET"
	}

	protocolVersion, ok := requestDetails["protocolVersion"].(string)
	if !ok || protocolVersion == "" {
		protocolVersion = "HTTP/1.1"
	}

	headers, ok := requestDetails["headers"].(map[string]interface{})
	if !ok {
		headers = make(map[string]interface{})
	}

	body, ok := requestDetails["body"].(string)
	if !ok {
		body = ""
	}

	// Create the request with a copy of the body that can be read multiple times
	bodyReader := strings.NewReader(body)
	bodyBytes := []byte(body) // Keep a copy for storage
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		log.Printf("Error creating request: %v", err)
		runtime.EventsEmit(r.ctx, "backend:resenderResponse", map[string]interface{}{
			"error": err.Error(),
			"tabId": tabId,
		})
		return err
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
		runtime.EventsEmit(r.ctx, "backend:resenderResponse", map[string]interface{}{
			"error": err.Error(),
			"tabId": tabId,
		})
		return err
	}
	defer resp.Body.Close()

	// Read response body while keeping a copy
	var respBody []byte

	// Check if response is gzip encoded
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gzipReader, gzipErr := gzip.NewReader(resp.Body)
		if gzipErr != nil {
			log.Printf("Error creating gzip reader: %v", gzipErr)
			runtime.EventsEmit(r.ctx, "backend:resenderResponse", map[string]interface{}{
				"error": gzipErr.Error(),
				"tabId": tabId,
			})
			return gzipErr
		}
		defer gzipReader.Close()
		respBody, err = io.ReadAll(gzipReader)
	} else {
		respBody, err = io.ReadAll(resp.Body)
	}

	if err != nil {
		log.Printf("Error reading response body: %v", err)
		runtime.EventsEmit(r.ctx, "backend:resenderResponse", map[string]interface{}{
			"error": err.Error(),
			"tabId": tabId,
		})
		return err
	}

	// Create a new response with the copied body for storage
	respForStorage := *resp
	respForStorage.Body = io.NopCloser(bytes.NewReader(respBody))

	// Store the request and response using requestStorage
	reqForStorage := *req
	reqForStorage.Body = io.NopCloser(bytes.NewReader(bodyBytes))

	// Extract URL components for storage
	parsedURL := reqForStorage.URL
	domain := parsedURL.Hostname()

	// Skip storing prokzee requests
	if strings.Contains(strings.ToLower(domain), "prokzee") {
		return nil
	}

	port := parsedURL.Port()
	if port == "" {
		if parsedURL.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	path := parsedURL.Path
	if path == "" {
		path = "/"
	}
	query := parsedURL.RawQuery

	// Convert headers to JSON string
	headersJSON, err := json.Marshal(headers)
	if err != nil {
		return fmt.Errorf("failed to marshal headers: %v", err)
	}

	// Convert response headers to JSON string
	respHeadersJSON, err := json.Marshal(resp.Header)
	if err != nil {
		return fmt.Errorf("failed to marshal response headers: %v", err)
	}

	// Generate a UUID for the request_id
	requestID := uuid.New().String()

	// Start a transaction
	tx, err := r.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Insert into resender_requests first
	var newRequestId int
	err = tx.QueryRow(`
		INSERT INTO resender_requests (
			request_id, domain, port, path, query, url, method, 
			request_headers, request_body, response_headers, response_body, 
			http_version, status, mime_type, length
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id
	`, requestID, domain, port, path, query, req.URL.String(), method,
		string(headersJSON), string(bodyBytes), string(respHeadersJSON), string(respBody),
		protocolVersion, resp.Status,
		resp.Header.Get("Content-Type"), len(respBody)).Scan(&newRequestId)
	if err != nil {
		return fmt.Errorf("failed to save to resender_requests: %v", err)
	}

	// Store all responses in the requests table, not just successful ones
	_, err = tx.Exec(`
		INSERT INTO requests (
			request_id, domain, port, path, query, url, method, 
			request_headers, request_body, response_headers, response_body, 
			http_version, status, mime_type, length
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, requestID, domain, port, path, query, req.URL.String(), method,
		string(headersJSON), string(bodyBytes), string(respHeadersJSON), string(respBody),
		protocolVersion, resp.Status,
		resp.Header.Get("Content-Type"), len(respBody))
	if err != nil {
		return fmt.Errorf("failed to copy to requests: %v", err)
	}

	// Update the tab's request IDs array
	var requestIDsJSON string
	err = tx.QueryRow("SELECT request_ids_arr FROM resender_tabs WHERE id = ?", int(tabId)).Scan(&requestIDsJSON)
	if err != nil {
		return fmt.Errorf("failed to fetch tab request IDs: %v", err)
	}

	var requestIDs []int
	if err := json.Unmarshal([]byte(requestIDsJSON), &requestIDs); err == nil {
		requestIDs = append(requestIDs, newRequestId)
		if newRequestIDsJSON, err := json.Marshal(requestIDs); err == nil {
			_, err = tx.Exec("UPDATE resender_tabs SET request_ids_arr = ? WHERE id = ?", string(newRequestIDsJSON), int(tabId))
			if err != nil {
				return fmt.Errorf("failed to update tab request IDs: %v", err)
			}
		}
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %v", err)
	}

	// Send response back to frontend
	runtime.EventsEmit(r.ctx, "backend:resenderResponse", map[string]interface{}{
		"httpVersion":     resp.Proto,
		"tabId":           tabId,
		"requestId":       newRequestId,
		"responseHeaders": resp.Header,
		"responseBody":    string(respBody),
		"status":          resp.Status,
		"isRedirect":      resp.StatusCode >= 300 && resp.StatusCode < 400,
		"redirectURL":     resp.Header.Get("Location"),
	})

	return nil
}

// CancelRequest cancels an active request
func (r *Resender) CancelRequest(tabID int) {
	r.activeReqMutex.Lock()
	if cancel, exists := r.activeRequests[tabID]; exists {
		cancel()
		delete(r.activeRequests, tabID)
	}
	r.activeReqMutex.Unlock()
}

// UpdateTabName updates the name of a resender tab
func (r *Resender) UpdateTabName(tabID int, newName string) error {
	_, err := r.db.Exec("UPDATE resender_tabs SET name = ? WHERE id = ?", newName, tabID)
	if err != nil {
		return fmt.Errorf("failed to update tab name: %v", err)
	}

	runtime.EventsEmit(r.ctx, "backend:tabNameUpdated", map[string]interface{}{
		"tabId":   tabID,
		"newName": newName,
	})

	return nil
}

// DeleteTab deletes a resender tab
func (r *Resender) DeleteTab(tabID int) error {
	_, err := r.db.Exec("DELETE FROM resender_tabs WHERE id = ?", tabID)
	if err != nil {
		return fmt.Errorf("failed to delete resender tab: %v", err)
	}

	runtime.EventsEmit(r.ctx, "backend:tabDeleted", map[string]interface{}{
		"success": true,
		"tabId":   tabID,
	})

	return nil
}

// GetRequest retrieves a specific request by ID
func (r *Resender) GetRequest(requestID int) error {
	log.Printf("Getting request with ID: %d", requestID)

	var url, method string
	var requestHeaders, requestBody, responseHeaders, responseBody, httpVersion, status string
	var portNull sql.NullString

	err := r.db.QueryRow(`
		SELECT url, method, request_headers, request_body, response_headers, response_body, http_version, status, port
		FROM resender_requests WHERE id = ?
	`, requestID).Scan(&url, &method, &requestHeaders, &requestBody, &responseHeaders, &responseBody, &httpVersion, &status, &portNull)
	if err != nil {
		return fmt.Errorf("failed to fetch request details: %v", err)
	}

	// Log the request details for debugging
	log.Printf("Found request - ID: %d, URL: %s, Method: %s", requestID, url, method)

	// Validate and parse headers
	if requestHeaders == "" {
		requestHeaders = "{}"
	}
	if responseHeaders == "" {
		responseHeaders = "{}"
	}

	// Emit the request details
	runtime.EventsEmit(r.ctx, "backend:resenderRequest", map[string]interface{}{
		"id":              requestID,
		"url":             url,
		"method":          method,
		"requestHeaders":  requestHeaders,
		"requestBody":     requestBody,
		"responseHeaders": responseHeaders,
		"responseBody":    responseBody,
		"httpVersion":     httpVersion,
		"status":          status,
		"port":            portNull.String,
	})

	return nil
}

// // updateTab updates a resender tab with a new request ID
// func (r *Resender) updateTab(tabID int, lastID int) error {
// 	var requestIDsJSON string
// 	err := r.db.QueryRow("SELECT request_ids_arr FROM resender_tabs WHERE id = ?", tabID).Scan(&requestIDsJSON)
// 	if err != nil {
// 		return fmt.Errorf("error fetching tab request IDs: %v", err)
// 	}

// 	var requestIDs []int
// 	if requestIDsJSON != "" {
// 		if err := json.Unmarshal([]byte(requestIDsJSON), &requestIDs); err != nil {
// 			return fmt.Errorf("error parsing request IDs JSON: %v", err)
// 		}
// 	}

// 	// Add the new request ID if it's not already in the list
// 	found := false
// 	for _, id := range requestIDs {
// 		if id == lastID {
// 			found = true
// 			break
// 		}
// 	}

// 	if !found {
// 		requestIDs = append(requestIDs, lastID)
// 	}

// 	newRequestIDs, err := json.Marshal(requestIDs)
// 	if err != nil {
// 		return fmt.Errorf("error marshaling request IDs: %v", err)
// 	}

// 	_, err = r.db.Exec("UPDATE resender_tabs SET request_ids_arr = ? WHERE id = ?", string(newRequestIDs), tabID)
// 	if err != nil {
// 		return fmt.Errorf("error updating tab request list: %v", err)
// 	}

// 	return nil
// }
