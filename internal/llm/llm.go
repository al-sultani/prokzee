package llm

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Message represents a chat message
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// ChatGPTRequest represents a request to the ChatGPT API
type ChatGPTRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
}

// ChatGPTResponse represents a response from the ChatGPT API
type ChatGPTResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// Client handles LLM-related operations
type Client struct {
	ctx context.Context
	db  *sql.DB
}

// NewClient creates a new LLM client
func NewClient(ctx context.Context, db *sql.DB) *Client {
	return &Client{
		ctx: ctx,
		db:  db,
	}
}

// SendMessage handles sending a message to the LLM
func (c *Client) SendMessage(messageData map[string]interface{}, settings map[string]interface{}) error {
	chatContextId, ok := messageData["chatContextId"].(float64)
	if !ok {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         "Invalid chat context ID",
		})
		return fmt.Errorf("invalid chat context ID")
	}

	// Get all messages for this chat context from the database
	rows, err := c.db.Query(`
		SELECT role, content FROM chat_messages 
		WHERE chat_context_id = ? 
		ORDER BY id ASC
	`, int(chatContextId))
	if err != nil {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         fmt.Sprintf("Failed to retrieve chat messages: %v", err),
		})
		return fmt.Errorf("failed to retrieve chat messages: %v", err)
	}
	defer rows.Close()

	// Build the complete message history
	var allMessages []Message
	for rows.Next() {
		var role, content string
		if err := rows.Scan(&role, &content); err != nil {
			log.Printf("Failed to scan message row: %v", err)
			continue
		}
		allMessages = append(allMessages, Message{
			Role:    role,
			Content: content,
		})
	}

	// Add the new message if it's not already in the database
	newMessages, ok := messageData["messages"].([]interface{})
	if ok && len(newMessages) > 0 {
		for _, msg := range newMessages {
			if msgMap, ok := msg.(map[string]interface{}); ok {
				role, _ := msgMap["role"].(string)
				content, _ := msgMap["content"].(string)

				// Check if this message is already in our list (to avoid duplicates)
				isDuplicate := false
				for _, existingMsg := range allMessages {
					if existingMsg.Role == role && existingMsg.Content == content {
						isDuplicate = true
						break
					}
				}

				if !isDuplicate {
					allMessages = append(allMessages, Message{
						Role:    role,
						Content: content,
					})

					// Store the new message in the database
					_, err = c.db.Exec(`
						INSERT INTO chat_messages (chat_context_id, role, content)
						VALUES (?, ?, ?)
					`, int(chatContextId), role, content)
					if err != nil {
						log.Printf("Failed to store message: %v", err)
					}
				}
			}
		}
	}

	// Get OpenAI settings
	openaiAPIURL, ok := settings["OpenAIAPIURL"].(string)
	if !ok {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         "Invalid OpenAI API URL",
		})
		return fmt.Errorf("invalid OpenAI API URL")
	}
	openaiAPIKey, ok := settings["OpenAIAPIKey"].(string)
	if !ok {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         "Invalid OpenAI API key",
		})
		return fmt.Errorf("invalid OpenAI API key")
	}

	// Prepare the ChatGPT request with all messages
	chatGPTRequest := ChatGPTRequest{
		Model:    "gpt-4o-mini",
		Messages: allMessages,
	}

	// Convert the request to JSON
	requestBody, err := json.Marshal(chatGPTRequest)
	if err != nil {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         fmt.Sprintf("Failed to prepare request: %v", err),
		})
		return fmt.Errorf("failed to marshal request: %v", err)
	}

	// Send the request to the ChatGPT API
	req, err := http.NewRequest("POST", openaiAPIURL, bytes.NewBuffer(requestBody))
	if err != nil {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         fmt.Sprintf("Failed to create request: %v", err),
		})
		return fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+openaiAPIKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         fmt.Sprintf("Failed to send request: %v", err),
		})
		return fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		errorMsg := fmt.Sprintf("ChatGPT API returned non-200 status code: %d, body: %s", resp.StatusCode, string(body))
		runtime.EventsEmit(c.ctx, "backend:error", map[string]interface{}{
			"chatContextId": chatContextId,
			"error":         errorMsg,
		})
		return fmt.Errorf(errorMsg)
	}

	var chatGPTResponse ChatGPTResponse
	if err := json.NewDecoder(resp.Body).Decode(&chatGPTResponse); err != nil {
		return fmt.Errorf("failed to decode response: %v", err)
	}

	// Extract the response message
	if len(chatGPTResponse.Choices) > 0 {
		responseMessage := chatGPTResponse.Choices[0].Message.Content

		// Store the assistant's response in the database
		_, err = c.db.Exec(`
			INSERT INTO chat_messages (chat_context_id, role, content)
			VALUES (?, ?, ?)
		`, int(chatContextId), "assistant", responseMessage)
		if err != nil {
			return fmt.Errorf("failed to store assistant response: %v", err)
		}

		runtime.EventsEmit(c.ctx, "backend:receiveMessage", map[string]interface{}{
			"chatContextId": int(chatContextId),
			"message": map[string]interface{}{
				"role":    "assistant",
				"content": responseMessage,
			},
		})
	} else {
		return fmt.Errorf("ChatGPT response contained no choices")
	}

	return nil
}

// CreateChatContext creates a new chat context
func (c *Client) CreateChatContext(requestString string) (int64, error) {
	// Get the last chat context ID
	var lastID int
	err := c.db.QueryRow("SELECT COALESCE(MAX(id), 0) FROM chat_contexts").Scan(&lastID)
	if err != nil {
		return 0, fmt.Errorf("failed to get last chat context ID: %v", err)
	}

	// Create the new chat name
	newChatName := fmt.Sprintf("Chat %d", lastID+1)

	// Insert the new chat context
	result, err := c.db.Exec(`INSERT INTO chat_contexts (name) VALUES (?)`, newChatName)
	if err != nil {
		return 0, fmt.Errorf("failed to create chat context: %v", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert ID: %v", err)
	}

	// Emit the event with the new chat context
	runtime.EventsEmit(c.ctx, "backend:chatContextCreated", map[string]interface{}{
		"id":   id,
		"name": newChatName,
	})

	// If request string is provided, format and send it
	if requestString != "" {
		message := fmt.Sprintf("Analyze the following HTTP:\n\n%s", requestString)
		err = c.SendMessage(map[string]interface{}{
			"chatContextId": float64(id),
			"messages": []interface{}{
				map[string]interface{}{
					"role":    "user",
					"content": message,
				},
			},
		}, nil) // Settings will need to be passed from the caller
		if err != nil {
			log.Printf("Failed to send initial message: %v", err)
		}
	}

	return id, nil
}

// DeleteChatContext deletes a chat context and its messages
func (c *Client) DeleteChatContext(chatContextId int) error {
	// Delete messages associated with the context
	_, err := c.db.Exec(`DELETE FROM chat_messages WHERE chat_context_id = ?`, chatContextId)
	if err != nil {
		return fmt.Errorf("failed to delete chat messages: %v", err)
	}

	// Delete the chat context
	_, err = c.db.Exec(`DELETE FROM chat_contexts WHERE id = ?`, chatContextId)
	if err != nil {
		return fmt.Errorf("failed to delete chat context: %v", err)
	}

	runtime.EventsEmit(c.ctx, "backend:chatContextDeleted", map[string]interface{}{
		"id": chatContextId,
	})

	return nil
}

// EditChatContextName updates the name of a chat context
func (c *Client) EditChatContextName(chatContextId int, newName string) error {
	_, err := c.db.Exec(`UPDATE chat_contexts SET name = ? WHERE id = ?`, newName, chatContextId)
	if err != nil {
		return fmt.Errorf("failed to update chat context name: %v", err)
	}

	runtime.EventsEmit(c.ctx, "backend:chatContextNameUpdated", map[string]interface{}{
		"id":      chatContextId,
		"newName": newName,
	})

	return nil
}

// GetChatContexts retrieves all chat contexts
func (c *Client) GetChatContexts() ([]map[string]interface{}, error) {
	rows, err := c.db.Query(`SELECT id, name FROM chat_contexts ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch chat contexts: %v", err)
	}
	defer rows.Close()

	var contexts []map[string]interface{}
	for rows.Next() {
		var id int
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			log.Printf("Failed to scan chat context: %v", err)
			continue
		}
		contexts = append(contexts, map[string]interface{}{
			"id":   id,
			"name": name,
		})
	}

	return contexts, nil
}

// GetChatMessages retrieves messages for a specific chat context
func (c *Client) GetChatMessages(chatContextId int) ([]map[string]interface{}, error) {
	rows, err := c.db.Query(`
		SELECT role, content, timestamp
		FROM chat_messages
		WHERE chat_context_id = ?
		ORDER BY timestamp ASC
	`, chatContextId)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch chat messages: %v", err)
	}
	defer rows.Close()

	var messages []map[string]interface{}
	for rows.Next() {
		var role, content string
		var timestamp time.Time
		if err := rows.Scan(&role, &content, &timestamp); err != nil {
			log.Printf("Failed to scan chat message: %v", err)
			continue
		}
		messages = append(messages, map[string]interface{}{
			"role":      role,
			"content":   content,
			"timestamp": timestamp,
		})
	}

	return messages, nil
}
