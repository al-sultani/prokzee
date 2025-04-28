package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	fuzzer "prokzee/internal/fuzzer"
	history "prokzee/internal/history"
	listener "prokzee/internal/listener"
	llm "prokzee/internal/llm"
	logger "prokzee/internal/logger"
	matchreplace "prokzee/internal/matchreplace"
	models "prokzee/internal/models"
	plugins "prokzee/internal/plugins"
	projects "prokzee/internal/projects"
	proxy "prokzee/internal/proxy"
	resender "prokzee/internal/resender"
	rules "prokzee/internal/rules"
	scope "prokzee/internal/scope"
	settings "prokzee/internal/settings"
	sitemap "prokzee/internal/sitemap"
	storage "prokzee/internal/storage"

	"github.com/elazarl/goproxy"
	_ "github.com/mattn/go-sqlite3"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct. TODO: refactor this to use dependency injection
type App struct {
	ctx                context.Context
	proxy              *proxy.Proxy
	db                 *sql.DB
	dbMutex            sync.RWMutex // Add mutex for database operations
	rulesClient        *rules.Client
	matchReplaceClient *matchreplace.Client
	scopeClient        *scope.Client
	listener           *listener.Client
	fuzzer             *fuzzer.Fuzzer
	resender           *resender.Resender
	llmClient          *llm.Client
	sitemapClient      *sitemap.Client
	pluginsClient      *plugins.Client
	historyClient      *history.Client
	settingsClient     *settings.Client
	projectsClient     *projects.Client
	version            string
	logger             *logger.Logger
	requestStorage     *storage.RequestStorage
	dbClosing          chan struct{} // Channel to signal database shutdown
}

// HandleProxyRequest handles storing of proxy requests
func (a *App) HandleProxyRequest(req *http.Request) {
	log.Printf("DEBUG: HandleProxyRequest called for URL: %s", req.URL.String())

	// If the request body exists, we should ensure it has a GetBody function
	if req.Body != nil {
		// Read the request body
		reqBody, err := io.ReadAll(req.Body)
		if err != nil {
			log.Printf("ERROR: Failed to read request body in HandleProxyRequest: %v", err)
			return
		}

		// Restore the original body
		req.Body = io.NopCloser(bytes.NewBuffer(reqBody))

		// Add a GetBody function if it doesn't already have one
		//if req.GetBody == nil {
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewBuffer(reqBody)), nil
		}
		//}
	}

	// Do nothing else here - we'll store the request only when we get a response
}

// HandleProxyResponse handles storing of proxy responses
func (a *App) HandleProxyResponse(req *http.Request, resp *http.Response) {
	log.Printf("DEBUG: HandleProxyResponse called for URL: %s", req.URL.String())

	// Clone the request body if it exists
	var reqBody []byte
	if req.Body != nil {
		var err error
		reqBody, err = io.ReadAll(req.Body)
		if err != nil {
			log.Printf("ERROR: Failed to read request body: %v", err)
		}
		// Restore the request body
		req.Body = io.NopCloser(bytes.NewBuffer(reqBody))
	}

	// Clone and read the response body if it exists, handling all transfer encodings
	var respBody []byte
	if resp != nil && resp.Body != nil {
		var err error
		// Read the entire response body regardless of transfer encoding
		respBody, err = io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("ERROR: Failed to read response body: %v", err)
		} else {
			// Close the original body
			resp.Body.Close()

			// Create a new body for downstream handlers
			resp.Body = io.NopCloser(bytes.NewBuffer(respBody))

			// Update Content-Length if it was chunked or unknown
			if resp.ContentLength == -1 {
				resp.ContentLength = int64(len(respBody))
				// Add or update Content-Length header
				resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(respBody)))
			}
		}
	}

	// Create cloned request and response objects for storage
	reqClone := *req
	if reqBody != nil {
		reqClone.Body = io.NopCloser(bytes.NewBuffer(reqBody))
		// Add a GetBody function to the cloned request
		reqClone.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewBuffer(reqBody)), nil
		}
	}

	// Ensure Host header is preserved in the clone
	if req.Host != "" {
		reqClone.Header.Set("Host", req.Host)
	}

	var respClone *http.Response
	if resp != nil {
		respClone = new(http.Response)
		*respClone = *resp
		if respBody != nil {
			respClone.Body = io.NopCloser(bytes.NewBuffer(respBody))
			// Ensure ContentLength is set correctly in the clone
			respClone.ContentLength = int64(len(respBody))
		}

		// Clone headers to avoid concurrent map access
		respClone.Header = make(http.Header)
		for k, v := range resp.Header {
			respClone.Header[k] = v
		}
	}

	// Only store if we have both request and response
	if respClone != nil {
		// Skip storing requests to prokzee hostname
		if strings.HasPrefix(strings.ToLower(reqClone.Host), "prokzee") || strings.HasPrefix(strings.ToLower(reqClone.Host), "wails.localhost") {
			log.Printf("DEBUG: Skipping storage of prokzee and wails.localhost request: %s", req.URL.String())
			return
		}

		go func() {
			if _, _, err := a.requestStorage.StoreRequest(&reqClone, respClone); err != nil {
				if strings.Contains(err.Error(), "database is closed") {
					log.Printf("WARN: Database is closed, skipping response storage")
					return
				}
				log.Printf("ERROR: Failed to store response: %v", err)
			} else {
				log.Printf("DEBUG: Successfully stored response for URL: %s", req.URL.String())
			}
		}()
	}
}

// NewApp creates a new App application struct
func NewApp() *App {
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

	// Create the necessary directories with proper permissions
	if err := os.MkdirAll(projectsDir, 0755); err != nil {
		log.Printf("Failed to create application data directory: %v, using current directory", err)
		projectsDir = "projects"
		// Try to create the fallback directory
		if err := os.MkdirAll(projectsDir, 0755); err != nil {
			log.Printf("Also failed to create projects directory in current location: %v", err)
		}
	}

	// Use a database in the app data directory
	dbPath := filepath.Join(projectsDir, "default_project.db")
	log.Printf("Using database path: %s", dbPath)

	// Initialize SQLite database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open SQLite database: %v", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(time.Hour)

	app := &App{
		proxy:     proxy.NewProxy(),
		db:        db,
		version:   "0.0.1",
		dbClosing: make(chan struct{}),
	}

	app.requestStorage = storage.NewRequestStorage(db, &app.dbMutex)

	// Initialize history client
	historyClient, err := history.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize history client: %v", err)
	}
	app.historyClient = historyClient

	// Initialize plugins client
	pluginsClient, err := plugins.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize plugins client: %v", err)
	}
	app.pluginsClient = pluginsClient

	// Initialize rules client
	rulesClient, err := rules.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize rules client: %v", err)
	}
	app.rulesClient = rulesClient

	// Initialize match replace client
	matchReplaceClient, err := matchreplace.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize match replace client (matchreplace.NewClient): %v ", err)
	}
	app.matchReplaceClient = matchReplaceClient

	// Initialize scope client
	scopeClient, err := scope.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize scope client: %v", err)
	}
	app.scopeClient = scopeClient

	// Initialize sitemap client
	sitemapClient, err := sitemap.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize sitemap client: %v", err)
	}
	app.sitemapClient = sitemapClient

	// Initialize settings client
	settingsClient, err := settings.NewClient(db)
	if err != nil {
		log.Fatalf("Failed to initialize settings client: %v", err)
	}
	app.settingsClient = settingsClient

	// Initialize projects client with context.TODO() as a placeholder
	app.projectsClient = projects.NewClient(context.TODO(), db, &app.dbMutex)

	return app
}

// EventHandler represents a function that handles frontend events
type EventHandler func(data ...interface{})

// registerEventHandlers sets up all frontend event handlers
func (a *App) registerEventHandlers() {
	// Map of event names to their handlers
	handlers := map[string]EventHandler{
		// Request related handlers
		"frontend:getAllRequests":        a.GetAllRequests,
		"frontend:getRequestByID":        a.getRequestByID,
		"frontend:getRequestsByEndpoint": a.getRequestsByEndpoint,
		"frontend:getRequestsByDomain":   a.getRequestsByDomain,

		// Rules handlers
		"frontend:getAllRules": a.getAllRules,
		"frontend:addRule":     a.addRule,
		"frontend:deleteRule":  a.deleteRule,
		//"frontend:updateRule":  a.updateRule,

		// Match/Replace rules handlers
		"frontend:getAllMatchReplaceRules": a.getAllMatchReplaceRules,
		"frontend:addMatchReplaceRule":     a.addMatchReplaceRule,
		"frontend:deleteMatchReplaceRule":  a.deleteMatchReplaceRule,
		"frontend:updateMatchReplaceRule":  a.updateMatchReplaceRule,

		// Resender handlers
		"frontend:createNewResenderTab":  a.handleCreateNewResenderTab,
		"frontend:sendToResender":        a.handleSendToResender,
		"frontend:getResenderTabs":       a.handleGetResenderTabs,
		"frontend:updateResenderTabName": a.handleUpdateResenderTabName,
		"frontend:sendResenderRequest":   a.handleSendResenderRequest,
		"frontend:cancelResenderRequest": a.handleCancelResenderRequest,
		"frontend:getResenderRequest":    a.handleGetResenderRequest,
		"frontend:deleteResenderTab":     a.handleDeleteResenderTab,

		// Scope handlers
		"frontend:updateInScopeList":    a.updateInScopeList,
		"frontend:updateOutOfScopeList": a.updateOutOfScopeList,
		"frontend:addToOutOfScope":      a.addToOutOfScope,
		"frontend:addToInScope":         a.addToInScope,
		"frontend:getScopeLists":        a.getScopeLists,

		// Fuzzer handlers
		"frontend:startFuzzer":         a.startFuzzer,
		"frontend:stopFuzzer":          a.stopFuzzer,
		"frontend:sendToFuzzer":        a.handleSendToFuzzer,
		"frontend:addFuzzerTab":        a.addFuzzerTab,
		"frontend:removeFuzzerTab":     a.removeFuzzerTab,
		"frontend:updateFuzzerTab":     a.updateFuzzerTab,
		"frontend:getFuzzerTabs":       a.getFuzzerTabs,
		"frontend:updateFuzzerTabName": a.updateFuzzerTabName,

		// Chat handlers
		"frontend:createChatContext":   a.createChatContext,
		"frontend:getChatContexts":     a.getChatContexts,
		"frontend:getChatMessages":     a.getChatMessages,
		"frontend:deleteChatContext":   a.deleteChatContext,
		"frontend:editChatContextName": a.editChatContextName,

		// Plugin handlers
		"frontend:loadPlugins":  a.loadPluginsFromDB,
		"frontend:savePlugin":   a.savePlugin,
		"frontend:updatePlugin": a.updatePlugin,
		"frontend:deletePlugin": a.deletePlugin,

		// Settings and system handlers
		"frontend:fetchSettings":  a.FetchSettings,
		"frontend:updateSettings": a.UpdateSettings,
		//"frontend:getStats":             a.GetStats,
		"frontend:getLogs":              a.GetRecentLogs,
		"frontend:toggleInterception":   a.toggleInterception,
		"frontend:getInterceptionState": a.getInterceptionState,
		"frontend:getInteractshHost":    a.listener.GetInteractshHost,
		"frontend:getCurrentVersion":    a.GetCurrentVersion,
		"frontend:checkForUpdates":      a.CheckForUpdates,

		// Project handlers
		"frontend:listProjects":     a.listProjects,
		"frontend:switchProject":    a.SwitchProject,
		"frontend:createNewProject": a.CreateNewProject,

		// Misc handlers
		"frontend:startListening":    a.startListening,
		"frontend:stopListening":     a.stopListening,
		"frontend:generateNewDomain": a.generateNewDomain,
		"frontend:getDomains":        a.getDomains,
		"frontend:getSiteMap":        a.getSiteMap,
		"frontend:getTrafficData":    a.GetTrafficData,
	}

	// Register all handlers
	for event, handler := range handlers {
		wailsRuntime.EventsOn(a.ctx, event, handler)
	}
}

// startup is called when the app starts. The context is saved so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Add cleanup handler
	wailsRuntime.EventsOnce(ctx, "shutdown", func(optionalData ...interface{}) {
		a.cleanup()
	})

	// Get the current working directory
	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("Error getting working directory: %v", err)
		cwd = "Unknown"
	}

	// Get the executable path
	exePath, err := os.Executable()
	if err != nil {
		log.Printf("Error getting executable path: %v", err)
		exePath = "Unknown"
	}

	// Log the paths for debugging
	log.Printf("Current working directory: %s", cwd)
	log.Printf("Executable path: %s", exePath)

	// Handle problematic working directories on different platforms
	fixWorkingDir := false

	// For macOS, if launched from Finder, the working directory might be "/"
	if runtime.GOOS == "darwin" && cwd == "/" {
		fixWorkingDir = true
		log.Printf("Detected macOS Finder launch (cwd is /)")
	}

	// For Windows, if launched from Explorer, the working directory might be system32, user's home, or other locations
	if runtime.GOOS == "windows" {
		// Determine if we're in a problematic directory
		isSystemDir := strings.HasPrefix(strings.ToLower(cwd), strings.ToLower(`C:\Windows`))
		isUserProfileDir := strings.HasPrefix(strings.ToLower(cwd), strings.ToLower(os.Getenv("USERPROFILE")))
		isDocumentsDir := strings.Contains(strings.ToLower(cwd), "documents")
		isDownloadsDir := strings.Contains(strings.ToLower(cwd), "downloads")
		isDesktopDir := strings.Contains(strings.ToLower(cwd), "desktop")

		// Also check specific problematic directories
		windowsBadDirs := []string{
			`C:\Windows\system32`,
			os.Getenv("USERPROFILE"),
			os.Getenv("HOMEDRIVE") + os.Getenv("HOMEPATH"),
		}

		if isSystemDir || isUserProfileDir || isDocumentsDir || isDownloadsDir || isDesktopDir {
			fixWorkingDir = true
			log.Printf("Detected Windows problematic directory (cwd is %s)", cwd)
		} else {
			// Check against specific bad directories
			for _, badDir := range windowsBadDirs {
				if strings.EqualFold(cwd, badDir) {
					fixWorkingDir = true
					log.Printf("Detected Windows Explorer launch (cwd is %s)", cwd)
					break
				}
			}
		}
	}

	// For Linux (including Ubuntu), detect problematic working directories
	if runtime.GOOS == "linux" {
		// Common problematic Linux directories when launched from desktop
		linuxBadDirs := []string{
			"/",               // Root directory
			"/home",           // Home parent directory
			os.Getenv("HOME"), // User's home directory
			"/usr/bin",        // Common binary location
			"/usr/local/bin",  // Another common binary location
		}

		// Check if we're in a directory that's not where the executable is
		execDir := filepath.Dir(exePath)
		if cwd != execDir {
			// Additional check for desktop/launcher directories
			isHomeSubdir := strings.HasPrefix(cwd, os.Getenv("HOME"))
			isSystemDir := strings.HasPrefix(cwd, "/usr") || strings.HasPrefix(cwd, "/bin") || strings.HasPrefix(cwd, "/sbin")

			if isHomeSubdir || isSystemDir {
				fixWorkingDir = true
				log.Printf("Detected Linux desktop launch - executable dir and working dir don't match")
			} else {
				// Check against specific bad directories
				for _, badDir := range linuxBadDirs {
					if cwd == badDir {
						fixWorkingDir = true
						log.Printf("Detected Linux desktop launch (cwd is %s)", cwd)
						break
					}
				}
			}
		}
	}

	// Fix the working directory if needed
	if fixWorkingDir {
		execDir := filepath.Dir(exePath)
		log.Printf("Changing working directory to executable directory: %s", execDir)

		// Ensure the execDir exists and is accessible
		if _, err := os.Stat(execDir); err != nil {
			log.Printf("Executable directory has issue: %v", err)

			// Try to find an alternative directory
			if runtime.GOOS == "windows" {
				// On Windows, try the executable name's directory without any path manipulation
				altPath := filepath.Dir(filepath.Clean(exePath))
				log.Printf("Trying alternative path on Windows: %s", altPath)
				execDir = altPath
			}
		}

		if err := os.Chdir(execDir); err != nil {
			log.Printf("Failed to change working directory: %v", err)

			// As a last resort on Windows, try to go up one directory
			if runtime.GOOS == "windows" {
				parentDir := filepath.Dir(execDir)
				log.Printf("Trying parent directory on Windows: %s", parentDir)
				if err := os.Chdir(parentDir); err != nil {
					log.Printf("Also failed with parent directory: %v", err)
				} else {
					cwd = parentDir
					log.Printf("Successfully changed to parent directory: %s", cwd)
				}
			}
		} else {
			cwd = execDir
			log.Printf("Successfully changed working directory to: %s", cwd)
		}
	}

	fmt.Println("Final working directory:", cwd)

	// Add a message to help users understand the working directory behavior
	log.Printf("STARTUP INFO: ProKZee now automatically detects and fixes working directory issues on macOS, Windows, and Linux")
	log.Printf("STARTUP INFO: If you experience any file access problems, please report them on GitHub")

	// _, err = wailsRuntime.MessageDialog(ctx, wailsRuntime.MessageDialogOptions{
	// 	Title:   "Current Working Directory",
	// 	Message: cwd,
	// })

	// if err != nil {
	// 	log.Printf("Failed to show message dialog: %v", err)
	// }

	// Set context for projects client
	a.projectsClient = projects.NewClient(ctx, a.db, &a.dbMutex)

	// Initialize logger
	a.logger = logger.NewLogger(a.db, ctx, nil)
	if err := a.logger.EnsureLogsTableExists(); err != nil {
		log.Printf("Failed to create logs table: %v", err)
	}

	// Initialize LLM client
	a.llmClient = llm.NewClient(ctx, a.db)

	// Initialize settings client
	settingsClient, err := settings.NewClient(a.db)
	if err != nil {
		log.Fatalf("Failed to initialize settings client: %v", err)
	}
	a.settingsClient = settingsClient

	// Initialize fuzzer
	a.fuzzer = fuzzer.NewFuzzer(ctx, a.db)

	// Initialize resender
	a.resender = resender.NewResender(ctx, a.db, a.requestStorage)

	// Load settings from the database
	settings, err := a.settingsClient.LoadSettings()
	if err != nil {
		log.Fatalf("Failed to fetch settings: %v", err)
	}

	// Use the loaded settings
	proxyPort := settings.ProxyPort
	interactshHost := settings.InteractshHost
	interactshPort := settings.InteractshPort

	// Initialize the client with interactshHost and interactshPort
	a.listener = listener.NewClient(ctx, interactshHost, interactshPort)
	a.listener.GenerateKeys()

	// setupCertificates checks if certificate files exist, and if not, generates new ones
	a.setupCertificates()

	// Set up the proxy with custom CA
	if err := a.proxy.SetupCertificates(); err != nil {
		log.Fatalf("Failed to setup certificates: %v", err)
	}

	// Set up proxy handlers
	a.proxy.SetupHandlers()

	// Set up request and response handlers with direct method calls
	a.proxy.HandleRequest(a.ctx, a.scopeClient, a.matchReplaceClient, a.rulesClient, a.logger, a.HandleProxyRequest)
	a.proxy.HandleResponse(a.ctx, a.matchReplaceClient, a.logger, a.HandleProxyResponse)

	// Start the proxy server
	if err := a.proxy.StartServer(proxyPort); err != nil {
		log.Fatalf("Failed to start proxy server: %v", err)
	}

	// Register event handlers
	a.registerEventHandlers()

	// Add this function to periodically clean up stale channels
	a.startChannelCleanupRoutine()

}

// CustomRoundTripper wraps http.Transport and implements goproxy.RoundTripper
type CustomRoundTripper struct {
	Transport *http.Transport
}

func (c *CustomRoundTripper) RoundTrip(req *http.Request, ctx *goproxy.ProxyCtx) (*http.Response, error) {
	// Custom logic before sending the request
	log.Printf("Custom RoundTripper: Sending request to %s", req.URL)

	// Send the request using the underlying transport
	resp, err := c.Transport.RoundTrip(req)
	if err != nil {
		return nil, err
	}

	// Custom logic after receiving the response
	log.Printf("Custom RoundTripper: Received response from %s with status %s", req.URL, resp.Status)

	return resp, nil
}

// getScopeLists handles the event to fetch the in-scope and out-of-scope lists
func (a *App) getScopeLists(data ...interface{}) {
	inScope, outScope := a.scopeClient.GetScopeLists()
	wailsRuntime.EventsEmit(a.ctx, "backend:scopeLists", map[string]interface{}{
		"inScope":    inScope,
		"outOfScope": outScope,
	})
}

// updateInScopeList updates the in-scope list from the frontend and saves it to the database
func (a *App) updateInScopeList(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing in-scope list data")
		return
	}
	inScopeList, ok := data[0].([]interface{})
	if !ok {
		log.Println("Invalid in-scope list data format")
		return
	}

	log.Printf("Received in-scope list update with %d items", len(inScopeList))

	var newInScopeList []string
	for _, item := range inScopeList {
		if str, ok := item.(string); ok {
			newInScopeList = append(newInScopeList, str)
		}
	}

	if err := a.scopeClient.UpdateInScopeList(newInScopeList); err != nil {
		log.Printf("Failed to update in-scope list: %v", err)
		return
	}

	// Emit an event to update the frontend with the latest scope lists
	inScope, outScope := a.scopeClient.GetScopeLists()
	log.Printf("Emitting updated scope lists - in-scope: %v, out-of-scope: %v", inScope, outScope)
	wailsRuntime.EventsEmit(a.ctx, "backend:scopeLists", map[string]interface{}{
		"inScope":    inScope,
		"outOfScope": outScope,
	})
}

// updateOutOfScopeList updates the out-of-scope list from the frontend and saves it to the database
func (a *App) updateOutOfScopeList(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing out-of-scope list data")
		return
	}
	outOfScopeList, ok := data[0].([]interface{})
	if !ok {
		log.Println("Invalid out-of-scope list data format")
		return
	}

	log.Printf("Received out-of-scope list update with %d items", len(outOfScopeList))

	var newOutOfScopeList []string
	for _, item := range outOfScopeList {
		if str, ok := item.(string); ok {
			newOutOfScopeList = append(newOutOfScopeList, str)
		}
	}

	if err := a.scopeClient.UpdateOutScopeList(newOutOfScopeList); err != nil {
		log.Printf("Failed to update out-of-scope list: %v", err)
		return
	}

	// Emit an event to update the frontend with the latest scope lists
	inScope, outScope := a.scopeClient.GetScopeLists()
	log.Printf("Emitting updated scope lists - in-scope: %v, out-of-scope: %v", inScope, outScope)
	wailsRuntime.EventsEmit(a.ctx, "backend:scopeLists", map[string]interface{}{
		"inScope":    inScope,
		"outOfScope": outScope,
	})
}

func (a *App) addToOutOfScope(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing pattern for out-of-scope")
		return
	}
	pattern, ok := data[0].(string)
	if !ok {
		log.Println("Invalid pattern for out-of-scope")
		return
	}

	if err := a.scopeClient.AddToOutScope(pattern); err != nil {
		log.Printf("Failed to add pattern to out-of-scope list: %v", err)
		return
	}

	// Emit an event to update the frontend with the latest scope lists
	inScope, outScope := a.scopeClient.GetScopeLists()
	wailsRuntime.EventsEmit(a.ctx, "backend:scopeLists", map[string]interface{}{
		"inScope":    inScope,
		"outOfScope": outScope,
	})
}

func (a *App) addToInScope(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing pattern for in-scope")
		return
	}
	pattern, ok := data[0].(string)
	if !ok {
		log.Println("Invalid pattern for in-scope")
		return
	}

	if err := a.scopeClient.AddToInScope(pattern); err != nil {
		log.Printf("Failed to add pattern to in-scope list: %v", err)
		return
	}

	// Emit an event to update the frontend with the latest scope lists
	inScope, outScope := a.scopeClient.GetScopeLists()
	wailsRuntime.EventsEmit(a.ctx, "backend:scopeLists", map[string]interface{}{
		"inScope":    inScope,
		"outOfScope": outScope,
	})
}

// ApproveRequest is called by the frontend to approve or reject a request.
func (a *App) ApproveRequest(data map[string]interface{}) {
	requestID, ok := data["requestID"].(string)
	if !ok {
		log.Println("Invalid request ID")
		return
	}

	approved, ok := data["approved"].(bool)
	if !ok {
		log.Println("Invalid approval status")
		return
	}

	headers, ok := data["headers"].(map[string]interface{})
	if !ok {
		log.Println("Invalid headers")
		return
	}

	body, ok := data["body"].(string)
	if !ok {
		log.Println("Invalid body")
		return
	}

	method, ok := data["method"].(string)
	if !ok || method == "" {
		log.Println("Invalid method")
		return
	}

	protocolVersion, ok := data["protocolVersion"].(string)
	if !ok || protocolVersion == "" {
		log.Println("Invalid protocol version")
		return
	}

	url, ok := data["url"].(string)
	if !ok || url == "" {
		log.Println("Invalid URL")
		return
	}

	//log.Printf("Received Method: %s, Protocol Version: %s, URL: %s", method, protocolVersion, url) // Add logging

	// Convert headers to http.Header
	httpHeaders := http.Header{}
	for key, values := range headers {
		switch v := values.(type) {
		case []interface{}:
			for _, value := range v {
				httpHeaders.Add(key, value.(string))
			}
		case string:
			httpHeaders.Add(key, v)
		default:
			log.Printf("Unexpected type for header value: %T", v)
		}
	}

	// Retrieve the approval channel from the map
	a.proxy.ApprovalChsM.Lock()
	approvalCh, exists := a.proxy.ApprovalChs[requestID]
	if exists {
		delete(a.proxy.ApprovalChs, requestID)
	}
	a.proxy.ApprovalChsM.Unlock()

	// Also clean up the pending request
	a.proxy.PendingRequestsM.Lock()
	_, requestExists := a.proxy.PendingRequests[requestID]
	if requestExists {
		delete(a.proxy.PendingRequests, requestID)
	}
	a.proxy.PendingRequestsM.Unlock()

	if exists {
		// Create the approval response
		response := proxy.ApprovalResponse{
			Approved:        approved,
			Headers:         httpHeaders,
			Body:            body,
			Method:          method,
			ProtocolVersion: protocolVersion,
			URL:             url,
			RequestID:       requestID,
		}

		// Use a non-blocking send with a short timeout to avoid deadlocks
		// This ensures we don't block if the channel is closed or full
		select {
		case approvalCh <- response:
			log.Printf("Successfully sent approval for request: %s", requestID)
		case <-time.After(100 * time.Millisecond):
			log.Printf("Could not send approval for request %s, channel may be closed or full", requestID)
		}
	} else {
		log.Printf("No matching approval channel found for request: %s", requestID)
	}
}

// ToggleInterception toggles the interception state.
func (a *App) ToggleInterception() {
	newState := a.proxy.ToggleInterception()
	wailsRuntime.EventsEmit(a.ctx, "backend:interceptionToggled", newState)
}

// getRequestByID handles the event to fetch a specific request by ID
func (a *App) getRequestByID(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:requestDetails", map[string]interface{}{
			"error": "No request ID provided",
		})
		return
	}

	id := data[0].(string)
	details, err := a.historyClient.GetRequestByID(id)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:requestDetails", map[string]interface{}{
			"error": "Failed to fetch request details: " + err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:requestDetails", details)
}

// getAllRules handles the event to fetch all rules
func (a *App) getAllRules(data ...interface{}) {
	rules, err := a.rulesClient.GetAllRules()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:allRules", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:allRules", map[string]interface{}{
		"rules": rules,
	})
}

// addRule handles the event to add a new rule
func (a *App) addRule(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:ruleAdded", map[string]interface{}{
			"error": "Missing rule data",
		})
		return
	}
	ruleData, ok := data[0].(map[string]interface{})
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:ruleAdded", map[string]interface{}{
			"error": "Invalid rule data format",
		})
		return
	}

	rule := rules.Rule{
		RuleName:     ruleData["RuleName"].(string),
		Operator:     ruleData["Operator"].(string),
		MatchType:    ruleData["MatchType"].(string),
		Relationship: ruleData["Relationship"].(string),
		Pattern:      ruleData["Pattern"].(string),
		Enabled:      ruleData["Enabled"].(bool),
	}

	err := a.rulesClient.AddRule(rule)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:ruleAdded", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:ruleAdded", map[string]interface{}{
		"success": true,
	})
}

// deleteRule handles the event to delete a rule
func (a *App) deleteRule(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:ruleDeleted", map[string]interface{}{
			"error": "Missing rule ID",
		})
		return
	}
	ruleID := int(data[0].(float64))

	err := a.rulesClient.DeleteRule(ruleID)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:ruleDeleted", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:ruleDeleted", map[string]interface{}{
		"success": true,
	})
}

// getAllMatchReplaceRules handles the event to fetch all match and replace rules
func (a *App) getAllMatchReplaceRules(data ...interface{}) {
	rules, err := a.matchReplaceClient.GetAllRules()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:allMatchReplaceRules", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:allMatchReplaceRules", map[string]interface{}{
		"rules": rules,
	})
}

// deleteMatchReplaceRule handles the event to delete a match and replace rule
func (a *App) deleteMatchReplaceRule(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleDeleted", map[string]interface{}{
			"error": "Missing rule ID",
		})
		return
	}
	ruleID := int(data[0].(float64))
	err := a.matchReplaceClient.DeleteRule(ruleID)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleDeleted", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleDeleted", map[string]interface{}{
		"success": true,
	})
}

// updateMatchReplaceRule handles the event to update a match and replace rule
func (a *App) updateMatchReplaceRule(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleUpdated", map[string]interface{}{
			"error": "Missing rule data",
		})
		return
	}
	ruleData, ok := data[0].(map[string]interface{})
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleUpdated", map[string]interface{}{
			"error": "Invalid rule data format",
		})
		return
	}

	rule := matchreplace.Rule{
		ID:             int(ruleData["id"].(float64)),
		RuleName:       ruleData["rule_name"].(string),
		MatchType:      ruleData["match_type"].(string),
		MatchContent:   ruleData["match_content"].(string),
		ReplaceContent: ruleData["replace_content"].(string),
		Target:         ruleData["target"].(string),
		Enabled:        ruleData["enabled"].(bool),
	}

	err := a.matchReplaceClient.UpdateRule(rule)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleUpdated", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleUpdated", map[string]interface{}{
		"success": true,
	})
}

// addMatchReplaceRule handles the event to add a new match and replace rule
func (a *App) addMatchReplaceRule(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleAdded", map[string]interface{}{
			"error": "Missing rule data",
		})
		return
	}
	ruleData, ok := data[0].(map[string]interface{})
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleAdded", map[string]interface{}{
			"error": "Invalid rule data format",
		})
		return
	}

	rule := matchreplace.Rule{
		RuleName:       ruleData["RuleName"].(string),
		MatchType:      ruleData["MatchType"].(string),
		MatchContent:   ruleData["MatchContent"].(string),
		ReplaceContent: ruleData["ReplaceContent"].(string),
		Target:         ruleData["Target"].(string),
		Enabled:        ruleData["Enabled"].(bool),
	}

	err := a.matchReplaceClient.AddRule(rule)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleAdded", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:matchReplaceRuleAdded", map[string]interface{}{
		"success": true,
	})
}

func (a *App) startFuzzer(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing Fuzzer data")
		return
	}
	fuzzerData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid Fuzzer data format")
		return
	}
	a.fuzzer.StartFuzzer(fuzzerData)
}

func (a *App) stopFuzzer(data ...interface{}) {
	a.fuzzer.StopFuzzer()
}

func (a *App) getFuzzerTabs(data ...interface{}) {
	tabs := a.fuzzer.GetFuzzerTabs()
	wailsRuntime.EventsEmit(a.ctx, "backend:FuzzerTabs", tabs)
}

func (a *App) addFuzzerTab(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab data")
		return
	}
	tabData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid tab data format")
		return
	}
	a.fuzzer.AddFuzzerTab(tabData)
}

func (a *App) updateFuzzerTab(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab data")
		return
	}
	tabData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid tab data format")
		return
	}
	a.fuzzer.UpdateFuzzerTab(tabData)
}

func (a *App) updateFuzzerTabName(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab data")
		return
	}
	tabData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid tab data format")
		return
	}

	tabId, ok := tabData["tabId"].(float64)
	if !ok {
		log.Println("Invalid or missing tabId")
		return
	}

	newName, ok := tabData["newName"].(string)
	if !ok {
		log.Println("Invalid or missing newName")
		return
	}

	a.fuzzer.UpdateFuzzerTabName(tabId, newName)
}

func (a *App) removeFuzzerTab(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab ID")
		return
	}
	tabID, ok := data[0].(float64)
	if !ok {
		log.Println("Invalid tab ID format")
		return
	}
	a.fuzzer.RemoveFuzzerTab(int(tabID))
}

func (a *App) startListening(optionalData ...interface{}) {
	a.logger.LogMessage("info", "Starting Interactsh listener", "Interactsh")
	a.listener.StartListening()
}

func (a *App) stopListening(optionalData ...interface{}) {
	a.logger.LogMessage("info", "Stopping Interactsh listener", "Interactsh")
	a.listener.StopListening()
}

func (a *App) generateNewDomain(optionalData ...interface{}) {
	if a.listener != nil {
		a.logger.LogMessage("info", "Generating new Interactsh domain", "Interactsh")
		a.listener.GenerateNewDomain()
	}
}

func (a *App) getDomains(data ...interface{}) {
	domains, err := a.sitemapClient.GetDomains()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:domains", map[string]interface{}{
			"error": "Failed to fetch domains: " + err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:domains", map[string]interface{}{
		"domains": domains,
	})
}

func (a *App) getSiteMap(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:Sitemap", map[string]interface{}{
			"error": "Missing domain",
		})
		return
	}

	domain := data[0].(string)
	root, err := a.sitemapClient.GetSiteMap(domain)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:Sitemap", map[string]interface{}{
			"error": "Failed to fetch sitemap: " + err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:Sitemap", map[string]interface{}{
		"Sitemap": root,
	})
}

func (a *App) getRequestsByEndpoint(data ...interface{}) {
	if len(data) < 2 {
		log.Println("Missing domain or path")
		wailsRuntime.EventsEmit(a.ctx, "backend:requestsByEndpoint", map[string]interface{}{
			"error": "Missing domain or path",
		})
		return
	}

	domain := data[0].(string)
	path := data[1].(string)

	requests, err := a.sitemapClient.GetRequestsByEndpoint(domain, path)
	if err != nil {
		log.Printf("Error fetching requests: %v", err)
		wailsRuntime.EventsEmit(a.ctx, "backend:requestsByEndpoint", map[string]interface{}{
			"error": fmt.Sprintf("Failed to fetch requests: %v", err),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:requestsByEndpoint", map[string]interface{}{
		"requests": requests,
	})
}

func (a *App) createChatContext(data ...interface{}) {
	var requestString string
	if len(data) > 0 {
		if rs, ok := data[0].(string); ok {
			requestString = rs
		}
	}

	id, err := a.llmClient.CreateChatContext(requestString)
	if err != nil {
		log.Printf("Failed to create chat context: %v", err)
		return
	}

	if requestString != "" {
		// Get settings for the initial message
		settings, err := a.loadSettingsFromDB()
		if err != nil {
			log.Printf("Failed to load settings: %v", err)
			return
		}

		settingsMap := map[string]interface{}{
			"OpenAIAPIURL": settings.OpenAIAPIURL,
			"OpenAIAPIKey": settings.OpenAIAPIKey,
		}

		message := fmt.Sprintf("Analyze the following HTTP:\n\n%s", requestString)
		err = a.llmClient.SendMessage(map[string]interface{}{
			"chatContextId": float64(id),
			"messages": []interface{}{
				map[string]interface{}{
					"role":    "user",
					"content": message,
				},
			},
		}, settingsMap)
		if err != nil {
			log.Printf("Failed to send initial message: %v", err)
		}
	}
}

func (a *App) deleteChatContext(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing chat context ID")
		return
	}
	chatContextId, ok := data[0].(float64)
	if !ok {
		log.Println("Invalid chat context ID")
		return
	}

	err := a.llmClient.DeleteChatContext(int(chatContextId))
	if err != nil {
		log.Printf("Failed to delete chat context: %v", err)
	}
}

func (a *App) editChatContextName(data ...interface{}) {
	if len(data) < 2 {
		log.Println("Missing chat context ID or new name")
		return
	}
	chatContextId, ok := data[0].(float64)
	if !ok {
		log.Println("Invalid chat context ID")
		return
	}
	newName, ok := data[1].(string)
	if !ok {
		log.Println("Invalid new name")
		return
	}

	err := a.llmClient.EditChatContextName(int(chatContextId), newName)
	if err != nil {
		log.Printf("Failed to edit chat context name: %v", err)
	}
}

func (a *App) getChatContexts(data ...interface{}) {
	contexts, err := a.llmClient.GetChatContexts()
	if err != nil {
		log.Printf("Failed to get chat contexts: %v", err)
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:chatContexts", contexts)
}

func (a *App) getChatMessages(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing chat context ID")
		return
	}
	chatContextId, ok := data[0].(float64)
	if !ok {
		log.Println("Invalid chat context ID")
		return
	}

	messages, err := a.llmClient.GetChatMessages(int(chatContextId))
	if err != nil {
		log.Printf("Failed to get chat messages: %v", err)
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:chatMessages", map[string]interface{}{
		"chatContextId": int(chatContextId),
		"messages":      messages,
	})
}

// GetTrafficData sends traffic data to the frontend
func (a *App) GetTrafficData(optionalData ...interface{}) {
	// Example traffic data
	trafficData := models.TrafficData{
		ID:              "1",
		URL:             "http://example.com",
		Method:          "GET",
		RequestHeaders:  "{}",
		RequestBody:     "",
		ResponseHeaders: "{}",
		ResponseBody:    "Hello, world!",
		Status:          "200 OK",
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:trafficData", trafficData)
}

// func (a *App) test(data ...interface{}) {
// 	fmt.Print(data...)
// }

func (a *App) loadPluginsFromDB(optionalData ...interface{}) {
	plugins, err := a.pluginsClient.LoadPlugins()
	if err != nil {
		log.Printf("Failed to load plugins: %v", err)
		return
	}

	// Convert plugins to JSON and emit event
	pluginsJSON, err := json.Marshal(plugins)
	if err != nil {
		log.Printf("Failed to marshal plugins: %v", err)
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "pluginsLoaded", string(pluginsJSON))
}

func (a *App) savePlugin(optionalData ...interface{}) {
	if len(optionalData) < 1 {
		log.Println("Missing plugin data")
		return
	}

	pluginData, ok := optionalData[0].(string)
	if !ok {
		log.Println("Invalid plugin data format")
		return
	}

	plugin, err := a.pluginsClient.SavePlugin(pluginData)
	if err != nil {
		log.Printf("Failed to save plugin: %v", err)
		return
	}

	// Convert plugin to JSON and emit event
	pluginJSON, err := json.Marshal(plugin)
	if err != nil {
		log.Printf("Failed to marshal plugin: %v", err)
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "pluginSaved", string(pluginJSON))
}

func (a *App) updatePlugin(optionalData ...interface{}) {
	if len(optionalData) < 1 {
		log.Println("Missing plugin data")
		return
	}

	pluginData, ok := optionalData[0].(string)
	if !ok {
		log.Println("Invalid plugin data format")
		return
	}

	plugin, err := a.pluginsClient.UpdatePlugin(pluginData)
	if err != nil {
		log.Printf("Failed to update plugin: %v", err)
		return
	}

	// Convert plugin to JSON and emit event
	pluginJSON, err := json.Marshal(plugin)
	if err != nil {
		log.Printf("Failed to marshal plugin: %v", err)
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "pluginUpdated", string(pluginJSON))
}

func (a *App) deletePlugin(optionalData ...interface{}) {
	if len(optionalData) < 1 {
		log.Println("Missing plugin ID")
		return
	}

	pluginID, ok := optionalData[0].(float64)
	if !ok {
		log.Println("Invalid plugin ID format")
		return
	}

	err := a.pluginsClient.DeletePlugin(int(pluginID))
	if err != nil {
		log.Printf("Failed to delete plugin: %v", err)
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "pluginDeleted", int(pluginID))
}

// FetchSettings fetches the settings from the database
func (a *App) FetchSettings(data ...interface{}) {
	settings, err := a.settingsClient.LoadSettings()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:fetchSettings", map[string]interface{}{
			"error": "Failed to fetch settings: " + err.Error(),
		})
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:fetchSettings", settings)
}

// UpdateSettings updates the settings in the database
func (a *App) UpdateSettings(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:updateSettings", map[string]interface{}{
			"error": "Missing settings data",
		})
		return
	}
	settingsData, ok := data[0].(map[string]interface{})
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:updateSettings", map[string]interface{}{
			"error": "Invalid settings data format",
		})
		return
	}

	settings := &settings.Settings{
		ID:             int(settingsData["id"].(float64)),
		ProjectName:    settingsData["project_name"].(string),
		OpenAIAPIURL:   settingsData["openai_api_url"].(string),
		OpenAIAPIKey:   settingsData["openai_api_key"].(string),
		ProxyPort:      settingsData["proxy_port"].(string),
		InteractshHost: settingsData["interactsh_host"].(string),
		InteractshPort: int(settingsData["interactsh_port"].(float64)),
		CreatedAt:      settingsData["created_at"].(string),
	}

	if err := a.settingsClient.UpdateSettings(settings); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:updateSettings", map[string]interface{}{
			"error": "Failed to update settings: " + err.Error(),
		})
		return
	}

	// Update the client with the new host and port
	a.listener.UpdateHostAndPort(settings.InteractshHost, settings.InteractshPort)

	// Restart the proxy server with the new port
	a.stopProxyServer()
	a.startProxyServer(settings.ProxyPort)

	wailsRuntime.EventsEmit(a.ctx, "backend:updateSettings", map[string]interface{}{
		"success": true,
	})
}

func (a *App) loadSettingsFromDB() (*settings.Settings, error) {
	return a.settingsClient.LoadSettings()
}

func (a *App) startProxyServer(port string) {
	if err := a.proxy.StartServer(port); err != nil {
		log.Printf("Failed to start proxy server: %v", err)
	}
}

func (a *App) stopProxyServer() {
	if err := a.proxy.StopServer(); err != nil {
		log.Printf("Failed to stop proxy server: %v", err)
	}
}

// listProjects handles the event to list all projects
func (a *App) listProjects(data ...interface{}) {
	projects, err := a.projectsClient.ListProjects()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:listProjects", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:listProjects", map[string]interface{}{
		"projects": projects,
	})
}

// SwitchProject switches to the selected database
func (a *App) SwitchProject(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Missing database name",
		})
		return
	}
	dbName, ok := data[0].(string)
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Invalid database name",
		})
		return
	}

	// First emit an event to tell frontend to clear its state
	wailsRuntime.EventsEmit(a.ctx, "backend:clearState", nil)

	// First stop the proxy server to prevent new requests
	a.stopProxyServer()

	// Wait for any in-flight requests to complete
	time.Sleep(500 * time.Millisecond)

	// Close old database connection
	if a.db != nil {
		a.db.Close()
	}

	// Create new database connection
	newDB, err := a.projectsClient.SwitchProject(dbName)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	// Set connection pool settings for new database
	newDB.SetMaxOpenConns(25)
	newDB.SetMaxIdleConns(5)
	newDB.SetConnMaxLifetime(time.Hour)

	// Update the app's database connection
	a.db = newDB

	// Reset mutex and channels
	a.dbMutex = sync.RWMutex{}
	a.dbClosing = make(chan struct{})

	// Reinitialize all database-dependent components
	var initErr error

	// Create new request storage
	a.requestStorage = storage.NewRequestStorage(newDB, &a.dbMutex)

	// Initialize history client
	a.historyClient, initErr = history.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize history client: " + initErr.Error(),
		})
		return
	}

	// Initialize plugins client
	a.pluginsClient, initErr = plugins.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize plugins client: " + initErr.Error(),
		})
		return
	}

	// Initialize rules client
	a.rulesClient, initErr = rules.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize rules client: " + initErr.Error(),
		})
		return
	}

	// Initialize match replace client
	a.matchReplaceClient, initErr = matchreplace.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize match replace client: " + initErr.Error(),
		})
		return
	}

	// Initialize scope client
	a.scopeClient, initErr = scope.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize scope client: " + initErr.Error(),
		})
		return
	}

	// Initialize sitemap client
	a.sitemapClient, initErr = sitemap.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize sitemap client: " + initErr.Error(),
		})
		return
	}

	// Initialize settings client
	a.settingsClient, initErr = settings.NewClient(newDB)
	if initErr != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to initialize settings client: " + initErr.Error(),
		})
		return
	}

	// Initialize projects client with current context
	a.projectsClient = projects.NewClient(a.ctx, newDB, &a.dbMutex)

	// Initialize other components with current context
	a.fuzzer = fuzzer.NewFuzzer(a.ctx, newDB)
	a.resender = resender.NewResender(a.ctx, newDB, a.requestStorage)
	a.llmClient = llm.NewClient(a.ctx, newDB)

	// Update logger with new database connection
	if a.logger != nil {
		a.logger.RefreshConnection(newDB)
	} else {
		a.logger = logger.NewLogger(newDB, a.ctx, nil)
	}

	if err := a.logger.EnsureLogsTableExists(); err != nil {
		log.Printf("Warning: Failed to create logs table: %v", err)
	}

	// Load settings from the new database
	settings, err := a.settingsClient.LoadSettings()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to load settings: " + err.Error(),
		})
		return
	}

	// Reinitialize proxy with new settings
	a.proxy = proxy.NewProxy()
	if err := a.proxy.SetupCertificates(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
			"error": "Failed to setup certificates: " + err.Error(),
		})
		return
	}
	a.proxy.SetupHandlers()

	// Update proxy handlers with new components
	a.proxy.HandleRequest(a.ctx, a.scopeClient, a.matchReplaceClient, a.rulesClient, a.logger, a.HandleProxyRequest)
	a.proxy.HandleResponse(a.ctx, a.matchReplaceClient, a.logger, a.HandleProxyResponse)

	// Start the proxy server with new settings
	a.startProxyServer(settings.ProxyPort)

	// Reinitialize listener with new settings
	a.listener = listener.NewClient(a.ctx, settings.InteractshHost, settings.InteractshPort)
	a.listener.GenerateKeys()

	// Emit success event with the new project name
	wailsRuntime.EventsEmit(a.ctx, "backend:switchProject", map[string]interface{}{
		"success":     true,
		"projectName": dbName,
	})

	// Emit events to refresh all data
	a.GetAllRequests()             // Refresh requests
	a.getAllRules(nil)             // Refresh rules
	a.getAllMatchReplaceRules(nil) // Refresh match/replace rules
	a.getScopeLists(nil)           // Refresh scope lists
	a.getFuzzerTabs(nil)           // Refresh fuzzer tabs
	a.getChatContexts(nil)         // Refresh chat contexts
	a.loadPluginsFromDB(nil)       // Refresh plugins
	a.FetchSettings(nil)           // Refresh settings
	a.getDomains(nil)              // Refresh domains
	a.GetRecentLogs(nil)           // Refresh logs

	// Refresh resender tabs
	if tabs, err := a.resender.GetTabs(); err == nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:resenderTabs", tabs)
	} else {
		log.Printf("Warning: Failed to refresh resender tabs: %v", err)
	}
}

// CreateNewProject creates a new SQLite database in the projects_data folder and initializes it with default data
func (a *App) CreateNewProject(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:createNewProject", map[string]interface{}{
			"error": "Missing project name",
		})
		return
	}
	projectName, ok := data[0].(string)
	if !ok {
		wailsRuntime.EventsEmit(a.ctx, "backend:createNewProject", map[string]interface{}{
			"error": "Invalid project name",
		})
		return
	}

	err := a.projectsClient.CreateNewProject(projectName)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:createNewProject", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:createNewProject", map[string]interface{}{
		"success": true,
	})
}

func (a *App) getRequestsByDomain(data ...interface{}) {
	if len(data) < 1 {
		wailsRuntime.EventsEmit(a.ctx, "backend:requestsByDomain", map[string]interface{}{
			"error": "Missing domain",
		})
		return
	}

	domain := data[0].(string)

	requests, err := a.sitemapClient.GetRequestsByDomain(domain)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:requestsByDomain", map[string]interface{}{
			"error": "Failed to fetch requests by domain: " + err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:requestsByDomain", map[string]interface{}{
		"requests": requests,
	})
}

// Add this new method to handle log retrieval
func (a *App) GetRecentLogs(data ...interface{}) {
	var params map[string]interface{}
	if len(data) > 0 {
		if p, ok := data[0].(map[string]interface{}); ok {
			params = p
		}
	}

	result := a.logger.GetRecentLogs(params)
	wailsRuntime.EventsEmit(a.ctx, "backend:logs", result)
}

// Add this function after the startup function
func (a *App) startChannelCleanupRoutine() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				a.cleanupStaleChannels()
			case <-a.ctx.Done():
				return
			}
		}
	}()
}

// Add this function to clean up stale channels
func (a *App) cleanupStaleChannels() {
	log.Println("Running cleanup of stale approval channels")

	// Get the current time
	now := time.Now()

	// Track how many channels were cleaned up
	cleanedCount := 0

	// Lock both maps to ensure consistency
	a.proxy.ApprovalChsM.Lock()
	a.proxy.PendingRequestsM.Lock()

	// Find stale requests (those older than 2 minutes)
	staleRequestIDs := []string{}
	for requestID, req := range a.proxy.PendingRequests {
		// If the request has been pending for more than 2 minutes, consider it stale
		if req.Context().Value(models.CreationTimeKey) != nil {
			creationTime, ok := req.Context().Value(models.CreationTimeKey).(time.Time)
			if ok && now.Sub(creationTime) > 2*time.Minute {
				staleRequestIDs = append(staleRequestIDs, requestID)
			}
		}
	}

	// Clean up stale requests and their channels
	for _, requestID := range staleRequestIDs {
		delete(a.proxy.PendingRequests, requestID)
		if ch, exists := a.proxy.ApprovalChs[requestID]; exists {
			delete(a.proxy.ApprovalChs, requestID)
			cleanedCount++

			// Try to close the channel by sending a timeout response
			select {
			case ch <- proxy.ApprovalResponse{Approved: false}:
				// Successfully sent a response
			default:
				// Channel is already closed or full, nothing to do
			}
		}
	}

	a.proxy.PendingRequestsM.Unlock()
	a.proxy.ApprovalChsM.Unlock()

	if cleanedCount > 0 {
		log.Printf("Cleaned up %d stale approval channels", cleanedCount)
	}
}

// setupCertificates checks if certificate files exist, and if not, generates new ones
func (a *App) setupCertificates() {
	if err := a.proxy.SetupCertificates(); err != nil {
		log.Fatalf("Failed to setup certificates: %v", err)
	}
}

func (a *App) GetAllRequests(data ...interface{}) {
	var page int = 1
	var limit int = 50
	var sortKey string = "timestamp"
	var sortDirection string = "descending"
	var searchQuery string = ""

	if len(data) > 0 {
		if params, ok := data[0].(map[string]interface{}); ok {
			if p, ok := params["page"].(float64); ok {
				page = int(p)
			}
			if l, ok := params["limit"].(float64); ok {
				limit = int(l)
			}
			if sk, ok := params["sortKey"].(string); ok {
				sortKey = sk
			}
			if sd, ok := params["sortDirection"].(string); ok {
				sortDirection = sd
			}
			if sq, ok := params["searchQuery"].(string); ok {
				searchQuery = sq
			}
		}
	}

	requests, pagination, err := a.historyClient.GetAllRequests(page, limit, sortKey, sortDirection, searchQuery)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:allRequests", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "backend:allRequests", map[string]interface{}{
		"requests":   requests,
		"pagination": pagination,
	})
}

func (a *App) toggleInterception(data ...interface{}) {
	newState := a.proxy.ToggleInterception()
	wailsRuntime.EventsEmit(a.ctx, "backend:interceptionToggled", newState)
}

func (a *App) getInterceptionState(data ...interface{}) {
	state := a.proxy.GetInterceptionState()
	wailsRuntime.EventsEmit(a.ctx, "backend:interceptionState", state)
}

func (a *App) GetCurrentVersion(optionalData ...interface{}) {
	version := "0.0.1" // Hardcoded current version
	wailsRuntime.EventsEmit(a.ctx, "backend:currentVersion", version)
}

func (a *App) CheckForUpdates(optionalData ...interface{}) {
	currentVersion := a.version // Use the version from App struct

	// Fetch latest version from GitHub
	resp, err := http.Get("https://raw.githubusercontent.com/al-sultani/prokzee/main/version.txt")
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:updateCheck", map[string]interface{}{
			"currentVersion":  currentVersion,
			"latestVersion":   currentVersion,
			"updateAvailable": false,
			"error":           "Failed to check for updates: " + err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	// Read the version from the response
	versionBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backend:updateCheck", map[string]interface{}{
			"currentVersion":  currentVersion,
			"latestVersion":   currentVersion,
			"updateAvailable": false,
			"error":           "Failed to read version: " + err.Error(),
		})
		return
	}

	latestVersion := strings.TrimSpace(string(versionBytes))
	fmt.Println(latestVersion)
	// TODO: Remove this temporary workaround
	latestVersion = "0.0.2"
	wailsRuntime.EventsEmit(a.ctx, "backend:updateCheck", map[string]interface{}{
		"currentVersion":  currentVersion,
		"latestVersion":   latestVersion,
		"updateAvailable": latestVersion != currentVersion,
		"error":           nil,
	})
}

// Add these new methods to the App struct
func (a *App) handleCreateNewResenderTab(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing new tab data")
		return
	}
	newTabData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid new tab data format")
		return
	}
	if err := a.resender.CreateNewTab(newTabData); err != nil {
		log.Printf("Error creating new tab: %v", err)
	}
}

func (a *App) handleSendToResender(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing request data")
		return
	}
	requestData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid request data format")
		return
	}
	if err := a.resender.SendToResender(requestData); err != nil {
		log.Printf("Error sending to resender: %v", err)
	}
}

func (a *App) handleGetResenderTabs(data ...interface{}) {
	tabs, err := a.resender.GetTabs()
	if err != nil {
		log.Printf("Error getting resender tabs: %v", err)
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "backend:resenderTabs", tabs)
}

func (a *App) handleUpdateResenderTabName(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab data")
		return
	}
	tabData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid tab data format")
		return
	}
	tabId, ok := tabData["tabId"].(float64)
	if !ok {
		log.Println("Invalid or missing tabId")
		return
	}
	newName, ok := tabData["newName"].(string)
	if !ok {
		log.Println("Invalid or missing newName")
		return
	}
	if err := a.resender.UpdateTabName(int(tabId), newName); err != nil {
		log.Printf("Error updating tab name: %v", err)
	}
}

func (a *App) handleSendResenderRequest(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing request data")
		return
	}
	requestData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid request data format")
		return
	}
	tabId, ok := requestData["tabId"].(float64)
	if !ok {
		log.Println("Invalid tab ID")
		return
	}
	requestDetails, ok := requestData["requestDetails"].(map[string]interface{})
	if !ok {
		log.Println("Invalid request details")
		return
	}
	if err := a.resender.SendRequest(tabId, requestDetails); err != nil {
		log.Printf("Error sending request: %v", err)
		wailsRuntime.EventsEmit(a.ctx, "backend:resenderResponse", map[string]interface{}{
			"error": err.Error(),
			"tabId": tabId,
		})
	}
}

func (a *App) handleCancelResenderRequest(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing request data")
		return
	}
	requestData, ok := data[0].(map[string]interface{})
	if !ok {
		log.Println("Invalid request data format")
		return
	}
	tabId, ok := requestData["tabId"].(float64)
	if !ok {
		log.Println("Invalid tab ID")
		return
	}
	a.resender.CancelRequest(int(tabId))
}

func (a *App) handleGetResenderRequest(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing request ID")
		return
	}
	log.Println("Received request ID:", data[0])
	var requestID int
	switch v := data[0].(type) {
	case float64:
		requestID = int(v)
	case string:
		var err error
		requestID, err = strconv.Atoi(v)
		if err != nil {
			log.Println("Invalid request ID format")
			return
		}
	default:
		log.Println("Invalid request ID format")
		return
	}
	if err := a.resender.GetRequest(requestID); err != nil {
		log.Printf("Error getting request: %v", err)
	}
}

func (a *App) handleDeleteResenderTab(data ...interface{}) {
	if len(data) < 1 {
		log.Println("Missing tab ID")
		return
	}
	tabID, ok := data[0].(float64)
	if !ok {
		log.Println("Invalid tab ID format")
		return
	}
	if err := a.resender.DeleteTab(int(tabID)); err != nil {
		log.Printf("Error deleting tab: %v", err)
	}
}

func (a *App) handleSendToFuzzer(data ...interface{}) {
	if len(data) > 0 {
		if tabData, ok := data[0].(map[string]interface{}); ok {
			a.fuzzer.AddFuzzerTab(tabData)
		}
	}
}

// Add a cleanup method
func (a *App) cleanup() {
	// First stop the proxy server to prevent new requests
	if err := a.proxy.StopServer(); err != nil {
		log.Printf("Error stopping proxy server during cleanup: %v", err)
	}

	// Wait a moment for any in-flight requests to complete
	time.Sleep(500 * time.Millisecond)

	// Signal all db operations to stop
	close(a.dbClosing)

	// Close database connection
	if a.db != nil {
		if err := a.db.Close(); err != nil {
			log.Printf("Error closing database during cleanup: %v", err)
		}
	}
}
