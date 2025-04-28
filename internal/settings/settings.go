package settings

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// Settings represents the application settings
type Settings struct {
	ID             int    `json:"id"`
	ProjectName    string `json:"project_name"`
	OpenAIAPIURL   string `json:"openai_api_url"`
	OpenAIAPIKey   string `json:"openai_api_key"`
	ProxyPort      string `json:"proxy_port"`
	InteractshHost string `json:"interactsh_host"`
	InteractshPort int    `json:"interactsh_port"`
	CreatedAt      string `json:"created_at"`
}

// Client represents the settings client
type Client struct {
	db *sql.DB
}

// NewClient creates a new settings client
func NewClient(db *sql.DB) (*Client, error) {
	client := &Client{db: db}

	// Ensure settings table exists before attempting to use it
	if err := client.ensureTableExists(); err != nil {
		return nil, fmt.Errorf("failed to ensure settings table exists: %v", err)
	}

	return client, nil
}

// ensureTableExists creates the settings table if it doesn't exist
func (c *Client) ensureTableExists() error {
	log.Printf("Ensuring settings table exists...")

	// First create the table if it doesn't exist
	query := `
	CREATE TABLE IF NOT EXISTS settings (
		id integer PRIMARY KEY,
		project_name varchar,
		openai_api_url varchar,
		openai_api_key varchar,
		proxy_port varchar,
		theme varchar,
		interactsh_host varchar,
		interactsh_port int,
		created_at DATETIME
	)`

	_, err := c.db.Exec(query)
	if err != nil {
		log.Printf("Error creating settings table: %v", err)
		return fmt.Errorf("failed to create settings table: %v", err)
	}

	// Check if we need to add default settings
	var count int
	err = c.db.QueryRow("SELECT COUNT(*) FROM settings").Scan(&count)
	if err != nil {
		log.Printf("Error checking settings count: %v", err)
		return fmt.Errorf("failed to check settings count: %v", err)
	}

	// If no settings exist, add default settings
	if count == 0 {
		log.Printf("No settings found, adding default settings...")

		// Default port that doesn't require admin rights (>1024)
		defaultPort := "8080"

		_, err = c.db.Exec(`
			INSERT INTO settings (
				id, project_name, openai_api_url, openai_api_key, proxy_port, 
				theme, interactsh_host, interactsh_port, created_at
			) VALUES (
				1, 'Default Project', 'https://api.openai.com/v1/chat/completions', '', ?,
				'dark', 'oast.pro', 1337, ?
			)
		`, defaultPort, time.Now().Format(time.RFC3339))

		if err != nil {
			log.Printf("Error inserting default settings: %v", err)
			return fmt.Errorf("failed to insert default settings: %v", err)
		}
		log.Printf("Default settings added successfully")
	}

	log.Printf("Successfully created/verified settings table")
	return nil
}

// LoadSettings loads settings from the database
func (c *Client) LoadSettings() (*Settings, error) {
	row := c.db.QueryRow("SELECT id, project_name, openai_api_url, openai_api_key, proxy_port, interactsh_host, interactsh_port, created_at FROM settings LIMIT 1")
	var settings Settings
	err := row.Scan(
		&settings.ID,
		&settings.ProjectName,
		&settings.OpenAIAPIURL,
		&settings.OpenAIAPIKey,
		&settings.ProxyPort,
		&settings.InteractshHost,
		&settings.InteractshPort,
		&settings.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

// UpdateSettings updates the settings in the database
func (c *Client) UpdateSettings(settings *Settings) error {
	_, err := c.db.Exec(`
		UPDATE settings
		SET project_name = ?, openai_api_url = ?, openai_api_key = ?, proxy_port = ?, interactsh_host = ?, interactsh_port = ?, created_at = ?
		WHERE id = ?
	`, settings.ProjectName, settings.OpenAIAPIURL, settings.OpenAIAPIKey, settings.ProxyPort, settings.InteractshHost, settings.InteractshPort, settings.CreatedAt, settings.ID)

	if err != nil {
		log.Printf("Failed to update settings: %v", err)
		return err
	}

	return nil
}
