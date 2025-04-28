package models

import (
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

// Define a custom type for context keys to avoid string collisions
type contextKey string

// Define constants for our context keys
const (
	CreationTimeKey contextKey = "creationTime"
)

type UserData struct {
	RequestID  string
	BodyBytes  []byte
	Timestamp  time.Time
	Processed  bool
	Approved   bool
	Cancelled  bool
	Error      error
	Response   *http.Response
	BodyReader io.ReadCloser
	FormData   *multipart.Form
}

type LogEntry struct {
	ID        int       `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"` // INFO, WARNING, ERROR, etc.
	Message   string    `json:"message"`
	Source    string    `json:"source"` // Component that generated the log
}

// TrafficData represents the structure of traffic data
type TrafficData struct {
	ID              string `json:"id"`
	URL             string `json:"url"`
	Method          string `json:"method"`
	RequestHeaders  string `json:"request_headers"`
	RequestBody     string `json:"request_body"`
	ResponseHeaders string `json:"response_headers"`
	ResponseBody    string `json:"response_body"`
	Status          string `json:"status"`
}

// SendRequestData represents the structure of request data
type SendRequestData struct {
	URL             string            `json:"url"`
	Method          string            `json:"method"`
	Headers         map[string]string `json:"headers"`
	Body            string            `json:"body"`
	ProtocolVersion string            `json:"protocolVersion"`
}

// Settings struct to represent the settings table
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

type Request struct {
	ID              int    `json:"id"`
	Method          string `json:"method"`
	URL             string `json:"url"`
	Domain          string `json:"domain"`
	Path            string `json:"path"`
	ProtocolVersion string `json:"protocol_version"`
	Query           string `json:"query"`
	RequestHeaders  string `json:"request_headers"`
	RequestBody     string `json:"request_body"`
	ResponseHeaders string `json:"response_headers"`
	ResponseBody    string `json:"response_body"`
	Status          string `json:"status"`
	Length          int64  `json:"length"`
	MimeType        string `json:"mime_type"`
	Timestamp       string `json:"timestamp"`
}

// SiteMapNode represents a node in the site map
type SiteMapNode struct {
	URL      string         `json:"url"`
	Children []*SiteMapNode `json:"children"`
}

type ResenderTab struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	RequestIDs   []int  `json:"requestIds"`
	CurrentIndex int    `json:"currentRequestIndex"`
}

type FuzzerTab struct {
	ID          int                    `json:"id"`
	Name        string                 `json:"name"`
	TargetUrl   string                 `json:"targetUrl"`
	Method      string                 `json:"method"`
	Path        string                 `json:"path"`
	HttpVersion string                 `json:"httpVersion"`
	Headers     map[string]interface{} `json:"headers"`
	Body        string                 `json:"body"`
	Payloads    []Payload              `json:"payloads"`
}

type Payload struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Value       string `json:"value"`
	Description string `json:"description"`
}

// ApprovalResponse struct
type ApprovalResponse struct {
	Approved        bool
	Headers         http.Header
	Body            string
	Method          string
	ProtocolVersion string
	URL             string
	RequestID       string
}

type Stats struct {
	TotalRequests           int `json:"total_requests"`
	TotalRules              int `json:"total_rules"`
	TotalPlugins            int `json:"total_plugins"`
	TotalInScopePatterns    int `json:"total_in_scope_patterns"`
	TotalOutOfScopePatterns int `json:"total_out_of_scope_patterns"`
}

// Rule struct has been moved to internal/rules/rules.go
type Rule struct {
	ID           int    `json:"id"`
	RuleName     string `json:"rule_name"`
	Operator     string `json:"operator"`
	MatchType    string `json:"match_type"`
	Relationship string `json:"relationship"`
	Content      string `json:"content"`
	Enabled      bool   `json:"enabled"`
}

// Add this new struct for pagination response
type PaginatedLogs struct {
	Logs        []LogEntry `json:"logs"`
	TotalCount  int        `json:"totalCount"`
	CurrentPage int        `json:"currentPage"`
	TotalPages  int        `json:"totalPages"`
}

// Add new struct for paginated requests response
type PaginatedRequests struct {
	Requests    []Request `json:"requests"`
	TotalCount  int       `json:"totalCount"`
	CurrentPage int       `json:"currentPage"`
	TotalPages  int       `json:"totalPages"`
}

// Add new struct for request parameters
type RequestParams struct {
	Page          int    `json:"page"`
	PerPage       int    `json:"perPage"`
	SortKey       string `json:"sortKey"`
	SortDirection string `json:"sortDirection"`
	SearchQuery   string `json:"searchQuery"`
}
