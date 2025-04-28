package sitemap

import (
	"database/sql"
	"strings"
	"time"
)

// Node represents a node in the sitemap tree
type Node struct {
	URL      string  `json:"url"`
	Children []*Node `json:"children"`
}

// Client handles sitemap operations
type Client struct {
	db *sql.DB
}

// NewClient creates a new sitemap client
func NewClient(db *sql.DB) (*Client, error) {
	return &Client{
		db: db,
	}, nil
}

// GetDomains retrieves all unique domains from the requests table
func (c *Client) GetDomains() ([]string, error) {
	// Query distinct domains, excluding wails.localhost
	rows, err := c.db.Query("SELECT DISTINCT domain FROM requests where 1=1 ORDER BY domain")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var domains []string
	for rows.Next() {
		var domain string
		if err := rows.Scan(&domain); err != nil {
			return nil, err
		}
		if domain != "" {
			domains = append(domains, domain)
		}
	}

	return domains, nil
}

// GetSiteMap retrieves the sitemap for a given domain
func (c *Client) GetSiteMap(domain string) (*Node, error) {
	// Create root node for the domain
	root := &Node{URL: domain, Children: []*Node{}}

	// Query the database for paths
	rows, err := c.db.Query("SELECT DISTINCT path FROM requests WHERE domain = ? ORDER BY path", domain)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Process each path
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, err
		}
		if path != "" {
			c.addPathToSiteMap(root, path)
		}
	}

	return root, nil
}

// addPathToSiteMap adds a path to the sitemap tree
func (c *Client) addPathToSiteMap(root *Node, path string) {
	// Ensure path starts with /
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	parts := strings.Split(path, "/")
	current := root

	// Only add root path if it's explicitly in the data
	if path == "/" {
		found := false
		for _, child := range current.Children {
			if child.URL == "/" {
				found = true
				break
			}
		}
		if !found {
			newNode := &Node{URL: "/", Children: []*Node{}}
			current.Children = append(current.Children, newNode)
		}
		return
	}

	// Handle other paths
	for _, part := range parts {
		if part == "" {
			continue
		}
		// Check if the part contains parameters (e.g., :id, {id})
		if strings.Contains(part, ":") || (strings.HasPrefix(part, "{") && strings.HasSuffix(part, "}")) {
			// Replace parameter with a placeholder
			part = "{param}"
		}
		found := false
		for _, child := range current.Children {
			if child.URL == part {
				current = child
				found = true
				break
			}
		}
		if !found {
			newNode := &Node{URL: part, Children: []*Node{}}
			current.Children = append(current.Children, newNode)
			current = newNode
		}
	}
}

// RequestInfo represents the information about a request
type RequestInfo struct {
	ID        int       `json:"id"`
	Method    string    `json:"method"`
	URL       string    `json:"url"`
	Domain    string    `json:"domain"`
	Path      string    `json:"path"`
	Query     string    `json:"query"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
}

// GetRequestsByEndpoint retrieves all requests for a specific domain and path
func (c *Client) GetRequestsByEndpoint(domain, path string) ([]RequestInfo, error) {
	// Ensure path starts with a forward slash
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Query the database for requests matching the domain and path
	query := `
		SELECT id, method, url, domain, path, query, status, timestamp 
		FROM requests 
		WHERE domain = ? AND path = ?
	`
	rows, err := c.db.Query(query, domain, path)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []RequestInfo
	for rows.Next() {
		var req RequestInfo
		if err := rows.Scan(
			&req.ID,
			&req.Method,
			&req.URL,
			&req.Domain,
			&req.Path,
			&req.Query,
			&req.Status,
			&req.Timestamp,
		); err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}

	return requests, nil
}

// GetRequestsByDomain retrieves all requests for a specific domain
func (c *Client) GetRequestsByDomain(domain string) ([]RequestInfo, error) {
	query := `
		SELECT id, method, url, domain, path, query, status, timestamp 
		FROM requests 
		WHERE domain = ?
	`
	rows, err := c.db.Query(query, domain)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []RequestInfo
	for rows.Next() {
		var req RequestInfo
		if err := rows.Scan(
			&req.ID,
			&req.Method,
			&req.URL,
			&req.Domain,
			&req.Path,
			&req.Query,
			&req.Status,
			&req.Timestamp,
		); err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}

	return requests, nil
}
