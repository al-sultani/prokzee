package matchreplace

import (
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// Rule represents a match and replace rule
type Rule struct {
	ID             int    `json:"id"`
	RuleName       string `json:"rule_name"`
	MatchType      string `json:"match_type"`
	MatchContent   string `json:"match_content"`
	ReplaceContent string `json:"replace_content"`
	Target         string `json:"target"` // "request" or "response"
	Enabled        bool   `json:"enabled"`
}

// Client represents the match and replace client
type Client struct {
	db    *sql.DB
	rules []Rule
}

// NewClient creates a new match and replace client
func NewClient(db *sql.DB) (*Client, error) {
	client := &Client{
		db: db,
	}

	// Ensure table exists before loading rules
	if err := client.ensureTableExists(); err != nil {
		return nil, fmt.Errorf("failed to ensure match_replace_rules table exists: %v", err)
	}

	err := client.loadRules()
	if err != nil {
		return nil, fmt.Errorf("failed to load match replace rules: %v", err)
	}

	return client, nil
}

// ensureTableExists creates the match_replace_rules table if it doesn't exist
func (c *Client) ensureTableExists() error {
	log.Printf("Ensuring match_replace_rules table exists...")
	query := `
	CREATE TABLE IF NOT EXISTS match_replace_rules (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		rule_name TEXT,
		match_type TEXT,
		match_content TEXT,
		replace_content TEXT,
		target TEXT,
		enabled BOOLEAN
	)`

	_, err := c.db.Exec(query)
	if err != nil {
		log.Printf("Error creating match_replace_rules table: %v", err)
		return fmt.Errorf("failed to create match_replace_rules table: %v", err)
	}
	log.Printf("Successfully created/verified match_replace_rules table")
	return nil
}

// GetAllRules returns all match and replace rules
func (c *Client) GetAllRules() ([]Rule, error) {
	return c.rules, nil
}

// AddRule adds a new match and replace rule
func (c *Client) AddRule(rule Rule) error {
	query := `
		INSERT INTO match_replace_rules (rule_name, match_type, match_content, replace_content, target, enabled)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := c.db.Exec(query, rule.RuleName, rule.MatchType, rule.MatchContent, rule.ReplaceContent, rule.Target, rule.Enabled)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	rule.ID = int(id)
	c.rules = append(c.rules, rule)
	return nil
}

// DeleteRule deletes a match and replace rule
func (c *Client) DeleteRule(ruleID int) error {
	query := `DELETE FROM match_replace_rules WHERE id = ?`
	_, err := c.db.Exec(query, ruleID)
	if err != nil {
		return err
	}

	// Remove the rule from in-memory array
	for i, rule := range c.rules {
		if rule.ID == ruleID {
			c.rules = append(c.rules[:i], c.rules[i+1:]...)
			break
		}
	}

	return nil
}

// UpdateRule updates an existing match and replace rule
func (c *Client) UpdateRule(rule Rule) error {
	query := `
		UPDATE match_replace_rules
		SET rule_name = ?, match_type = ?, match_content = ?, replace_content = ?, target = ?, enabled = ?
		WHERE id = ?
	`
	_, err := c.db.Exec(query, rule.RuleName, rule.MatchType, rule.MatchContent, rule.ReplaceContent, rule.Target, rule.Enabled, rule.ID)
	if err != nil {
		return err
	}

	// Update the in-memory rule
	for i, r := range c.rules {
		if r.ID == rule.ID {
			c.rules[i] = rule
			break
		}
	}

	return nil
}

// loadRules loads all match and replace rules from the database
func (c *Client) loadRules() error {
	rows, err := c.db.Query("SELECT id, rule_name, match_type, match_content, replace_content, target, enabled FROM match_replace_rules")
	if err != nil {
		return err
	}
	defer rows.Close()

	var rules []Rule
	for rows.Next() {
		var rule Rule
		if err := rows.Scan(&rule.ID, &rule.RuleName, &rule.MatchType, &rule.MatchContent, &rule.ReplaceContent, &rule.Target, &rule.Enabled); err != nil {
			return err
		}
		rules = append(rules, rule)
	}
	c.rules = rules
	return nil
}

// LoadRules loads all match and replace rules from the database
func (c *Client) LoadRules() error {
	return c.loadRules()
}

// ApplyToRequest applies match and replace rules to an HTTP request
func (c *Client) ApplyToRequest(req *http.Request) (*http.Request, error) {
	if req.Body == nil {
		return req, nil
	}

	bodyBytes, err := io.ReadAll(req.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading request body: %v", err)
	}

	// Close the original body
	req.Body.Close()

	originalBody := string(bodyBytes)
	modifiedBody := originalBody

	for _, rule := range c.rules {
		if !rule.Enabled || rule.Target != "request" {
			continue
		}

		// Apply the rule based on match type
		if rule.MatchType == "body" {
			// Simple string replacement for body
			modifiedBody = strings.ReplaceAll(modifiedBody, rule.MatchContent, rule.ReplaceContent)
		} else if rule.MatchType == "header" {
			// Handle header replacements
			// Parse the header name and value from MatchContent
			parts := strings.SplitN(rule.MatchContent, ":", 2)
			if len(parts) == 2 {
				headerName := strings.TrimSpace(parts[0])
				headerValue := strings.TrimSpace(parts[1])

				// If the header matches, replace its value
				if req.Header.Get(headerName) == headerValue {
					req.Header.Set(headerName, rule.ReplaceContent)
				}
			}
		}
	}

	// Only update if the body was actually modified
	if modifiedBody != originalBody {
		// Update the body
		req.Body = io.NopCloser(strings.NewReader(modifiedBody))

		// Update Content-Length header if it exists
		if req.Header.Get("Content-Length") != "" {
			req.Header.Set("Content-Length", fmt.Sprintf("%d", len(modifiedBody)))
		}

		// Update the ContentLength field
		req.ContentLength = int64(len(modifiedBody))
	} else {
		// Restore the original body if no changes were made
		req.Body = io.NopCloser(strings.NewReader(originalBody))
	}

	return req, nil
}

// ApplyToResponse applies match and replace rules to an HTTP response
func (c *Client) ApplyToResponse(resp *http.Response) (*http.Response, error) {
	if resp.Body == nil {
		return resp, nil
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("error reading response body: %v", err)
	}

	// Close the original body
	resp.Body.Close()

	originalBody := string(bodyBytes)
	modifiedBody := originalBody

	for _, rule := range c.rules {
		if !rule.Enabled || rule.Target != "response" {
			continue
		}

		// Apply the rule based on match type
		if rule.MatchType == "body" {
			// Simple string replacement for body
			modifiedBody = strings.ReplaceAll(modifiedBody, rule.MatchContent, rule.ReplaceContent)
		} else if rule.MatchType == "header" {
			// Handle header replacements
			// Parse the header name and value from MatchContent
			parts := strings.SplitN(rule.MatchContent, ":", 2)
			if len(parts) == 2 {
				headerName := strings.TrimSpace(parts[0])
				headerValue := strings.TrimSpace(parts[1])

				// If the header matches, replace its value
				if resp.Header.Get(headerName) == headerValue {
					resp.Header.Set(headerName, rule.ReplaceContent)
				}
			}
		}
	}

	// Only update if the body was actually modified
	if modifiedBody != originalBody {
		// Update the body
		resp.Body = io.NopCloser(strings.NewReader(modifiedBody))

		// Update Content-Length header if it exists
		if resp.Header.Get("Content-Length") != "" {
			resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(modifiedBody)))
		}

		// Update the ContentLength field
		resp.ContentLength = int64(len(modifiedBody))
	} else {
		// Restore the original body if no changes were made
		resp.Body = io.NopCloser(strings.NewReader(originalBody))
	}

	return resp, nil
}
