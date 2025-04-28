package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// RequestStorage handles storing HTTP requests and responses
type RequestStorage struct {
	db      *sql.DB
	dbMutex *sync.RWMutex
}

// NewRequestStorage creates a new RequestStorage instance
func NewRequestStorage(db *sql.DB, dbMutex *sync.RWMutex) *RequestStorage {
	return &RequestStorage{
		db:      db,
		dbMutex: dbMutex,
	}
}

// StoreRequest stores a request and its response in the database
func (s *RequestStorage) StoreRequest(req *http.Request, resp *http.Response) (string, int, error) {
	// Lock for database operations
	s.dbMutex.Lock()
	defer s.dbMutex.Unlock()

	// Start a transaction with a timeout context
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{
		Isolation: sql.LevelReadCommitted,
	})
	if err != nil {
		return "", 0, fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback()

	// Extract request details
	requestHeaders := headerToString(req.Header)

	// Read and restore request body
	var requestBody string
	if req.Body != nil {
		bodyBytes, err := io.ReadAll(req.Body)
		if err != nil {
			return "", 0, fmt.Errorf("failed to read request body: %v", err)
		}
		requestBody = string(bodyBytes)
		// Restore the body for future use
		req.Body = io.NopCloser(strings.NewReader(requestBody))
		fmt.Printf("Debug: Request body length before storage: %d bytes\n", len(bodyBytes))
	}

	// Extract URL components
	domain := req.URL.Hostname()
	port := req.URL.Port()
	if port == "" {
		if req.URL.Scheme == "http" {
			port = "80"
		} else if req.URL.Scheme == "https" {
			port = "443"
		}
	}
	path := req.URL.Path
	query := req.URL.RawQuery
	httpVersion := req.Proto

	// Initialize response values with NULL-safe defaults
	var responseHeaders sql.NullString
	var responseBody sql.NullString
	var status sql.NullString
	var length sql.NullInt64
	var mimeType sql.NullString

	// Extract response details if available
	if resp != nil {
		responseHeaders = sql.NullString{String: headerToString(resp.Header), Valid: true}
		if resp.Body != nil {
			bodyBytes, err := io.ReadAll(resp.Body)
			if err != nil {
				return "", 0, fmt.Errorf("failed to read response body: %v", err)
			}
			resp.Body.Close()

			responseBody = sql.NullString{String: string(bodyBytes), Valid: true}
			fmt.Printf("Debug: Response body length before storage: %d bytes\n", len(bodyBytes))

			// Restore the body for future use
			resp.Body = io.NopCloser(strings.NewReader(responseBody.String))
		}

		if resp.Status != "" {
			status = sql.NullString{String: resp.Status, Valid: true}
		}
		if resp.ContentLength != -1 {
			length = sql.NullInt64{Int64: resp.ContentLength, Valid: true}
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = sql.NullString{String: ct, Valid: true}
		}
	}

	// Insert a new request
	result, err := tx.ExecContext(ctx, `
		INSERT INTO requests (url, method, domain, port, path, query, request_headers, request_body, http_version, response_headers, response_body, status, length, mime_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.URL.String(), req.Method, domain, port, path, query, requestHeaders, requestBody, httpVersion,
		responseHeaders, responseBody, status, length, mimeType,
	)
	if err != nil {
		if strings.Contains(err.Error(), "database is locked") {
			// If database is locked, wait briefly and retry once
			time.Sleep(100 * time.Millisecond)
			result, err = tx.ExecContext(ctx, `
				INSERT INTO requests (url, method, domain, port, path, query, request_headers, request_body, http_version, response_headers, response_body, status, length, mime_type)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				req.URL.String(), req.Method, domain, port, path, query, requestHeaders, requestBody, httpVersion,
				responseHeaders, responseBody, status, length, mimeType,
			)
			if err != nil {
				return "", 0, fmt.Errorf("failed to insert request after retry: %v", err)
			}
		} else {
			return "", 0, fmt.Errorf("failed to insert request: %v", err)
		}
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		return "", 0, fmt.Errorf("failed to get last insert id: %v", err)
	}

	// Commit the transaction
	if err := tx.Commit(); err != nil {
		if strings.Contains(err.Error(), "database is locked") {
			// If database is locked during commit, wait briefly and retry once
			time.Sleep(100 * time.Millisecond)
			if err := tx.Commit(); err != nil {
				return "", 0, fmt.Errorf("failed to commit transaction after retry: %v", err)
			}
		} else {
			return "", 0, fmt.Errorf("failed to commit transaction: %v", err)
		}
	}

	id := int(lastID)
	return fmt.Sprintf("Inserted request with id: %d", id), id, nil
}

// Helper function to read body as string
func readBody(body io.ReadCloser) (string, error) {
	defer body.Close()
	bodyBytes, err := io.ReadAll(body)
	if err != nil {
		return "", fmt.Errorf("failed to read body: %v", err)
	}
	return string(bodyBytes), nil
}

// Helper function to convert headers to string
func headerToString(headers http.Header) string {
	// Create a copy of the headers map to avoid concurrent map access
	headerMap := make(map[string][]string)
	headerCopy := headers.Clone() // Use http.Header's Clone method to safely copy headers

	for name, values := range headerCopy {
		headerMap[name] = values
	}

	jsonBytes, err := json.Marshal(headerMap)
	if err != nil {
		return "{}" // Return empty JSON object in case of error
	}
	return string(jsonBytes)
}
