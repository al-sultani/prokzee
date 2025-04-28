package rules

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// Rule represents a rule for request interception
type Rule struct {
	ID           int    `json:"id"`
	RuleName     string `json:"rule_name"`
	Operator     string `json:"operator"`
	MatchType    string `json:"match_type"`
	Relationship string `json:"relationship"`
	Pattern      string `json:"pattern"`
	Enabled      bool   `json:"enabled"`
}

// Client represents the rules client
type Client struct {
	db         *sql.DB
	rules      []Rule
	regexCache *regexCache
}

// RuleValidationError represents a validation error
type RuleValidationError struct {
	Field   string
	Message string
}

func (e *RuleValidationError) Error() string {
	return fmt.Sprintf("%s: %s", e.Field, e.Message)
}

// ValidateRule validates a rule before saving
func (c *Client) ValidateRule(rule Rule) error {
	// Validate rule name
	if strings.TrimSpace(rule.RuleName) == "" {
		return &RuleValidationError{Field: "rule_name", Message: "cannot be empty"}
	}

	// Check for duplicate rule names
	for _, r := range c.rules {
		if r.ID != rule.ID && r.RuleName == rule.RuleName {
			return &RuleValidationError{Field: "rule_name", Message: "rule name already exists"}
		}
	}

	// Validate operator
	validOperators := map[string]bool{"and": true, "or": true}
	if !validOperators[rule.Operator] {
		return &RuleValidationError{Field: "operator", Message: "must be 'and' or 'or'"}
	}

	// Validate match type
	validMatchTypes := map[string]bool{
		"domain": true, "protocol": true, "method": true,
		"url": true, "path": true, "file_extension": true,
		"header": true,
	}
	if !validMatchTypes[rule.MatchType] {
		return &RuleValidationError{Field: "match_type", Message: "invalid match type"}
	}

	// Validate relationship
	validRelationships := map[string]bool{"matches": true, "doesn't match": true}
	if !validRelationships[rule.Relationship] {
		return &RuleValidationError{Field: "relationship", Message: "must be 'matches' or 'doesn't match'"}
	}

	// Validate pattern
	if strings.TrimSpace(rule.Pattern) == "" {
		return &RuleValidationError{Field: "pattern", Message: "cannot be empty"}
	}

	// Validate pattern as regex
	if _, err := regexp.Compile(rule.Pattern); err != nil {
		return &RuleValidationError{Field: "pattern", Message: "invalid regex pattern"}
	}

	return nil
}

// Cache for compiled regex patterns
type regexCache struct {
	patterns map[string]*regexp.Regexp
	mu       sync.RWMutex
}

func newRegexCache() *regexCache {
	return &regexCache{
		patterns: make(map[string]*regexp.Regexp),
	}
}

func (c *regexCache) getPattern(pattern string) (*regexp.Regexp, error) {
	c.mu.RLock()
	if re, ok := c.patterns[pattern]; ok {
		c.mu.RUnlock()
		return re, nil
	}
	c.mu.RUnlock()

	// Compile and cache the pattern
	c.mu.Lock()
	defer c.mu.Unlock()

	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}
	c.patterns[pattern] = re
	return re, nil
}

// NewClient creates a new rules client
func NewClient(db *sql.DB) (*Client, error) {
	client := &Client{
		db:         db,
		regexCache: newRegexCache(),
	}

	// Initialize rules table and load rules
	err := client.initializeRulesTable()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize rules: %v", err)
	}

	err = client.loadRules()
	if err != nil {
		return nil, fmt.Errorf("failed to load rules: %v", err)
	}

	return client, nil
}

// initializeRulesTable initializes the rules table with default rules
func (c *Client) initializeRulesTable() error {
	// Create the rules table if it doesn't exist
	_, err := c.db.Exec(`
		CREATE TABLE IF NOT EXISTS rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			rule_name TEXT,
			operator TEXT,
			match_type TEXT,
			relationship TEXT,
			pattern TEXT,
			enabled INTEGER DEFAULT 1
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create rules table: %v", err)
	}

	return nil
}

// RuleEvaluation evaluates if a request should be intercepted based on rules
func (c *Client) RuleEvaluation(req *http.Request) bool {
	//log.Printf("Evaluating request: %s %s", req.Method, req.URL.String())

	// Group rules by operator
	andRules := []Rule{}
	orRules := []Rule{}

	for _, rule := range c.rules {
		if !rule.Enabled {
			continue
		}

		if rule.Operator == "and" {
			andRules = append(andRules, rule)
		} else {
			orRules = append(orRules, rule)
		}
	}

	log.Printf("Evaluating %d AND rules and %d OR rules", len(andRules), len(orRules))

	// Evaluate AND rules - all must pass to intercept
	for _, rule := range andRules {
		result, err := c.evaluateCondition(req, rule)
		if err != nil {
			log.Printf("Error evaluating rule '%s': %v", rule.RuleName, err)
			continue
		}

		// If an AND rule fails, don't intercept
		if !result {
			log.Printf("Request URL %s excluded by AND rule '%s'", req.URL.String(), rule.RuleName)
			return false
		}
	}

	// Evaluate OR rules - any passing rule allows interception
	if len(orRules) > 0 {
		anyOrRulePassed := false

		for _, rule := range orRules {
			result, err := c.evaluateCondition(req, rule)
			if err != nil {
				log.Printf("Error evaluating rule '%s': %v", rule.RuleName, err)
				continue
			}

			if result {
				anyOrRulePassed = true
				break
			}
		}

		// If no OR rule passes, don't intercept
		if !anyOrRulePassed {
			log.Printf("Request URL %s excluded by OR rules", req.URL.String())
			return false
		}
	}

	log.Printf("All rules passed, intercepting request: %s", req.URL.String())
	return true
}

// Improved rule evaluation with caching and better performance
func (c *Client) evaluateCondition(req *http.Request, rule Rule) (bool, error) {
	// Get or compile regex pattern
	re, err := c.regexCache.getPattern(rule.Pattern)
	if err != nil {
		return false, fmt.Errorf("invalid pattern in rule '%s': %v", rule.RuleName, err)
	}

	var matched bool
	switch rule.MatchType {
	case "domain":
		matched = re.MatchString(req.URL.Hostname())
	case "protocol":
		matched = re.MatchString(req.URL.Scheme)
	case "method":
		matched = re.MatchString(req.Method)
	case "url":
		matched = re.MatchString(req.URL.String())
	case "path":
		matched = re.MatchString(req.URL.Path)
	case "file_extension":
		matched = c.evaluateFileExtension(req.URL.Path)
	case "header":
		matched = c.evaluateHeaders(req.Header, re)
	default:
		return false, fmt.Errorf("unknown match type: %s", rule.MatchType)
	}

	// Apply relationship
	if rule.Relationship == "doesn't match" {
		matched = !matched
	}

	return matched, nil
}

// Optimized header evaluation
func (c *Client) evaluateHeaders(headers http.Header, re *regexp.Regexp) bool {
	for key, values := range headers {
		for _, value := range values {
			if re.MatchString(key + ": " + value) {
				return true
			}
		}
	}
	return false
}

// Optimized file extension evaluation
func (c *Client) evaluateFileExtension(path string) bool {
	// Strip query parameters
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}

	ext := strings.ToLower(filepath.Ext(path))
	if ext == "" {
		return false
	}
	ext = ext[1:] // Remove leading dot

	// Use a map for O(1) lookup
	staticExtensions := map[string]bool{
		// Images
		"jpg": true, "jpeg": true, "png": true, "gif": true,
		"bmp": true, "svg": true, "webp": true, "ico": true,
		"tiff": true, "avif": true,
		// Styles
		"css": true, "less": true, "scss": true,
		// Fonts
		"woff": true, "woff2": true, "ttf": true, "otf": true,
		"eot": true,
		// Scripts and data
		"js": true, "mjs": true, "map": true, "json": true,
		// Documents
		"pdf": true, "doc": true, "docx": true,
		"xls": true, "xlsx": true, "ppt": true, "pptx": true,
		// Media
		"mp3": true, "mp4": true, "wav": true, "avi": true,
		"mov": true, "webm": true, "ogg": true, "flac": true,
		"aac": true,
		// Archives
		"zip": true, "rar": true, "tar": true, "gz": true,
		"7z": true,
	}

	return staticExtensions[ext]
}

// GetAllRules returns all rules
func (c *Client) GetAllRules() ([]Rule, error) {
	return c.rules, nil
}

// AddRule adds a new rule
func (c *Client) AddRule(rule Rule) error {
	if err := c.ValidateRule(rule); err != nil {
		return err
	}

	query := `
		INSERT INTO rules (rule_name, operator, match_type, relationship, pattern, enabled)
		VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := c.db.Exec(query, rule.RuleName, rule.Operator, rule.MatchType, rule.Relationship, rule.Pattern, rule.Enabled)
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

// DeleteRule deletes a rule
func (c *Client) DeleteRule(ruleID int) error {
	query := `DELETE FROM rules WHERE id = ?`
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

// UpdateRule updates an existing rule
func (c *Client) UpdateRule(rule Rule) error {
	if err := c.ValidateRule(rule); err != nil {
		return err
	}

	query := `
		UPDATE rules
		SET rule_name = ?, operator = ?, match_type = ?, relationship = ?, pattern = ?, enabled = ?
		WHERE id = ?
	`
	_, err := c.db.Exec(query, rule.RuleName, rule.Operator, rule.MatchType, rule.Relationship, rule.Pattern, rule.Enabled, rule.ID)
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

// loadRules loads all rules from the database
func (c *Client) loadRules() error {
	rows, err := c.db.Query("SELECT id, rule_name, operator, match_type, relationship, pattern, enabled FROM rules")
	if err != nil {
		return err
	}
	defer rows.Close()

	var rules []Rule
	for rows.Next() {
		var rule Rule
		if err := rows.Scan(&rule.ID, &rule.RuleName, &rule.Operator, &rule.MatchType, &rule.Relationship, &rule.Pattern, &rule.Enabled); err != nil {
			return err
		}
		rules = append(rules, rule)
	}
	c.rules = rules
	return nil
}
