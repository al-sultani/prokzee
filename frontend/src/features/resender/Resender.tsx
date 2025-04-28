"use client"

import type React from "react"
import { useCallback, useState, useEffect, useRef } from "react"
import { Send, Plus, ArrowLeft, ArrowRight, X, Pen, StopCircle } from "lucide-react"
import { HttpRequestEditor } from "../../components"
import ResponseBodyViewer from "../../components/ResponseViewer"
import { useResender, Request, PartialRequest, ResenderTab } from "../../contexts/ResenderContext"
import { useTheme } from "../../contexts/ThemeContext"

const Resender: React.FC = () => {
  const {
    tabs,
    activeTab,
    currentResponse,
    rawRequest,
    url,
    redirectInfo,
    isLoading,
    error,
    pendingRequests,
    loadingTab,
    setActiveTab,
    sendRequest,
    cancelRequest,
    addNewTab,
    deleteTab,
    updateTabName,
    followRedirect,
    setRawRequest,
    setUrl,
    setTabs,
    formatRequest,
    setError,
    setIsLoading,
    handlePrevRequest,
    handleNextRequest,
    handleTabClick,
    setCurrentResponse,
  } = useResender()

  const { theme } = useTheme()

  const fetchedRequestsRef = useRef<Set<number>>(new Set());

  // Component mount effect to load initial data
  useEffect(() => {
    // If tabs exist but no active tab is selected yet or no content is loaded
    if (tabs.length > 0) {
      if (activeTab === null) {
        // Select first tab if no tab is active
        handleTabClick(tabs[0].id);
      } else if (!rawRequest) {
        // Load content if tab is active but no content is loaded
        const tab = tabs.find(t => t.id === activeTab);
        if (tab && tab.requestIds?.length > 0) {
          handleTabClick(activeTab);
        }
      }
    }
  }, [tabs, activeTab, rawRequest, handleTabClick]);

  const currentTab = tabs.find((tab) => tab.id === activeTab)
  const currentIndex =
    currentTab && currentTab.requestIds && currentTab.requestIds.length > 0
      ? currentTab.currentIndex ?? currentTab.requestIds.length - 1
      : -1

  const handleSendRequest = useCallback(() => {
    if (currentTab && activeTab !== null) {
      try {
        const updatedRequest = parseFormattedRequest(rawRequest)
        
        // Make sure we have a valid URL
        if (!url) {
          setError("Please enter a valid URL")
          return
        }
        
        // Ensure the URL is properly formatted
        let finalUrl = url
        try {
          // Parse both URLs
          const baseUrlString = url.includes('://') ? url : `http://${url}`
          const baseUrlObj = new URL(baseUrlString)
          
          // Extract path and query from the raw request
          const requestUrlObj = new URL(updatedRequest.url)
          
          // Create a new URL with only protocol, domain, and port from the base URL
          const cleanBaseUrl = `${baseUrlObj.protocol}//${baseUrlObj.hostname}${baseUrlObj.port ? ':' + baseUrlObj.port : ''}`
          const finalUrlObj = new URL(cleanBaseUrl)
          
          // Add path and query from the request
          finalUrlObj.pathname = requestUrlObj.pathname
          finalUrlObj.search = requestUrlObj.search
          
          finalUrl = finalUrlObj.toString()
        } catch (err) {
          // If URL parsing fails, use the base URL as is
          try {
            // Ensure the URL has a protocol
            finalUrl = url.includes('://') ? url : `http://${url}`
            // Validate URL format
            const urlObj = new URL(finalUrl)
            // Create a URL with only protocol, domain, and port
            finalUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? ':' + urlObj.port : ''}`
          } catch (err) {
            setError("Invalid URL format")
            return
          }
        }
        
        // Update the request with the final URL
        updatedRequest.url = finalUrl
        
        // Set loading state and clear errors
        setIsLoading(true)
        setError(null)
        
        // Send the request
        sendRequest(activeTab, updatedRequest)
      } catch (err) {
        console.error("Error sending request:", err)
        setError("Failed to send request: " + (err instanceof Error ? err.message : String(err)))
        setIsLoading(false)
      }
    }
  }, [activeTab, rawRequest, url, currentTab, sendRequest, setError, setIsLoading])

  const handleCancelRequest = useCallback(() => {
    if (activeTab !== null) {
      cancelRequest(activeTab);
    }
  }, [activeTab, cancelRequest]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value
    setUrl(newUrl)
  }

  const [editingTabId, setEditingTabId] = useState<number | null>(null)
  const [editingTabName, setEditingTabName] = useState<string>("")

  const handleDoubleClickTab = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId)
    if (tab) {
      setEditingTabName(tab.name)
      setEditingTabId(tabId)
    }
  }

  const handleTabNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTabName(e.target.value)
  }

  const handleTabNameComplete = (tabId: number) => {
    if (editingTabName.trim()) {
      updateTabName(tabId, editingTabName)
    }
    setEditingTabId(null)
    setEditingTabName("")
  }

  const parseFormattedRequest = (formatted: string): Request => {
    const lines = formatted.split("\n")
    const [method, pathAndQuery, httpVersion] = lines[0].split(" ")
    const headers: { [key: string]: string } = {}
    let body = ""
    let isBody = false

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "") {
        isBody = true
        continue
      }
      if (isBody) {
        body += lines[i] + "\n"
      } else {
        const [key, ...valueParts] = lines[i].split(":")
        if (key && valueParts.length > 0) {
          const value = valueParts.join(":").trim()
          headers[key.trim()] = value
        }
      }
    }

    const path = pathAndQuery.split("?")[0] || pathAndQuery
    const query = pathAndQuery.split("?")[1] || ""
    const currentUrl = new URL(url)

    currentUrl.pathname = path
    currentUrl.search = query

    return {
      id: 0, // Let the backend handle ID generation
      url: currentUrl.toString(),
      method: method.trim(),
      requestHeaders: JSON.stringify(headers),
      requestBody: body.trim(),
      responseHeaders: "{}",
      responseBody: "",
      httpVersion: httpVersion || "HTTP/1.1",
      status: "",
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-dark-primary">
      {/* Tabs */}
      <div className="bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center px-3 h-8 mr-2 text-sm font-medium cursor-pointer border rounded-md ${
              activeTab === tab.id
                ? "border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-accent hover:text-gray-800 dark:hover:text-white"
            }`}
            onClick={() => handleTabClick(tab.id)}
          >
            {editingTabId === tab.id ? (
              <input
                type="text"
                value={editingTabName}
                onChange={handleTabNameChange}
                onBlur={() => handleTabNameComplete(tab.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleTabNameComplete(tab.id)
                  } else if (e.key === "Escape") {
                    setEditingTabId(null)
                    setEditingTabName("")
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                autoComplete="off"
                spellCheck="false"
                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-800 dark:text-white"
              />
            ) : (
              <>
                <span className="truncate max-w-xs">
                  {tab.name}
                  {loadingTab === tab.id && (
                    <span className="ml-2 inline-block animate-pulse">Loading...</span>
                  )}
                </span>
                {activeTab === tab.id && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDoubleClickTab(tab.id)
                    }}
                    className="ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                  >
                    <Pen className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteTab(tab.id)
                  }}
                  className={`ml-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none ${
                    tabs.length <= 1 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  disabled={tabs.length <= 1}
                  aria-label="Delete Tab"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        ))}
        <button
          onClick={addNewTab}
          className="px-3 h-8 mr-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-accent text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Add new tab"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Main content */}
      <main className="flex-grow flex overflow-hidden">
        {tabs.find((tab) => tab.id === activeTab) ? (
          <>
            {/* Request Section */}
            <div className="w-1/2 flex flex-col p-4 overflow-hidden border border-gray-300 dark:border-gray-700">
              {loadingTab === activeTab ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600 dark:text-gray-300">Loading request data...</span>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-black dark:text-white">Request</h2>
                      {currentTab && currentTab.requestIds && currentTab.requestIds.length > 0 && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {currentIndex + 1} / {currentTab.requestIds.length}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        className="p-1 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handlePrevRequest}
                        disabled={!activeTab || !currentTab?.requestIds?.length || currentTab.currentIndex <= 0}
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={handleNextRequest}
                        disabled={
                          !activeTab || 
                          !currentTab?.requestIds?.length || 
                          currentTab.currentIndex >= currentTab.requestIds.length - 1
                        }
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      {activeTab !== null && pendingRequests[activeTab] ? (
                        <button
                          className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 flex items-center text-sm"
                          onClick={handleCancelRequest}
                        >
                          <StopCircle className="w-4 h-4 mr-2" />
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center text-sm"
                          onClick={handleSendRequest}
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Send
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mb-4">
                    <input
                      type="text"
                      value={url}
                      onChange={handleUrlChange}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-white bg-gray-50 dark:bg-dark-accent"
                      placeholder="Enter URL (e.g., http://example.com:8080)"
                      autoComplete="off"
                      spellCheck="false"
                    />
                  </div>
                  <div className="flex-grow overflow-hidden border border-gray-300 dark:border-gray-700 rounded-lg">
                    <HttpRequestEditor
                      key={`http-editor-${activeTab}-${currentIndex}-${currentResponse?.id || ""}`}
                      initialRequest={rawRequest}
                      onChange={(newRequest) => {
                        setRawRequest(newRequest)
                        const updatedRequest = parseFormattedRequest(newRequest)
                        setTabs((prevTabs: ResenderTab[]) =>
                          prevTabs.map((tab: ResenderTab) =>
                            tab.id === activeTab
                              ? {
                                  ...tab,
                                  currentRequest: updatedRequest,
                                }
                              : tab,
                          ),
                        )
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="w-1/2 flex flex-col p-4 overflow-hidden border-l border border-gray-300 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-black dark:text-white mb-4">Response</h2>
              <div className="flex-grow overflow-hidden border border-gray-300 dark:border-gray-700 rounded-lg">
                {activeTab !== null && pendingRequests[activeTab] ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                ) : (() => {
                  const currentTabRequest = activeTab !== null ? tabs.find(t => t.id === activeTab)?.currentRequest : null;
                  if (currentTabRequest?.error) {
                    return (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-red-500 text-center p-4">
                          <p className="font-semibold mb-2">Error</p>
                          <p className="text-sm">{currentTabRequest.error}</p>
                        </div>
                      </div>
                    );
                  }
                  if (currentResponse || currentTabRequest) {
                    return (
                      <ResponseBodyViewer
                        responseHeaders={currentResponse?.responseHeaders || currentTabRequest?.responseHeaders || "{}"}
                        responseBody={currentResponse?.responseBody || currentTabRequest?.responseBody || ""}
                        status={currentResponse?.status || currentTabRequest?.status || ""}
                        httpVersion={currentResponse?.httpVersion || currentTabRequest?.httpVersion || "HTTP/1.1"}
                      />
                    );
                  }
                  return (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-gray-500 dark:text-gray-400 p-4">No response available. Make a request to see the response here.</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center w-full">
            <span className="text-gray-500 dark:text-gray-400 text-lg">Select a tab or create a new one to start</span>
          </div>
        )}
      </main>

      {/* Redirect Info */}
      {redirectInfo && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-yellow-100 dark:bg-yellow-900 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-200 p-4 rounded-md shadow-lg max-w-md">
          <p className="font-semibold">Received a {redirectInfo.status} redirect to:</p>
          <p className="font-mono text-sm mt-1 break-all">{redirectInfo.location}</p>
          <button
            onClick={followRedirect}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Follow Redirect
          </button>
        </div>
      )}
    </div>
  )
}

export default Resender

