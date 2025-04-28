"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { PlusCircle, MessageCircle, Send, Plus, Edit2, Trash2, Loader } from "lucide-react"
import { useLLM } from "../../contexts/LLMContext"
import { useTheme } from "../../contexts/ThemeContext"

// Add this function to format markdown text
const formatMarkdown = (text: string) => {
  // Replace code blocks
  let formatted = text.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>")

  // Replace inline code
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Replace bold text
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")

  // Replace italic text
  formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>")

  // Replace links
  formatted = formatted.replace(
    /\[([^\]]+)\]$$([^)]+)$$/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  )

  // Replace headers
  formatted = formatted.replace(/^### (.*$)/gm, "<h3>$1</h3>")
  formatted = formatted.replace(/^## (.*$)/gm, "<h2>$1</h2>")
  formatted = formatted.replace(/^# (.*$)/gm, "<h1>$1</h1>")

  // Replace lists
  formatted = formatted.replace(/^\s*\* (.*$)/gm, "<li>$1</li>")
  formatted = formatted.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")

  // Replace line breaks
  formatted = formatted.replace(/\n/g, "<br>")

  return formatted
}




const LLMAnalyzer: React.FC = () => {
  const {
    chatContexts,
    activeChatContextId,
    isLoading,
    error,
    clearError,
    setActiveChatContextId,
    addChatContext,
    deleteChatContext,
    editChatContextName,
    sendMessage: sendContextMessage,
    updateUnsentMessage,
    getUnsentMessage,
  } = useLLM()

  const { theme } = useTheme()

  const [inputMessage, setInputMessage] = useState("")
  const [editingContextId, setEditingContextId] = useState<number | null>(null)
  const [editingContextName, setEditingContextName] = useState("")
  const [textareaHeight, setTextareaHeight] = useState(50)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Get the active chat context
  const activeContext = activeChatContextId !== null 
    ? chatContexts.find(context => context.id === activeChatContextId)
    : null;

  // Debug useEffect to log when chatContexts change
  useEffect(() => {
    console.log("chatContexts updated in LLMAnalyzer:", chatContexts);
    console.log("Number of chat contexts:", chatContexts.length);
    console.log("Active chat context ID:", activeChatContextId);
  }, [chatContexts, activeChatContextId]);

  // Load unsent message when changing contexts
  useEffect(() => {
    if (activeChatContextId !== null) {
      const unsentMessage = getUnsentMessage()
      setInputMessage(unsentMessage)
      setTextareaHeight(50) // Reset height when switching contexts
      scrollToBottom()
    }
  }, [activeChatContextId])

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeChatContextId !== null) {
      const activeContext = chatContexts.find((context) => context.id === activeChatContextId)
      if (activeContext?.messages?.length) {
        scrollToBottom()
      }
    }
  }, [chatContexts, activeChatContextId])

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      // Use requestAnimationFrame to ensure the scroll happens after the render
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      })
    }
  }

  const startEditingContextName = (id: number, currentName: string) => {
    setEditingContextId(id)
    setEditingContextName(currentName)
  }

  const saveEditingContextName = () => {
    if (editingContextId !== null) {
      editChatContextName(editingContextId, editingContextName)
      setEditingContextId(null)
    }
  }

  const sendMessage = () => {
    if (!inputMessage.trim() || activeChatContextId === null) return
    sendContextMessage(inputMessage)
    setInputMessage("")
    setTextareaHeight(50) // Reset height after sending
  }

  const handleTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = event.target.value
    setInputMessage(newMessage)

    // Calculate new height with limits
    const scrollHeight = event.target.scrollHeight
    const newHeight = Math.min(Math.max(scrollHeight, 60), 200)
    setTextareaHeight(newHeight)

    updateUnsentMessage(newMessage)
  }

  const addChatContextHandler = () => {
    console.log("Add chat context button clicked in LLMAnalyzer");
    try {
      addChatContext();
      console.log("addChatContext function called from LLMAnalyzer");
    } catch (error) {
      console.error("Error calling addChatContext:", error);
    }
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="flex h-screen text-gray-800 dark:text-white bg-gray-100 dark:bg-dark-primary overflow-hidden">
      {error && (
        <div className="fixed top-4 right-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded z-50 flex items-center justify-between max-w-md shadow-lg">
          <span className="flex-grow mr-4">{error}</span>
          <button
            onClick={clearError}
            className="flex-shrink-0 text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100 focus:outline-none"
            aria-label="Dismiss error"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <aside className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary shadow-md flex flex-col">
        <div className="flex justify-between items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Chat Contexts</h1>
          <button
            onClick={addChatContextHandler}
            className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Add New Chat"
          >
            <Plus className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chatContexts.map((chatContext) => (
            <div
              key={chatContext.id}
              className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
                activeChatContextId === chatContext.id ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
              }`}
            >
              {editingContextId === chatContext.id ? (
                <input
                  type="text"
                  value={editingContextName}
                  onChange={(e) => setEditingContextName(e.target.value)}
                  onBlur={saveEditingContextName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveEditingContextName()
                    } else if (e.key === "Escape") {
                      setEditingContextId(null)
                      setEditingContextName("")
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-800 dark:text-white"
                />
              ) : (
                <button className="flex items-center flex-grow" onClick={() => setActiveChatContextId(chatContext.id)}>
                  <MessageCircle className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{chatContext.name}</span>
                </button>
              )}
              <div className="flex items-center">
                {activeChatContextId === chatContext.id && (
                  <>
                    <button
                      onClick={() => startEditingContextName(chatContext.id, chatContext.name)}
                      className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteChatContext(chatContext.id)}
                      className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex-grow flex flex-col overflow-hidden w-0 min-w-0">
        <header className="flex justify-between items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Messages</h2>
        </header>
        <div
          className="flex-grow overflow-y-auto bg-white dark:bg-dark-primary"
          ref={messagesContainerRef}
          style={{
            height: "calc(100vh - 200px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          <div className="flex-1 p-4 space-y-4">
            {activeContext ? (
              <>
                {(activeContext.messages || []).map((message, index) => (
                  <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`p-3 rounded-lg ${
                        message.role === "user"
                          ? "bg-blue-100 dark:bg-blue-900 text-right text-gray-800 dark:text-gray-200"
                          : "bg-green-100 dark:bg-green-900 text-left text-gray-800 dark:text-gray-200"
                      }`}
                      style={{
                        whiteSpace: "pre-wrap",
                        maxWidth: "80%",
                        width: "fit-content",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      <p className="font-semibold mb-1">{message.role === "user" ? "You" : "Assistant"}</p>
                      {message.role === "assistant" ? (
                        <div
                          className="text-sm markdown-content"
                          dangerouslySetInnerHTML={{
                            __html: formatMarkdown(message.content.replace(/\n\s*\n/g, "\n")),
                          }}
                        />
                      ) : (
                        <p className="text-sm">{message.content.replace(/\n\s*\n/g, "\n")}</p>
                      )}
                    </div>
                  </div>
                ))}
                {activeContext.isLoading && (
                  <div className="flex justify-start">
                    <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                      <div className="animate-pulse flex space-x-2">
                        <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                        <div className="h-2 w-2 bg-blue-500 rounded-full animation-delay-200"></div>
                        <div className="h-2 w-2 bg-blue-500 rounded-full animation-delay-400"></div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <MessageCircle className="w-16 h-16 mb-4" />
                <span className="text-lg">Select a chat context to start chatting</span>
                <button
                  className="mt-4 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center"
                  onClick={addChatContextHandler}
                >
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Create New Chat Context
                </button>
              </div>
            )}
          </div>
        </div>
        <div
          className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary"
          style={{ paddingBottom: "2rem" }}
        >
          <div className="flex flex-col">
            <div className="relative flex">
              <textarea
                value={inputMessage}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={activeContext?.isLoading ? "Waiting for response..." : "Type a message... (Shift+Enter for new line)"}
                className="flex-grow p-3 border rounded-lg font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[60px] pr-12 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ height: `${textareaHeight}px`, maxHeight: "200px", overflowY: "auto" }}
                disabled={!activeContext || activeContext.isLoading}
                autoComplete="off"
                spellCheck="false"
              />
              <button
                className="absolute right-2 bottom-2 p-2 text-white bg-blue-600 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={sendMessage}
                disabled={!activeContext || activeContext.isLoading || !inputMessage.trim()}
                aria-label="Send message"
              >
                {activeContext?.isLoading ? (
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
              <span>{inputMessage.length > 0 ? `${inputMessage.length} characters` : ""}</span>
              <span>Press Shift+Enter for new line, Enter to send</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default LLMAnalyzer

