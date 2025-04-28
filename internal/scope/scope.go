package scope

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
)

// Client handles the scope-related functionality
type Client struct {
	db           *sql.DB
	inScopeList  []string
	outScopeList []string
}

// NewClient creates a new scope client
func NewClient(db *sql.DB) (*Client, error) {
	log.Printf("Creating new scope client")
	client := &Client{
		db: db,
	}

	// Ensure the scope_lists table exists
	if err := client.ensureTableExists(); err != nil {
		log.Printf("Error ensuring table exists: %v", err)
		return nil, fmt.Errorf("failed to ensure scope_lists table exists: %v", err)
	}
	log.Printf("Successfully ensured scope_lists table exists")

	// Load scope lists from database
	if err := client.loadScopeListsFromDB(); err != nil {
		log.Printf("Error loading scope lists: %v", err)
		return nil, fmt.Errorf("failed to load scope lists: %v", err)
	}
	log.Printf("Successfully loaded scope lists - in-scope: %v, out-of-scope: %v", client.inScopeList, client.outScopeList)

	// Add validation check
	if len(client.inScopeList) == 0 && len(client.outScopeList) == 0 {
		log.Printf("WARNING: Both scope lists are empty after initialization")
	}

	return client, nil
}

// GetScopeLists returns the current in-scope and out-of-scope lists
func (c *Client) GetScopeLists() ([]string, []string) {
	log.Printf("GetScopeLists called - returning in-scope: %v, out-of-scope: %v", c.inScopeList, c.outScopeList)
	return c.inScopeList, c.outScopeList
}

// GetInScopeList returns the current in-scope list
func (c *Client) GetInScopeList() []string {
	log.Printf("GetInScopeList called - returning: %v", c.inScopeList)
	return c.inScopeList
}

// GetOutScopeList returns the current out-of-scope list
func (c *Client) GetOutScopeList() []string {
	log.Printf("GetOutScopeList called - returning: %v", c.outScopeList)
	return c.outScopeList
}

// UpdateInScopeList updates the in-scope list and saves it to the database
func (c *Client) UpdateInScopeList(newList []string) error {
	log.Printf("Updating in-scope list with %d items: %v", len(newList), newList)
	c.inScopeList = newList
	err := c.saveScopeListToDB("in-scope", newList)
	if err != nil {
		log.Printf("Error saving in-scope list to DB: %v", err)
		return err
	}
	log.Printf("Successfully updated in-scope list")
	return nil
}

// UpdateOutScopeList updates the out-of-scope list and saves it to the database
func (c *Client) UpdateOutScopeList(newList []string) error {
	log.Printf("Updating out-of-scope list with %d items: %v", len(newList), newList)
	c.outScopeList = newList
	err := c.saveScopeListToDB("out-of-scope", newList)
	if err != nil {
		log.Printf("Error saving out-of-scope list to DB: %v", err)
		return err
	}
	log.Printf("Successfully updated out-of-scope list")
	return nil
}

// AddToOutScope adds a pattern to the out-of-scope list
func (c *Client) AddToOutScope(pattern string) error {
	c.outScopeList = append(c.outScopeList, pattern)
	return c.saveScopeListToDB("out-of-scope", c.outScopeList)
}

// AddToInScope adds a pattern to the in-scope list
func (c *Client) AddToInScope(pattern string) error {
	c.inScopeList = append(c.inScopeList, pattern)
	return c.saveScopeListToDB("in-scope", c.inScopeList)
}

// IsInScope checks if a URL is in scope
func (c *Client) IsInScope(host string) bool {
	if c == nil {
		log.Printf("ERROR: Scope client is nil")
		return false
	}
	// Bypass scope check for these hosts
	if host == "wails.localhost" || host == "prokzee" {
		return false
	}

	log.Printf("IsInScope checking host: %s", host)
	log.Printf("Current scope state - in-scope list: %v (length: %d), out-of-scope list: %v (length: %d)",
		c.inScopeList, len(c.inScopeList), c.outScopeList, len(c.outScopeList))

	// First check if URL matches any out-of-scope pattern (these take precedence)
	for _, pattern := range c.outScopeList {
		matched, err := regexp.MatchString(pattern, host)
		if err != nil {
			log.Printf("Error matching out-of-scope pattern '%s': %v", pattern, err)
			continue
		}
		if matched {
			log.Printf("Host %s matches out-of-scope pattern %s", host, pattern)
			return false
		}
	}

	// If there are in-scope patterns defined, check if URL matches any of them
	if len(c.inScopeList) > 0 {
		for _, pattern := range c.inScopeList {
			log.Printf("Trying to match host '%s' against in-scope pattern '%s'", host, pattern)
			matched, err := regexp.MatchString(pattern, host)
			if err != nil {
				log.Printf("Error matching in-scope pattern '%s': %v", pattern, err)
				continue
			}
			if matched {
				log.Printf("Host %s matches in-scope pattern %s", host, pattern)
				return true
			}
		}
		// If we have in-scope patterns but none matched, URL is out of scope
		log.Printf("Host %s did not match any in-scope patterns", host)
		return false
	}

	// If no in-scope patterns defined, everything is in scope by default
	log.Printf("No in-scope patterns defined, host %s is in scope by default", host)
	return true
}

// loadScopeListsFromDB loads the scope lists from the database
func (c *Client) loadScopeListsFromDB() error {
	rows, err := c.db.Query("SELECT type, pattern FROM scope_lists")
	if err != nil {
		log.Printf("Error querying scope_lists: %v", err)
		return err
	}
	defer rows.Close()

	var inScopeList []string
	var outScopeList []string

	rowCount := 0
	for rows.Next() {
		rowCount++
		var listType, pattern string
		if err := rows.Scan(&listType, &pattern); err != nil {
			log.Printf("Error scanning row: %v", err)
			return err
		}
		log.Printf("Loaded scope rule #%d - type: %s, pattern: %s", rowCount, listType, pattern)
		if listType == "in-scope" {
			inScopeList = append(inScopeList, pattern)
		} else if listType == "out-of-scope" {
			outScopeList = append(outScopeList, pattern)
		}
	}

	if err = rows.Err(); err != nil {
		log.Printf("Error iterating rows: %v", err)
		return err
	}

	log.Printf("Found %d total scope rules in database", rowCount)
	log.Printf("Setting scope lists - in-scope: %v (length: %d), out-of-scope: %v (length: %d)",
		inScopeList, len(inScopeList), outScopeList, len(outScopeList))

	c.inScopeList = inScopeList
	c.outScopeList = outScopeList
	return nil
}

// saveScopeListToDB saves the given scope list to the database
func (c *Client) saveScopeListToDB(listType string, list []string) error {
	// Delete existing entries for the given list type
	_, err := c.db.Exec("DELETE FROM scope_lists WHERE type = ?", listType)
	if err != nil {
		return fmt.Errorf("failed to delete existing %s list from database: %v", listType, err)
	}

	// Insert new entries
	for _, pattern := range list {
		_, err := c.db.Exec("INSERT INTO scope_lists (type, pattern) VALUES (?, ?)", listType, pattern)
		if err != nil {
			return fmt.Errorf("failed to insert %s pattern into database: %v", listType, err)
		}
	}

	return nil
}

// ensureTableExists ensures that the scope_lists table exists in the database
func (c *Client) ensureTableExists() error {
	log.Printf("Ensuring scope_lists table exists...")
	query := `
	CREATE TABLE IF NOT EXISTS scope_lists (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		type TEXT NOT NULL,
		pattern TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`

	_, err := c.db.Exec(query)
	if err != nil {
		log.Printf("Error creating scope_lists table: %v", err)
		return fmt.Errorf("failed to create scope_lists table: %v", err)
	}
	log.Printf("Successfully created/verified scope_lists table")
	return nil
}
