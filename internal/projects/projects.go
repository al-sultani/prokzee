package projects

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Client represents the projects client
type Client struct {
	ctx         context.Context
	db          *sql.DB
	dbMutex     *sync.RWMutex
	projectsDir string
}

// NewClient creates a new projects client
func NewClient(ctx context.Context, db *sql.DB, dbMutex *sync.RWMutex) *Client {
	// Get the appropriate config directory for the current OS
	configDir, err := os.UserConfigDir()
	if err != nil {
		log.Printf("Error getting user config directory: %v, falling back to home directory", err)
		homeDir, homeDirErr := os.UserHomeDir()
		if homeDirErr != nil {
			log.Printf("Error getting user home directory: %v, using current directory", homeDirErr)
			configDir = "."
		} else {
			configDir = homeDir
		}
	}

	// Create a dedicated app data directory
	appDataDir := filepath.Join(configDir, "ProKZee")
	projectsDir := filepath.Join(appDataDir, "projects")

	// Ensure projects directory exists with proper permissions
	if err := os.MkdirAll(projectsDir, 0755); err != nil {
		log.Printf("Warning: Failed to create projects directory: %v, using current directory", err)
		projectsDir = "projects"
		// Try to create the fallback directory
		if err := os.MkdirAll(projectsDir, 0755); err != nil {
			log.Printf("Also failed to create projects directory in current location: %v", err)
		}
	}

	log.Printf("Using projects directory: %s", projectsDir)

	return &Client{
		ctx:         ctx,
		db:          db,
		dbMutex:     dbMutex,
		projectsDir: projectsDir,
	}
}

// ListProjects returns a list of all available projects
func (c *Client) ListProjects() ([]string, error) {
	// Ensure the projects directory exists
	if err := os.MkdirAll(c.projectsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create projects directory: %v", err)
	}

	// Read the projects directory
	entries, err := os.ReadDir(c.projectsDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read projects directory: %v", err)
	}

	var projects []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".db") {
			projects = append(projects, entry.Name())
		}
	}

	return projects, nil
}

// CreateNewProject creates a new SQLite database in the projects_data folder and initializes it with default data
func (c *Client) CreateNewProject(projectName string) error {
	// Process the project name
	projectName = strings.ToLower(projectName)
	projectName = strings.ReplaceAll(projectName, " ", "_")
	projectName = strings.TrimSpace(projectName)

	// Ensure the projects directory exists
	if err := os.MkdirAll(c.projectsDir, 0755); err != nil {
		return fmt.Errorf("failed to create projects directory: %v", err)
	}

	dbPath := filepath.Join(c.projectsDir, projectName+".db")

	// Create the new database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return fmt.Errorf("failed to create new database: %v", err)
	}
	defer db.Close()

	// Initialize the new database with schema
	_, err = db.Exec(`
		CREATE TABLE requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			request_id TEXT,
			url TEXT,
			port TEXT,
			request_headers TEXT,
			request_body TEXT,
			http_version TEXT,
			response_headers TEXT,
			response_body TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			method varchar NOT NULL DEFAULT 'GET',
			status varchar NOT NULL DEFAULT '',
			path TEXT DEFAULT '',
			query TEXT DEFAULT '',
			domain TEXT DEFAULT '',
			length INTEGER DEFAULT 0,
			mime_type TEXT DEFAULT ''
		);

		CREATE TABLE rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			rule_name TEXT,
			operator TEXT,
			match_type TEXT,
			relationship TEXT,
			pattern TEXT,
			enabled INTEGER DEFAULT 1
		);

		CREATE TABLE match_replace_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			rule_name TEXT,
			match_type TEXT,
			match_content TEXT,
			replace_content TEXT,
			target TEXT,
			enabled BOOLEAN
		);

		CREATE TABLE scope_lists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT,
			pattern TEXT
		);

		CREATE TABLE resender_tabs (
			id integer,
			name varchar DEFAULT 'Tab',
			request_ids_arr varchar,
			timestamp datetime,
			PRIMARY KEY (id)
		);

		CREATE TABLE resender_requests (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			request_id TEXT,
			url TEXT,
			port TEXT,
			request_headers TEXT,
			request_body TEXT,
			http_version TEXT,
			response_headers TEXT DEFAULT '{}',
			response_body TEXT DEFAULT '',
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			method varchar NOT NULL DEFAULT 'GET',
			status varchar NOT NULL DEFAULT '200 OK',
			path TEXT DEFAULT '',
			query TEXT DEFAULT '',
			domain TEXT DEFAULT '',
			length INTEGER DEFAULT 0,
			mime_type TEXT DEFAULT ''
		);

		CREATE TABLE settings (
			id integer,
			project_name varchar,
			openai_api_url varchar,
			openai_api_key varchar,
			proxy_port varchar,
			theme varchar,
			interactsh_host varchar,
			interactsh_port int,
			created_at DATETIME,
			PRIMARY KEY (id)
		);

		CREATE TABLE chat_contexts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			name TEXT DEFAULT 'New Context'
		);

		CREATE TABLE chat_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			chat_context_id INTEGER,
			role TEXT,
			content TEXT,
			timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (chat_context_id) REFERENCES chat_contexts(id)
		);

		CREATE TABLE fuzzer_tabs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT,
			target_url TEXT,
			path TEXT,
			method TEXT,
			http_version TEXT,
			headers TEXT,
			body TEXT,
			payloads TEXT
		);

		CREATE TABLE logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			source TEXT NOT NULL
		);

		CREATE INDEX idx_requests_timestamp 
			ON requests(timestamp DESC);

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
		);
	`)
	if err != nil {
		return fmt.Errorf("failed to initialize new database: %v", err)
	}

	// Initialize default settings
	_, err = db.Exec(`
		INSERT INTO settings (
			id, project_name, openai_api_url, openai_api_key, proxy_port, 
			theme, interactsh_host, interactsh_port, created_at
		) VALUES (
			1, ?, 'https://api.openai.com/v1/chat/completions', 'XXXXXXX', '8080',
			'dark', 'oast.fun', 443, CURRENT_TIMESTAMP
		)
	`, projectName)
	if err != nil {
		return fmt.Errorf("failed to initialize settings: %v", err)
	}

	// Add a sample plugin
	_, err = db.Exec(`
		INSERT INTO plugins (
			name, description, is_active, code, template, version, author
		) VALUES (
			'Welcome Message',
			'A simple plugin that displays a themed welcome message',
			0,
			'function init(pluginApi) {
  function updateMessage() {
    const isDarkMode = document.documentElement.classList.contains("dark");
    const messageStyle = isDarkMode ? 
      "background-color: #1f2937; color: #f3f4f6; border: 1px solid #374151;" :
      "background-color: #f3f4f6; color: #1f2937; border: 1px solid #e5e7eb;";
    
    const html = 
      "<div style=\"" + messageStyle + " padding: 20px; border-radius: 8px; margin: 10px; text-align: center;\">" +
        "<h2 style=\"margin-bottom: 10px; font-size: 1.5em; font-weight: bold;\">Welcome to Prokzee!</h2>" +
        "<p style=\"margin-bottom: 15px;\">This is a sample plugin that adapts to your theme preference.</p>" +
        "<p style=\"font-size: 0.9em; opacity: 0.8;\">Current theme: " + (isDarkMode ? "Dark" : "Light") + " mode</p>" +
      "</div>";
    pluginApi.updateUI(html);
  }

  // Initial update
  updateMessage();

  // Update when theme changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === "class") {
        updateMessage();
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  });

  return {
    updateMessage
  };
}',
			'message',
			'1.0.0',
			'System'
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to add sample plugin: %v", err)
	}

	// Create initial resender tab
	_, err = db.Exec(`
		INSERT INTO resender_tabs (
			id, name, request_ids_arr, timestamp
		) VALUES (
			1, 'Tab 1', '[1]', CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create resender tab: %v", err)
	}

	// Add a sample request
	_, err = db.Exec(`
		INSERT INTO resender_requests (
			request_id,
			url,
			port,
			method,
			path,
			domain,
			request_headers,
			request_body,
			http_version,
			response_headers,
			response_body,
			status,
			mime_type,
			length
		) VALUES (
			'req_001',
			'https://postman-echo.com/post',
			'443',
			'POST',
			'/post',
			'postman-echo.com',
			'{"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive", "Host": "postman-echo.com"}',
			'{"tool": "prokzee", "test": "This is a test request", "timestamp": "2024"}',
			'HTTP/1.1',
			'{}',
			'',
			'',
			'',
			0
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create sample request: %v", err)
	}

	// Create initial fuzzer tab
	_, err = db.Exec(`
		INSERT INTO fuzzer_tabs (
			name, target_url, path, method, http_version, headers, body, payloads
		) VALUES (
			'Tab 1',
			'https://postman-echo.com',
			'/post',
			'POST',
			'HTTP/1.1',
			'{"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Accept-Encoding": "gzip, deflate, br", "Connection": "keep-alive", "Host": "postman-echo.com"}',
			'{"tool": "prokzee", "test": "This is a test request", "timestamp": "[__Inject-Here__[1]]"}',
			'[{"type": "list", "list": ["2024", "2025", "2026"]}]'
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create fuzzer tab: %v", err)
	}

	// Add rules for ignoring static files
	_, err = db.Exec(`
		INSERT INTO rules (
			rule_name, operator, match_type, relationship, pattern, enabled
		) VALUES (
			'Exclude certain file extensions',
			'and',
			'file_extension',
			'doesn''t match',
			'\.(?:jpg|jpeg|png|gif|bmp|svg|webp|ico|tiff|avif|css|less|scss|woff|woff2|ttf|otf|eot|js|mjs|map|json|pdf|doc|docx|xls|xlsx|ppt|pptx|mp3|mp4|wav|avi|mov|webm|ogg|flac|aac|zip|rar|tar|gz|7z)$',
			1
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to add static file rule: %v", err)
	}

	return nil
}

// SwitchProject switches to the selected database
func (c *Client) SwitchProject(dbName string) (*sql.DB, error) {
	dbPath := filepath.Join(c.projectsDir, dbName)

	log.Printf("Switching to database: %s", dbPath)

	// Lock for database switch
	c.dbMutex.Lock()
	defer c.dbMutex.Unlock()

	// Open the new database first before closing the old one
	newDB, err := sql.Open("sqlite3", dbPath+"?_journal=WAL&_timeout=5000&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open new database: %v", err)
	}

	// Configure the connection pool
	newDB.SetMaxOpenConns(25)
	newDB.SetMaxIdleConns(5)
	newDB.SetConnMaxLifetime(time.Hour)

	// Test the new connection
	if err := newDB.Ping(); err != nil {
		newDB.Close() // Close the new connection if it fails
		return nil, fmt.Errorf("failed to connect to new database: %v", err)
	}

	// Store the old database connection
	oldDB := c.db

	// Update the client's database reference
	c.db = newDB

	// Close the existing database connection if it exists
	// Do this after setting the new connection to avoid any gap
	if oldDB != nil {
		// Wait a moment for any in-flight transactions to complete
		time.Sleep(time.Second)

		// Close with a timeout to avoid hanging
		closeComplete := make(chan struct{})
		go func() {
			if err := oldDB.Close(); err != nil {
				log.Printf("Warning: error closing old database connection: %v", err)
			}
			close(closeComplete)
		}()

		select {
		case <-closeComplete:
			// Close completed normally
		case <-time.After(5 * time.Second):
			log.Printf("Warning: database close operation timed out")
		}
	}

	return newDB, nil
}
