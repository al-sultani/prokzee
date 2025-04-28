package plugins

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// Plugin represents a plugin in the system
type Plugin struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsActive    bool   `json:"is_active"`
	Code        string `json:"code"`
	Template    string `json:"template"`
	Version     string `json:"version"`
	Author      string `json:"author"`
	CreatedAt   string `json:"created_at"`
}

// Client handles plugin operations
type Client struct {
	db *sql.DB
}

// NewClient creates a new plugin client
func NewClient(db *sql.DB) (*Client, error) {
	client := &Client{
		db: db,
	}

	// Ensure the plugins table exists
	err := client.ensurePluginsTableExists()
	if err != nil {
		return nil, fmt.Errorf("failed to ensure plugins table exists: %v", err)
	}

	return client, nil
}

// ensurePluginsTableExists creates the plugins table if it doesn't exist
func (c *Client) ensurePluginsTableExists() error {
	// First, check if the table exists
	var tableName string
	err := c.db.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='plugins'").Scan(&tableName)

	if err == sql.ErrNoRows {
		// Create new table with INTEGER for is_active
		_, err := c.db.Exec(`
			CREATE TABLE plugins (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT,
				description TEXT,
				is_active INTEGER NOT NULL DEFAULT 0,
				code TEXT,
				template TEXT,
				version TEXT,
				author TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)
		return err
	} else if err != nil {
		return fmt.Errorf("failed to check table existence: %v", err)
	}

	// Table exists, check if we need to migrate the is_active column
	var columnType string
	err = c.db.QueryRow("SELECT type FROM pragma_table_info('plugins') WHERE name='is_active'").Scan(&columnType)
	if err != nil {
		return fmt.Errorf("failed to check column type: %v", err)
	}

	// If the column is not INTEGER, migrate it
	if columnType != "INTEGER" {
		// Begin transaction for the migration
		tx, err := c.db.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin transaction: %v", err)
		}
		defer tx.Rollback()

		// Create temporary table with correct schema
		_, err = tx.Exec(`
			CREATE TABLE plugins_temp (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT,
				description TEXT,
				is_active INTEGER NOT NULL DEFAULT 0,
				code TEXT,
				template TEXT,
				version TEXT,
				author TEXT,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`)
		if err != nil {
			return fmt.Errorf("failed to create temporary table: %v", err)
		}

		// Copy data with converted is_active values
		_, err = tx.Exec(`
			INSERT INTO plugins_temp (id, name, description, is_active, code, template, version, author, created_at)
			SELECT 
				id, 
				name, 
				description, 
				CASE 
					WHEN is_active = 'true' OR is_active = 1 THEN 1 
					ELSE 0 
				END,
				code,
				template,
				version,
				author,
				created_at
			FROM plugins
		`)
		if err != nil {
			return fmt.Errorf("failed to copy data: %v", err)
		}

		// Drop old table
		_, err = tx.Exec("DROP TABLE plugins")
		if err != nil {
			return fmt.Errorf("failed to drop old table: %v", err)
		}

		// Rename new table
		_, err = tx.Exec("ALTER TABLE plugins_temp RENAME TO plugins")
		if err != nil {
			return fmt.Errorf("failed to rename table: %v", err)
		}

		// Commit transaction
		if err = tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration: %v", err)
		}

		fmt.Println("Successfully migrated plugins table to use INTEGER for is_active")
	}

	return nil
}

// LoadPlugins loads all plugins from the database
func (c *Client) LoadPlugins() ([]Plugin, error) {
	rows, err := c.db.Query("SELECT id, name, description, is_active, code, template, version, author, created_at FROM plugins")
	if err != nil {
		return nil, fmt.Errorf("failed to query plugins: %v", err)
	}
	defer rows.Close()

	var plugins []Plugin
	for rows.Next() {
		var p Plugin
		var createdAt sql.NullString
		var isActive sql.NullInt64 // Use NullInt64 to handle potential NULL values
		err := rows.Scan(&p.ID, &p.Name, &p.Description, &isActive, &p.Code, &p.Template, &p.Version, &p.Author, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan plugin: %v", err)
		}
		if createdAt.Valid {
			p.CreatedAt = createdAt.String
		} else {
			p.CreatedAt = time.Now().Format(time.RFC3339)
		}
		p.IsActive = isActive.Valid && isActive.Int64 == 1
		plugins = append(plugins, p)
	}

	return plugins, nil
}

// SavePlugin saves a new plugin to the database
func (c *Client) SavePlugin(pluginData string) (*Plugin, error) {
	var plugin Plugin
	err := json.Unmarshal([]byte(pluginData), &plugin)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal plugin data: %v", err)
	}

	// Set current time for created_at if not provided
	if plugin.CreatedAt == "" {
		plugin.CreatedAt = time.Now().Format(time.RFC3339)
	}

	result, err := c.db.Exec(`
		INSERT INTO plugins (name, description, is_active, code, template, version, author, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, plugin.Name, plugin.Description, plugin.IsActive, plugin.Code, plugin.Template, plugin.Version, plugin.Author, plugin.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert plugin: %v", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get last insert ID: %v", err)
	}
	plugin.ID = int(id)

	return &plugin, nil
}

// UpdatePlugin updates an existing plugin in the database
func (c *Client) UpdatePlugin(pluginData string) (*Plugin, error) {
	fmt.Printf("Received plugin update request: %s\n", pluginData)

	var plugin Plugin
	err := json.Unmarshal([]byte(pluginData), &plugin)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal plugin data: %v", err)
	}

	fmt.Printf("Parsed plugin update request: id=%d, name=%s, isActive=%v\n",
		plugin.ID, plugin.Name, plugin.IsActive)

	// Begin a transaction
	tx, err := c.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %v", err)
	}
	defer tx.Rollback() // Rollback if we don't commit

	// Fetch the current plugin state from the database
	var currentPlugin Plugin
	var isActive sql.NullInt64 // Use NullInt64 to handle potential NULL values
	err = tx.QueryRow(`
		SELECT id, name, description, is_active, code, template, version, author, created_at
		FROM plugins WHERE id = ?
	`, plugin.ID).Scan(
		&currentPlugin.ID,
		&currentPlugin.Name,
		&currentPlugin.Description,
		&isActive,
		&currentPlugin.Code,
		&currentPlugin.Template,
		&currentPlugin.Version,
		&currentPlugin.Author,
		&currentPlugin.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch current plugin state: %v", err)
	}
	currentPlugin.IsActive = isActive.Valid && isActive.Int64 == 1

	fmt.Printf("Current database state for plugin %d: isActive=%v\n",
		currentPlugin.ID, currentPlugin.IsActive)
	fmt.Printf("Requested state change for plugin %d: isActive=%v\n",
		plugin.ID, plugin.IsActive)

	// Convert bool to int for SQLite
	isActiveInt := 0
	if plugin.IsActive {
		isActiveInt = 1
	}

	// If this is a toggle operation (only is_active changed)
	if plugin.Name == currentPlugin.Name &&
		plugin.Description == currentPlugin.Description &&
		plugin.Code == currentPlugin.Code &&
		plugin.Template == currentPlugin.Template {

		fmt.Printf("Performing toggle operation for plugin %d\n", plugin.ID)

		// Update only the is_active field
		result, err := tx.Exec(`
			UPDATE plugins 
			SET is_active = ?
			WHERE id = ?
		`, isActiveInt, plugin.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to update plugin active state: %v", err)
		}

		// Verify the update
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("failed to get rows affected: %v", err)
		}
		if rowsAffected != 1 {
			return nil, fmt.Errorf("expected 1 row affected, got %d", rowsAffected)
		}

		fmt.Printf("Toggle operation completed for plugin %d\n", plugin.ID)
	} else {
		fmt.Printf("Performing full update for plugin %d\n", plugin.ID)

		// This is a full update - keep original version and author
		result, err := tx.Exec(`
			UPDATE plugins 
			SET name = ?, description = ?, is_active = ?, code = ?, template = ?, version = ?, author = ?
			WHERE id = ?
		`, plugin.Name, plugin.Description, isActiveInt, plugin.Code, plugin.Template, currentPlugin.Version, currentPlugin.Author, plugin.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to update plugin: %v", err)
		}

		// Verify the update
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("failed to get rows affected: %v", err)
		}
		if rowsAffected != 1 {
			return nil, fmt.Errorf("expected 1 row affected, got %d", rowsAffected)
		}

		fmt.Printf("Full update completed for plugin %d\n", plugin.ID)
	}

	// Verify the final state
	var updatedPlugin Plugin
	var finalIsActive sql.NullInt64
	err = tx.QueryRow(`
		SELECT id, name, description, is_active, code, template, version, author, created_at
		FROM plugins WHERE id = ?
	`, plugin.ID).Scan(
		&updatedPlugin.ID,
		&updatedPlugin.Name,
		&updatedPlugin.Description,
		&finalIsActive,
		&updatedPlugin.Code,
		&updatedPlugin.Template,
		&updatedPlugin.Version,
		&updatedPlugin.Author,
		&updatedPlugin.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to verify updated plugin state: %v", err)
	}
	updatedPlugin.IsActive = finalIsActive.Valid && finalIsActive.Int64 == 1

	fmt.Printf("Final database state for plugin %d: isActive=%v\n",
		updatedPlugin.ID, updatedPlugin.IsActive)

	// Commit the transaction
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %v", err)
	}

	fmt.Printf("Successfully committed update for plugin %d\n", plugin.ID)
	return &updatedPlugin, nil
}

// DeletePlugin deletes a plugin from the database
func (c *Client) DeletePlugin(pluginID int) error {
	_, err := c.db.Exec("DELETE FROM plugins WHERE id = ?", pluginID)
	if err != nil {
		return fmt.Errorf("failed to delete plugin: %v", err)
	}
	return nil
}
