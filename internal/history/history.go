package history

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

// Request represents a single HTTP request/response pair
type Request struct {
	ID              int    `json:"id"`
	Method          string `json:"method"`
	Domain          string `json:"domain"`
	Port            string `json:"port"`
	Path            string `json:"path"`
	URL             string `json:"url"`
	HttpVersion     string `json:"http_version"`
	Status          string `json:"status"`
	Length          int64  `json:"length"`
	MimeType        string `json:"mimeType"`
	Timestamp       string `json:"timestamp"`
	RequestHeaders  string `json:"requestHeaders,omitempty"`
	RequestBody     string `json:"requestBody,omitempty"`
	ResponseHeaders string `json:"responseHeaders,omitempty"`
	ResponseBody    string `json:"responseBody,omitempty"`
	Query           string `json:"query,omitempty"`
}

// Client handles HTTP request history operations
type Client struct {
	db *sql.DB
}

// NewClient creates a new history client
func NewClient(db *sql.DB) (*Client, error) {
	return &Client{
		db: db,
	}, nil
}

// GetAllRequests retrieves all HTTP requests with pagination and search
func (c *Client) GetAllRequests(page, limit int, sortKey, sortDirection, searchQuery string) ([]Request, map[string]interface{}, error) {
	// Log search parameters for debugging
	log.Printf("Search query: '%s', sort: %s %s, page: %d, limit: %d",
		searchQuery, sortKey, sortDirection, page, limit)

	// Build the base query
	baseQuery := `
		SELECT 
			id,
			method,
			domain,
			port,
			path,
			url, 
			http_version,
			status,
			length,
			mime_type,
			timestamp,
			request_headers,
			request_body,
			response_headers,
			response_body,
			query
		FROM requests
		WHERE 1=1
	`
	countQuery := "SELECT COUNT(*) FROM requests WHERE 1=1"
	params := []interface{}{}

	// Add search condition if search query exists
	if searchQuery != "" {
		// Trim and clean search query
		searchQuery = strings.TrimSpace(searchQuery)

		// For exact method matching, we'll handle it differently
		exactMethodMatch := false
		methods := []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}
		for _, method := range methods {
			if strings.EqualFold(searchQuery, method) {
				exactMethodMatch = true
				break
			}
		}

		// For exact status code matching
		exactStatusMatch := false
		if _, err := fmt.Sscanf(searchQuery, "%d", new(int)); err == nil {
			exactStatusMatch = true
		}

		// Special handling for domain-like queries
		isDomainSearch := strings.Contains(searchQuery, ".") && !strings.HasPrefix(searchQuery, ".") && !strings.HasSuffix(searchQuery, ".")

		// Build search conditions
		var conditions []string

		// Handle exact matches first
		if exactMethodMatch {
			conditions = append(conditions, "LOWER(method) = ?")
			params = append(params, strings.ToLower(searchQuery))
		}

		if exactStatusMatch {
			conditions = append(conditions, "status = ?")
			params = append(params, searchQuery)
		}

		// Special handling for domain searches
		if isDomainSearch {
			// Exact domain match
			conditions = append(conditions, "LOWER(domain) = ?")
			params = append(params, strings.ToLower(searchQuery))

			// Domain starts with prefix (handles subdomains)
			conditions = append(conditions, "LOWER(domain) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery))

			// Domain is part of URL
			conditions = append(conditions, "LOWER(url) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")
		} else {
			// Regular domain partial match for non-domain searches
			conditions = append(conditions, "LOWER(domain) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")

			// Regular URL partial match
			conditions = append(conditions, "LOWER(url) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")
		}

		// Then add LIKE clauses for partial matches
		// Don't add method/status LIKE clauses if we're doing exact matching
		if !exactMethodMatch {
			conditions = append(conditions, "LOWER(method) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")
		}

		conditions = append(conditions, "LOWER(path) LIKE ?")
		params = append(params, "%"+strings.ToLower(searchQuery)+"%")

		conditions = append(conditions, "LOWER(mime_type) LIKE ?")
		params = append(params, "%"+strings.ToLower(searchQuery)+"%")

		conditions = append(conditions, "LOWER(query) LIKE ?")
		params = append(params, "%"+strings.ToLower(searchQuery)+"%")

		if !exactStatusMatch {
			conditions = append(conditions, "status LIKE ?")
			params = append(params, "%"+searchQuery+"%")
		}

		// For more advanced searches, if query contains more than 3 characters and not a method/status
		if len(searchQuery) > 3 && !exactMethodMatch && !exactStatusMatch {
			// Also search in response body for JSON data
			conditions = append(conditions, "LOWER(response_body) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")

			// And request body
			conditions = append(conditions, "LOWER(request_body) LIKE ?")
			params = append(params, "%"+strings.ToLower(searchQuery)+"%")
		}

		// Add the combined condition
		searchCond := " AND (" + strings.Join(conditions, " OR ") + ")"
		baseQuery += searchCond
		countQuery += searchCond
	}

	// Log the query and parameters
	log.Printf("Search SQL condition: %s", baseQuery)
	log.Printf("Parameters: %v", params)

	// Get total count
	var total int
	err := c.db.QueryRow(countQuery, params...).Scan(&total)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get total count: %v", err)
	}

	log.Printf("Total matches: %d", total)

	// Add sorting
	if sortDirection == "ascending" {
		baseQuery += fmt.Sprintf(" ORDER BY %s ASC", sortKey)
	} else {
		baseQuery += fmt.Sprintf(" ORDER BY %s DESC", sortKey)
	}

	// Add pagination
	baseQuery += " LIMIT ? OFFSET ?"
	params = append(params, limit, (page-1)*limit)

	// Execute the query
	rows, err := c.db.Query(baseQuery, params...)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to fetch requests: %v", err)
	}
	defer rows.Close()

	var requests []Request
	for rows.Next() {
		var req Request
		var status string
		var timestamp string
		var lengthNull sql.NullInt64
		var mimeTypeNull sql.NullString
		err := rows.Scan(
			&req.ID,
			&req.Method,
			&req.Domain,
			&req.Port,
			&req.Path,
			&req.URL,
			&req.HttpVersion,
			&status,
			&lengthNull,
			&mimeTypeNull,
			&timestamp,
			&req.RequestHeaders,
			&req.RequestBody,
			&req.ResponseHeaders,
			&req.ResponseBody,
			&req.Query,
		)
		if err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		req.Status = status
		req.Timestamp = timestamp
		req.Length = lengthNull.Int64
		req.MimeType = mimeTypeNull.String
		requests = append(requests, req)
	}

	totalPages := (total + limit - 1) / limit
	if totalPages < 1 {
		totalPages = 1
	}

	pagination := map[string]interface{}{
		"total":      total,
		"page":       page,
		"limit":      limit,
		"totalPages": totalPages,
	}

	return requests, pagination, nil
}

// GetRequestByID retrieves a specific request by its ID
func (c *Client) GetRequestByID(id string) (*Request, error) {
	query := `
		SELECT 
			method,
			domain,
			port,
			path,
			query,
			http_version,
			request_headers,
			request_body,
			response_headers,
			response_body,
			status
		FROM requests 
		WHERE id = ?
	`

	var details Request
	err := c.db.QueryRow(query, id).Scan(
		&details.Method,
		&details.Domain,
		&details.Port,
		&details.Path,
		&details.Query,
		&details.HttpVersion,
		&details.RequestHeaders,
		&details.RequestBody,
		&details.ResponseHeaders,
		&details.ResponseBody,
		&details.Status,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to fetch request details: %v", err)
	}

	return &details, nil
}
