package fuzzer

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type Fuzzer struct {
	ctx             context.Context
	db              *sql.DB
	isFuzzerRunning bool
	runningTabId    int
	FuzzerMutex     sync.Mutex
	FuzzerProgress  map[int]int
	progressMutex   sync.Mutex
}

type FuzzerTab struct {
	ID          int                    `json:"id"`
	Name        string                 `json:"name"`
	TargetUrl   string                 `json:"targetUrl"`
	Method      string                 `json:"method"`
	Path        string                 `json:"path"`
	HttpVersion string                 `json:"http_version"`
	Headers     map[string]interface{} `json:"headers"`
	Body        string                 `json:"body"`
	Payloads    []Payload              `json:"payloads"`
}

type Payload struct {
	Type string   `json:"type"`
	List []string `json:"list,omitempty"`
	From float64  `json:"from,omitempty"`
	To   float64  `json:"to,omitempty"`
	Step float64  `json:"step,omitempty"`
}

func NewFuzzer(ctx context.Context, db *sql.DB) *Fuzzer {
	return &Fuzzer{
		ctx:             ctx,
		db:              db,
		isFuzzerRunning: false,
		runningTabId:    -1,
		FuzzerProgress:  make(map[int]int),
	}
}

func (f *Fuzzer) StartFuzzer(data map[string]interface{}) {
	tabId, ok := data["id"].(float64)
	if !ok {
		log.Println("Invalid or missing tab ID")
		return
	}

	targetUrl, ok := data["targetUrl"].(string)
	if !ok {
		log.Println("Invalid or missing target URL")
		return
	}

	method, ok := data["method"].(string)
	if !ok {
		log.Println("Invalid or missing method")
		return
	}

	path, ok := data["path"].(string)
	if !ok {
		log.Println("Invalid or missing path")
		return
	}

	httpVersion, ok := data["httpVersion"].(string)
	if !ok || httpVersion == "" {
		httpVersion = "HTTP/1.1" // Default to HTTP/1.1 if not specified
	}

	headers, ok := data["headers"].(map[string]interface{})
	if !ok {
		log.Println("Invalid or missing headers")
		return
	}

	body, ok := data["body"].(string)
	if !ok {
		log.Println("Invalid or missing body")
		return
	}

	payloads, ok := data["payloads"].([]interface{})
	if !ok {
		log.Println("Invalid or missing payloads")
		return
	}

	resumeFrom, _ := data["resumeFrom"].(float64)
	startIndex := int(resumeFrom)

	log.Printf("Received data: targetUrl=%s, method=%s, path=%s, httpVersion=%s, payloads=%v, resumeFrom=%d", targetUrl, method, path, httpVersion, payloads, startIndex)

	f.FuzzerMutex.Lock()
	if f.isFuzzerRunning {
		f.FuzzerMutex.Unlock()
		log.Println("Fuzzer is already running")
		return
	}
	f.isFuzzerRunning = true
	f.runningTabId = int(tabId)
	f.FuzzerMutex.Unlock()

	// Create a custom transport based on the requested HTTP version
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	// Disable HTTP/2 if HTTP/1.1 is requested
	if httpVersion == "HTTP/1.1" {
		transport.TLSNextProto = make(map[string]func(authority string, c *tls.Conn) http.RoundTripper)
	}

	client := &http.Client{
		Transport: transport,
	}

	// Collect all payload values
	var allPayloadValues [][]string
	for _, payload := range payloads {
		payloadMap, ok := payload.(map[string]interface{})
		if !ok {
			log.Println("Invalid payload format")
			continue
		}

		payloadType, ok := payloadMap["type"].(string)
		if !ok {
			log.Println("Invalid or missing payload type")
			continue
		}

		var payloadValues []string
		if payloadType == "sequence" {
			from, _ := payloadMap["from"].(float64)
			to, _ := payloadMap["to"].(float64)
			step, _ := payloadMap["step"].(float64)
			for i := from; i <= to; i += step {
				payloadValues = append(payloadValues, fmt.Sprintf("%v", i))
			}
		} else if payloadType == "list" {
			list, ok := payloadMap["list"].([]interface{})
			if !ok {
				log.Println("Invalid list payload format")
				continue
			}
			for _, item := range list {
				if str, ok := item.(string); ok {
					payloadValues = append(payloadValues, str)
				}
			}
		}

		log.Printf("Payload values for type %s: %v", payloadType, payloadValues)
		allPayloadValues = append(allPayloadValues, payloadValues)
	}

	if len(allPayloadValues) == 0 {
		log.Println("No payload values found")
		f.FuzzerMutex.Lock()
		f.isFuzzerRunning = false
		f.FuzzerMutex.Unlock()
		return
	}

	// Reset progress for this tab
	f.progressMutex.Lock()
	f.FuzzerProgress[int(tabId)] = 0
	f.progressMutex.Unlock()

	// Send progress update to frontend
	runtime.EventsEmit(f.ctx, "backend:FuzzerProgress", map[string]interface{}{
		"tabId":    int(tabId),
		"progress": 0,
	})

	// Process the payloads
	for i := startIndex; i < len(allPayloadValues[0]); i++ {
		f.FuzzerMutex.Lock()
		if !f.isFuzzerRunning {
			f.FuzzerMutex.Unlock()
			log.Println("Fuzzer stopped")
			return
		}
		f.FuzzerMutex.Unlock()

		modifiedBody := body
		modifiedPath := path
		for j, payloadValues := range allPayloadValues {
			placeholder := fmt.Sprintf("[__Inject-Here__[%d]]", j+1)
			modifiedBody = strings.ReplaceAll(modifiedBody, placeholder, payloadValues[i])
			modifiedPath = strings.ReplaceAll(modifiedPath, placeholder, payloadValues[i])
		}

		// Create a new HTTP request
		url := targetUrl + modifiedPath
		req, err := http.NewRequest(method, url, bytes.NewBufferString(modifiedBody))
		if err != nil {
			log.Printf("Error creating request: %v", err)
			f.sendFuzzerResult(int(tabId), i, allPayloadValues, nil, err)
			continue
		}

		// Set headers
		for key, value := range headers {
			if strValue, ok := value.(string); ok {
				req.Header.Set(key, strValue)
			}
		}

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("Error sending request: %v", err)
			f.sendFuzzerResult(int(tabId), i, allPayloadValues, nil, err)
			continue
		}
		defer resp.Body.Close()

		f.handleFuzzerResponse(int(tabId), i, allPayloadValues, resp)
	}

	// Clear progress when finished
	f.FuzzerMutex.Lock()
	f.isFuzzerRunning = false
	runningTabId := f.runningTabId
	f.runningTabId = -1
	f.FuzzerMutex.Unlock()

	// Notify frontend that Fuzzer has finished
	runtime.EventsEmit(f.ctx, "backend:FuzzerFinished", map[string]interface{}{
		"tabId": runningTabId,
	})

	log.Println("Fuzzer finished")
}

func (f *Fuzzer) handleFuzzerResponse(tabId, index int, allPayloadValues [][]string, resp *http.Response) {
	var responseBody []byte
	var err error

	if resp.Header.Get("Content-Encoding") == "gzip" {
		reader, err := gzip.NewReader(resp.Body)
		if err != nil {
			log.Printf("Error creating gzip reader: %v", err)
			f.sendFuzzerResult(tabId, index, allPayloadValues, resp, err)
			return
		}
		defer reader.Close()
		responseBody, err = ioutil.ReadAll(reader)
	} else {
		responseBody, err = ioutil.ReadAll(resp.Body)
	}
	resp.Body = ioutil.NopCloser(bytes.NewBuffer(responseBody))
	if err != nil {
		log.Printf("Error reading response body: %v", err)
		f.sendFuzzerResult(tabId, index, allPayloadValues, resp, err)
		return
	}

	// Update progress
	f.progressMutex.Lock()
	f.FuzzerProgress[tabId] = index + 1
	f.progressMutex.Unlock()

	// Send progress update to frontend
	runtime.EventsEmit(f.ctx, "backend:FuzzerProgress", map[string]interface{}{
		"tabId":    tabId,
		"progress": index + 1,
	})

	f.sendFuzzerResult(tabId, index, allPayloadValues, resp, nil)
}

func (f *Fuzzer) sendFuzzerResult(tabId, index int, allPayloadValues [][]string, resp *http.Response, err error) {
	result := map[string]interface{}{
		"payload": strings.Join(getPayloadValuesAtIndex(allPayloadValues, index), ","),
	}

	if err != nil {
		result["error"] = err.Error()
		result["responseHeaders"] = map[string][]string{}
		result["responseBody"] = ""
		result["responseLength"] = 0
		result["statusCode"] = "0"
		result["contentType"] = ""
		result["rawStatusLine"] = ""
	} else {
		responseBody, _ := ioutil.ReadAll(resp.Body)
		resp.Body = ioutil.NopCloser(bytes.NewBuffer(responseBody))

		result["responseHeaders"] = resp.Header
		result["responseBody"] = string(responseBody)
		result["responseLength"] = len(responseBody)
		result["statusCode"] = fmt.Sprintf("%d", resp.StatusCode)
		result["contentType"] = resp.Header.Get("Content-Type")
		result["rawStatusLine"] = fmt.Sprintf("%s %s", resp.Proto, resp.Status)
		result["error"] = ""
	}

	runtime.EventsEmit(f.ctx, "backend:FuzzerResult", map[string]interface{}{
		"id":     tabId,
		"result": result,
	})
}

func (f *Fuzzer) StopFuzzer() {
	f.FuzzerMutex.Lock()
	wasRunning := f.isFuzzerRunning
	runningTabId := f.runningTabId
	f.isFuzzerRunning = false
	f.FuzzerMutex.Unlock()

	if wasRunning {
		runtime.EventsEmit(f.ctx, "backend:FuzzerFinished", map[string]interface{}{
			"tabId": runningTabId,
		})
	}

	log.Println("Fuzzer stop requested")
}

func (f *Fuzzer) GetFuzzerTabs() []map[string]interface{} {
	rows, err := f.db.Query("SELECT id, name, target_url, method, path, headers, body, payloads FROM fuzzer_tabs")
	if err != nil {
		log.Printf("Failed to fetch Fuzzer tabs: %v", err)
		return []map[string]interface{}{}
	}
	defer rows.Close()

	var tabs []map[string]interface{}
	for rows.Next() {
		var tab FuzzerTab
		var headersJSON, payloadsJSON string
		if err := rows.Scan(&tab.ID, &tab.Name, &tab.TargetUrl, &tab.Method, &tab.Path, &headersJSON, &tab.Body, &payloadsJSON); err != nil {
			log.Printf("Failed to scan Fuzzer tab: %v", err)
			continue
		}

		if err := json.Unmarshal([]byte(headersJSON), &tab.Headers); err != nil {
			log.Printf("Failed to unmarshal headers: %v", err)
			tab.Headers = make(map[string]interface{})
		}

		if err := json.Unmarshal([]byte(payloadsJSON), &tab.Payloads); err != nil {
			log.Printf("Failed to unmarshal payloads: %v", err)
			tab.Payloads = []Payload{}
		}

		tabs = append(tabs, map[string]interface{}{
			"id":          tab.ID,
			"name":        tab.Name,
			"targetUrl":   tab.TargetUrl,
			"method":      tab.Method,
			"path":        tab.Path,
			"httpVersion": "HTTP/1.1", // Default value
			"headers":     tab.Headers,
			"body":        tab.Body,
			"payloads":    tab.Payloads,
		})
	}

	return tabs
}

func getPayloadValuesAtIndex(allPayloadValues [][]string, index int) []string {
	var values []string
	for _, payloadValues := range allPayloadValues {
		if index < len(payloadValues) {
			values = append(values, payloadValues[index])
		}
	}
	return values
}

// Additional methods for managing fuzzer tabs

func (f *Fuzzer) AddFuzzerTab(tabData map[string]interface{}) {
	targetUrl, ok := tabData["targetUrl"].(string)
	if !ok {
		targetUrl = "https://postman-echo.com"
	}

	method, ok := tabData["method"].(string)
	if !ok {
		method = "POST"
	}

	path, ok := tabData["path"].(string)
	if !ok {
		path = "/post"
	}

	headers, ok := tabData["headers"].(map[string]interface{})
	if !ok {
		headers = map[string]interface{}{
			"Content-Type":    "application/json",
			"User-Agent":      "Mozilla/5.0",
			"Accept":          "application/json",
			"Accept-Encoding": "gzip, deflate, br",
			"Connection":      "keep-alive",
			"Host":            "postman-echo.com",
		}
	}

	body, ok := tabData["body"].(string)
	if !ok {
		body = `{"tool": "prokzee", "test": "This is a test request", "timestamp": "[__Inject-Here__[1]]"}`
	}

	payloads, ok := tabData["payloads"].([]interface{})
	if !ok {
		payloads = []interface{}{
			map[string]interface{}{
				"type": "list",
				"list": []string{"2024", "2025", "2026"},
			},
		}
	}

	headersJSON, err := json.Marshal(headers)
	if err != nil {
		log.Printf("Failed to marshal headers: %v", err)
		return
	}

	payloadsJSON, err := json.Marshal(payloads)
	if err != nil {
		log.Printf("Failed to marshal payloads: %v", err)
		return
	}

	var lastID int
	err = f.db.QueryRow("SELECT COALESCE(MAX(id), 0) FROM fuzzer_tabs").Scan(&lastID)
	if err != nil {
		log.Printf("Failed to get last tab ID: %v", err)
		return
	}
	tabName := fmt.Sprintf("Tab %d", lastID+1)

	result, err := f.db.Exec(
		"INSERT INTO fuzzer_tabs (name, target_url, method, path, headers, body, payloads) VALUES (?, ?, ?, ?, ?, ?, ?)",
		tabName, targetUrl, method, path, string(headersJSON), body, string(payloadsJSON),
	)
	if err != nil {
		log.Printf("Failed to insert Fuzzer tab: %v", err)
		return
	}

	tabID, err := result.LastInsertId()
	if err != nil {
		log.Printf("Failed to get last insert ID: %v", err)
		return
	}

	runtime.EventsEmit(f.ctx, "backend:FuzzerTabs", f.GetFuzzerTabs())
	runtime.EventsEmit(f.ctx, "backend:newFuzzerTab", map[string]interface{}{
		"tabId": tabID,
	})
}

func (f *Fuzzer) UpdateFuzzerTab(tabData map[string]interface{}) {
	id, ok := tabData["id"].(float64)
	if !ok {
		log.Println("Invalid or missing ID")
		return
	}

	name, ok := tabData["name"].(string)
	if !ok {
		log.Println("Invalid or missing name")
		return
	}

	targetUrl, ok := tabData["targetUrl"].(string)
	if !ok {
		log.Println("Invalid or missing targetUrl")
		return
	}

	method, ok := tabData["method"].(string)
	if !ok {
		log.Println("Invalid or missing method")
		return
	}

	path, ok := tabData["path"].(string)
	if !ok {
		log.Println("Invalid or missing path")
		return
	}

	headers, ok := tabData["headers"].(map[string]interface{})
	if !ok {
		log.Println("Invalid or missing headers")
		return
	}

	body, ok := tabData["body"].(string)
	if !ok {
		log.Println("Invalid or missing body")
		return
	}

	payloads, ok := tabData["payloads"].([]interface{})
	if !ok {
		log.Println("Invalid or missing payloads")
		return
	}

	headersJSON, err := json.Marshal(headers)
	if err != nil {
		log.Println("Failed to marshal headers")
		return
	}

	payloadsJSON, err := json.Marshal(payloads)
	if err != nil {
		log.Println("Failed to marshal payloads")
		return
	}

	_, err = f.db.Exec(`
		UPDATE fuzzer_tabs
		SET name = ?, target_url = ?, method = ?, path = ?, headers = ?, body = ?, payloads = ?
		WHERE id = ?
	`, name, targetUrl, method, path, string(headersJSON), body, string(payloadsJSON), int(id))

	if err != nil {
		log.Printf("Failed to update Fuzzer tab: %v", err)
		return
	}

	runtime.EventsEmit(f.ctx, "backend:FuzzerTabUpdated", map[string]interface{}{
		"id": int(id),
	})
}

func (f *Fuzzer) UpdateFuzzerTabName(tabId float64, newName string) {
	_, err := f.db.Exec("UPDATE fuzzer_tabs SET name = ? WHERE id = ?", newName, int(tabId))
	if err != nil {
		log.Printf("Failed to update tab name: %v", err)
		return
	}

	runtime.EventsEmit(f.ctx, "backend:FuzzerTabNameUpdated", map[string]interface{}{
		"tabId":   int(tabId),
		"newName": newName,
	})
}

func (f *Fuzzer) RemoveFuzzerTab(tabId int) {
	_, err := f.db.Exec("DELETE FROM fuzzer_tabs WHERE id = ?", tabId)
	if err != nil {
		runtime.EventsEmit(f.ctx, "backend:FuzzerTabRemoved", map[string]interface{}{
			"error": "Failed to remove Fuzzer tab",
		})
		return
	}

	tabs := f.GetFuzzerTabs()
	runtime.EventsEmit(f.ctx, "backend:FuzzerTabs", tabs)
	runtime.EventsEmit(f.ctx, "backend:FuzzerTabRemoved", map[string]interface{}{
		"success": true,
		"tabId":   tabId,
	})
}
