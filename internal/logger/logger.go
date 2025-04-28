package logger

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Logger struct {
	db     *sql.DB
	ctx    context.Context
	config *Config
}

type Config struct {
	SkipDBLogging bool
}

type LogEntry struct {
	ID        int         `json:"id"`
	Timestamp interface{} `json:"timestamp"`
	Level     string      `json:"level"`
	Message   string      `json:"message"`
	Source    string      `json:"source"`
}

type PaginatedLogs struct {
	Logs        []LogEntry `json:"logs"`
	TotalCount  int        `json:"totalCount"`
	CurrentPage int        `json:"currentPage"`
	TotalPages  int        `json:"totalPages"`
}

func NewLogger(db *sql.DB, ctx context.Context, config *Config) *Logger {
	if config == nil {
		config = &Config{
			SkipDBLogging: false,
		}
	}
	return &Logger{
		db:     db,
		ctx:    ctx,
		config: config,
	}
}

// LogMessage logs a message with the specified level and source
func (l *Logger) LogMessage(level string, message string, source string) {
	// Skip logging common actions to the database
	if shouldSkipLogging(level, message, source) {
		// Still log to CLI for visibility
		logToCLI(level, message, source)
		return
	}

	// Store in database if not configured to skip
	if !l.config.SkipDBLogging {
		// Check if database connection is valid
		if err := l.db.Ping(); err != nil {
			log.Printf("Database connection error in logger: %v", err)
			// Still log to CLI even if database is unavailable
			logToCLI(level, message, source)
			return
		}

		_, err := l.db.Exec(`
			INSERT INTO logs (timestamp, level, message, source)
			VALUES (CURRENT_TIMESTAMP, ?, ?, ?)
		`, level, message, source)

		if err != nil {
			log.Printf("Failed to store log message: %v", err)
			return
		}
	}

	// Always log to CLI
	logToCLI(level, message, source)

	// Emit the new log entry to the frontend if context is available
	if l.ctx != nil {
		runtime.EventsEmit(l.ctx, "backend:logs", []LogEntry{})
	}
}

// GetRecentLogs retrieves paginated logs with filtering and sorting
func (l *Logger) GetRecentLogs(params map[string]interface{}) PaginatedLogs {
	// Default values
	page := 1
	perPage := 10
	filter := "all"
	search := ""
	sortKey := "timestamp"
	sortDirection := "descending"

	// Parse parameters if provided
	if p, ok := params["page"].(float64); ok {
		page = int(p)
	}
	if pp, ok := params["perPage"].(float64); ok {
		perPage = int(pp)
	}
	if f, ok := params["filter"].(string); ok {
		filter = strings.ToLower(f)
	}
	if s, ok := params["search"].(string); ok {
		search = strings.TrimSpace(s)
	}
	if sk, ok := params["sortKey"].(string); ok {
		sortKey = sk
	}
	if sd, ok := params["sortDirection"].(string); ok {
		sortDirection = sd
	}

	// Convert sort direction to SQL syntax
	sqlDirection := "DESC"
	if sortDirection == "ascending" {
		sqlDirection = "ASC"
	}

	// Start building the base query
	baseQuery := `SELECT id, timestamp, level, message, source FROM logs WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM logs WHERE 1=1`
	var queryParams []interface{}

	// Add filters
	if filter != "all" {
		baseQuery += ` AND LOWER(level) = ?`
		countQuery += ` AND LOWER(level) = ?`
		queryParams = append(queryParams, filter)
	}

	if search != "" {
		baseQuery += ` AND (LOWER(message) LIKE ? OR LOWER(source) LIKE ?)`
		countQuery += ` AND (LOWER(message) LIKE ? OR LOWER(source) LIKE ?)`
		searchParam := "%" + strings.ToLower(search) + "%"
		queryParams = append(queryParams, searchParam, searchParam)
	}

	// Get total count
	var totalCount int
	countParams := make([]interface{}, len(queryParams))
	copy(countParams, queryParams)
	err := l.db.QueryRow(countQuery, countParams...).Scan(&totalCount)
	if err != nil {
		log.Printf("Error getting total count: %v", err)
		return PaginatedLogs{}
	}

	// Add sorting with correct SQL syntax
	baseQuery += fmt.Sprintf(" ORDER BY %s %s", sortKey, sqlDirection)

	// Add pagination
	baseQuery += " LIMIT ? OFFSET ?"
	queryParams = append(queryParams, perPage, (page-1)*perPage)

	// Execute the query
	rows, err := l.db.Query(baseQuery, queryParams...)
	if err != nil {
		log.Printf("Error executing query: %v", err)
		return PaginatedLogs{}
	}
	defer rows.Close()

	var logs []LogEntry
	for rows.Next() {
		var entry LogEntry
		var timestamp interface{}
		err := rows.Scan(&entry.ID, &timestamp, &entry.Level, &entry.Message, &entry.Source)
		if err != nil {
			log.Printf("Error scanning log entry: %v", err)
			continue
		}
		entry.Timestamp = timestamp
		logs = append(logs, entry)
	}

	// Calculate total pages
	totalPages := (totalCount + perPage - 1) / perPage
	if totalPages < 1 {
		totalPages = 1
	}

	// Ensure current page is within bounds
	if page > totalPages {
		page = totalPages
	}

	return PaginatedLogs{
		Logs:        logs,
		TotalCount:  totalCount,
		CurrentPage: page,
		TotalPages:  totalPages,
	}
}

// EnsureLogsTableExists creates the logs table if it doesn't exist
func (l *Logger) EnsureLogsTableExists() error {
	_, err := l.db.Exec(`
		CREATE TABLE IF NOT EXISTS logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			level TEXT NOT NULL,
			message TEXT NOT NULL,
			source TEXT NOT NULL
		)
	`)
	return err
}

// RefreshConnection updates the logger's database connection
func (l *Logger) RefreshConnection(db *sql.DB) {
	l.db = db
}

// Helper function to determine if a log message should be skipped from database storage
func shouldSkipLogging(level string, message string, source string) bool {
	// Skip common INFO level logs
	if strings.ToUpper(level) == "INFO" {
		// Skip common proxy server logs
		if source == "ProxyServer" && strings.Contains(message, "Request bypassed (interception off)") {
			return true
		}

		// Skip successful Resender operations
		if source == "Resender" {
			if strings.Contains(message, "Successfully decompressed gzipped response") ||
				strings.Contains(message, "Successfully inserted request with ID") ||
				strings.Contains(message, "Successfully updated Resender tab") {
				return true
			}
		}
	}

	return false
}

// Helper function to log messages to CLI
func logToCLI(level string, message string, source string) {
	// Format the log message
	formattedMessage := fmt.Sprintf("[%s] [%s] %s", strings.ToUpper(level), source, message)

	// Log to appropriate level
	switch strings.ToUpper(level) {
	case "ERROR":
		log.Printf("\033[31m%s\033[0m", formattedMessage) // Red color for errors
	case "WARNING":
		log.Printf("\033[33m%s\033[0m", formattedMessage) // Yellow color for warnings
	case "INFO":
		log.Printf("\033[32m%s\033[0m", formattedMessage) // Green color for info
	default:
		log.Println(formattedMessage) // Default color for other levels
	}
}
