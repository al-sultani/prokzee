import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { EventsOn, EventsEmit, EventsOff } from "../../wailsjs/runtime/runtime";

export interface Request {
  id: number
  url: string
  method: string
  requestHeaders: string
  requestBody: string
  responseHeaders: string
  responseBody: string
  httpVersion: string
  status: string
  error?: string
}

export interface PartialRequest extends Partial<Request> {
  id: number
}

export interface ResenderTab {
  id: number
  name: string
  requestIds: number[]
  currentIndex: number
  currentRequest: PartialRequest | undefined
}

interface ResenderContextType {
  tabs: ResenderTab[]
  activeTab: number | null
  currentResponse: Request | null
  rawRequest: string
  url: string
  redirectInfo: { status: number; location: string } | null
  isLoading: boolean
  error: string | null
  pendingRequests: Record<number, boolean>
  loadingTab: number | null
  setActiveTab: (tabId: number | null) => void
  sendRequest: (tabId: number, request: Request) => void
  cancelRequest: (tabId: number) => void
  addNewTab: () => void
  deleteTab: (tabId: number) => void
  updateTabName: (tabId: number, newName: string) => void
  followRedirect: () => void
  setRawRequest: (request: string) => void
  setUrl: (url: string) => void
  setTabs: React.Dispatch<React.SetStateAction<ResenderTab[]>>
  formatRequest: (requestDetails: Request) => string
  setIsLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  handlePrevRequest: () => void
  handleNextRequest: () => void
  setCurrentResponse: (response: Request | null) => void
  handleTabClick: (tabId: number) => void
}

const ResenderContext = createContext<ResenderContextType | undefined>(undefined)

export const useResender= () => {
  const context = useContext(ResenderContext)
  if (context === undefined) {
    throw new Error('useResendermust be used within a ResenderProvider')
  }
  return context
}

const formatRequest = (requestDetails: Request): string => {
  try {
    const currentUrl = new URL(requestDetails.url || "")
    const method = requestDetails.method || "GET";
    const httpVersion = requestDetails.httpVersion || "HTTP/1.1";

    const requestLine = `${method} ${currentUrl.pathname}${currentUrl.search} ${httpVersion}`

    const headers: Record<string, string> = JSON.parse(requestDetails.requestHeaders || "{}")
    
    // Only use URL's host if no Host header exists
    if (!headers["Host"] && !headers["host"]) {
      headers["Host"] = currentUrl.host
    }

    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n")

    return `${requestLine}\n${headerLines}\n\n${requestDetails.requestBody || ""}`
  } catch (error) {
    console.error("Error formatting request:", error)
    return "Error formatting request. Please check the console for details."
  }
}

export const ResenderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<ResenderTab[]>([])
  const [activeTab, setActiveTab] = useState<number | null>(null)
  const [currentResponse, setCurrentResponse] = useState<Request | null>(null)
  const [rawRequest, setRawRequest] = useState<string>("")
  const [url, setUrl] = useState<string>("")
  const [redirectInfo, setRedirectInfo] = useState<{ status: number; location: string; httpVersion: string } | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRequests, setPendingRequests] = useState<Record<number, boolean>>({})
  const [loadingTab, setLoadingTab] = useState<number | null>(null)
  
  // Add a ref to track fetched requests
  const fetchedRequestsRef = useRef<Set<number>>(new Set())

  // Modify the handleResenderRequest handler to use function refs
  const activeTabRef = useRef<number | null>(null);
  const tabsRef = useRef<ResenderTab[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
    tabsRef.current = tabs;
  }, [activeTab, tabs]);

  const handleResenderRequest = useCallback((data: any) => {
    // Clear loading state whenever we receive a response
    setLoadingTab(null);
    
    // Check if we received an error
    if (data && data.error) {
      console.error("Error fetching request:", data.error);
      setError(data.error);
      return;
    }
    
    // Check if we received valid request data
    if (!data || typeof data.id === 'undefined') {
      console.error("Received invalid request data:", data);
      return;
    }
    
    console.log("Received request data:", data);

    // Use refs instead of state directly
    const currentActiveTab = activeTabRef.current;
    const currentTabs = tabsRef.current;

    // Find the current tab
    const currentTab = currentTabs.find(t => t.id === currentActiveTab);
    if (!currentTab) {
      console.error("No active tab found");
      return;
    }

    // Create the request data object
    const currentRequestData = {
      id: Number(data.id),
      url: data.url || "",
      method: data.method || "GET",
      requestHeaders: data.requestHeaders || "{}",
      requestBody: data.requestBody || "",
      responseHeaders: data.responseHeaders || "{}",
      responseBody: data.responseBody || "",
      httpVersion: data.httpVersion || "HTTP/1.1",
      status: data.status || "",
      error: data.error
    };

    // Update the URL first
    try {
      if (data.url) {
        const urlObj = new URL(data.url);
        setUrl(urlObj.origin);
      }
    } catch (err) {
      console.error("Error parsing URL:", data.url, err);
      setUrl(data.url || "");
    }
    
    // Update the current response
    setCurrentResponse(currentRequestData);
    
    // Format and set the raw request
    const formattedRequest = formatRequest(currentRequestData);
    setRawRequest(formattedRequest);

    // Update the tab's state
    setTabs(prevTabs => 
      prevTabs.map(tab => {
        if (tab.id === currentActiveTab) {
          return {
            ...tab,
            currentRequest: currentRequestData
          };
        }
        return tab;
      })
    );
  }, [formatRequest]); // Only depend on formatRequest

  useEffect(() => {
    const handleResenderTabs = (data: ResenderTab[]) => {
      const updatedTabs = data.map((tab: ResenderTab) => {
        // Ensure requestIds is always an array
        const requestIds = Array.isArray(tab.requestIds) ? tab.requestIds : []
        
        // Find existing tab to preserve state
        const existingTab = tabs.find(t => t.id === tab.id)
        
        // If no requestIds, return tab with currentIndex -1
        if (requestIds.length === 0) {
          return {
            ...tab,
            requestIds: [],
            currentIndex: -1,
            currentRequest: undefined
          }
        }

        // Keep the original order of requestIds as they come from the backend
        const updatedRequestIds = [...requestIds]
        
        // Calculate the current index
        let currentIndex: number
        if (existingTab?.currentRequest) {
          // If tab has been visited before, keep its current index
          currentIndex = existingTab.currentIndex
        } else {
          // For new or unvisited tabs, always start with the last request
          currentIndex = updatedRequestIds.length - 1
        }

        return {
          ...tab,
          requestIds: updatedRequestIds,
          currentIndex,
          currentRequest: existingTab?.currentRequest
        }
      })

      // Sort tabs by ID
      updatedTabs.sort((a, b) => a.id - b.id)
      
      setTabs(updatedTabs)
      
      // If we have tabs but no active tab, set up the first tab
      if (updatedTabs.length > 0 && activeTab === null) {
        const firstTab = updatedTabs[0]
        setActiveTab(firstTab.id)
        
        if (firstTab.requestIds && firstTab.requestIds.length > 0) {
          // Always start with the last request for new tabs
          const lastIndex = firstTab.requestIds.length - 1
          const requestId = firstTab.requestIds[lastIndex]
          
          // Clear any existing state
          setCurrentResponse(null)
          setRawRequest("")
          setUrl("")
          setError(null)
          setRedirectInfo(null)
          
          // Update the tab's index
          setTabs(prevTabs => prevTabs.map(t => 
            t.id === firstTab.id ? { 
              ...t, 
              currentIndex: lastIndex,
              currentRequest: undefined
            } : t
          ))
          
          // Set loading state for this tab to indicate content is being loaded
          setLoadingTab(firstTab.id)
          
          // Fetch the request data
          console.log(`Initial load: fetching request ${requestId} for tab ${firstTab.id}`);
          EventsEmit("frontend:getResenderRequest", requestId)
        }
      } else if (updatedTabs.length > 0 && activeTab !== null) {
        // If we already have an active tab but its content isn't loaded yet
        const currentTab = updatedTabs.find(t => t.id === activeTab)
        if (currentTab && (!currentTab.currentRequest || !currentResponse) && currentTab.requestIds?.length > 0) {
          const requestIndex = currentTab.currentIndex >= 0 ? currentTab.currentIndex : currentTab.requestIds.length - 1;
          const requestId = currentTab.requestIds[requestIndex]
          
          // Set loading state for this tab
          setLoadingTab(activeTab)
          
          // Update the tab's index for consistency
          if (currentTab.currentIndex !== requestIndex) {
            setTabs(prevTabs => prevTabs.map(t => 
              t.id === activeTab ? { ...t, currentIndex: requestIndex } : t
            ));
          }
          
          // Fetch the request data
          console.log(`Revisit load: fetching request ${requestId} for tab ${activeTab}`);
          EventsEmit("frontend:getResenderRequest", requestId)
        }
      }
    }

    const handleNewTabCreated = (data: { tabId: number; requestId: number }) => {
      console.log("New tab created:", data)
      
      // Clear loading state
      setIsLoading(false)
      
      // Update tabs state to include the new tab immediately
      setTabs(prevTabs => {
        const newTab = {
          id: data.tabId,
          name: `Tab ${data.tabId}`,
          requestIds: data.requestId ? [data.requestId] : [],
          currentIndex: data.requestId ? 0 : -1,
          currentRequest: undefined
        };
        return [...prevTabs, newTab];
      });
      
      // Set the new tab as active and fetch its request data
      setActiveTab(data.tabId);
      if (data.requestId) {
        EventsEmit("frontend:getResenderRequest", data.requestId);
      }
    }

    const handleResenderResponse = (data: {
      httpVersion: string;
      tabId: number
      requestId: number
      responseHeaders: string | Record<string, string>
      responseBody: string
      status: string
      isRedirect: boolean
      redirectURL?: string
      error?: string
    }) => {
      console.log("Received response for tab:", data.tabId, "requestId:", data.requestId)
      
      // Validate required data
      if (typeof data.tabId === 'undefined') {
        console.error("Invalid response: missing tabId")
        return
      }

      // Find the current tab using the ref for latest state
      const currentTab = tabsRef.current.find(t => t.id === data.tabId)
      if (!currentTab) {
        console.error("Invalid response: tab not found", data.tabId, "Current tabs:", tabsRef.current)
        return
      }

      // Use the current request's ID if requestId is undefined
      const requestId = typeof data.requestId !== 'undefined' ? 
        data.requestId : 
        currentTab.currentRequest?.id

      if (typeof requestId === 'undefined') {
        console.error("Invalid response: could not determine requestId")
        return
      }

      if (data.tabId === activeTabRef.current) {
        setIsLoading(false)
        setError(data.error || null)
      }
      
      setPendingRequests(prev => ({
        ...prev,
        [data.tabId]: false
      }))
      
      setTabs((prevTabs) => {
        const updatedTabs = prevTabs.map((tab) => {
          if (tab.id === data.tabId) {
            // Get existing requestIds array
            let updatedRequestIds = [...tab.requestIds]
            
            // If this is a new request, add it to the array
            if (!updatedRequestIds.includes(requestId)) {
              updatedRequestIds.push(requestId)
            }
            
            // Calculate the new index (always point to the current request)
            const newIndex = updatedRequestIds.indexOf(requestId)
            
            // Use the existing request as base, with default values for required fields
            const baseRequest: Request = {
              id: requestId,
              url: "",
              method: "GET",
              httpVersion: "HTTP/1.1",
              requestHeaders: "{}",
              requestBody: "",
              responseHeaders: "{}",
              responseBody: "",
              status: "",
              ...(tab.currentRequest || {})  // Spread existing request data if available
            }
            
            const updatedRequest: Request = {
              id: baseRequest.id,
              url: baseRequest.url,
              method: baseRequest.method,
              httpVersion: baseRequest.httpVersion,
              requestHeaders: baseRequest.requestHeaders,
              requestBody: baseRequest.requestBody,
              responseHeaders: typeof data.responseHeaders === 'string' ? data.responseHeaders : JSON.stringify(data.responseHeaders),
              responseBody: data.responseBody || "",
              status: data.status || "",
              error: data.error
            }

            // Only update the current response if this is the active tab
            if (tab.id === activeTabRef.current) {
              setCurrentResponse(updatedRequest)
            }

            return {
              ...tab,
              requestIds: updatedRequestIds,
              currentIndex: newIndex,
              currentRequest: updatedRequest,
            }
          }
          return tab
        })

        if (data.isRedirect && data.redirectURL && data.tabId === activeTabRef.current) {
          setRedirectInfo({ status: Number.parseInt(data.status), location: data.redirectURL, httpVersion: data.httpVersion || "HTTP/1.1" })
        } else if (activeTabRef.current === data.tabId) {
          setRedirectInfo(null)
        }

        return updatedTabs
      })
    }

    const handleRequestTimeout = (data: { tabId: number }) => {
      if (data.tabId === activeTabRef.current) {
        setIsLoading(false)
        setError(null)
      }
      
      setPendingRequests(prev => ({
        ...prev,
        [data.tabId]: false
      }))
      
      // Update the tab's currentRequest with the timeout error
      setTabs(prevTabs => 
        prevTabs.map(tab => {
          if (tab.id === data.tabId && tab.currentRequest) {
            return {
              ...tab,
              currentRequest: {
                ...tab.currentRequest,
                error: "Request timed out after 30 seconds. The server took too long to respond."
              }
            };
          }
          return tab;
        })
      );
    }

    EventsOn("backend:resenderTabs", handleResenderTabs)
    EventsOn("backend:resenderRequest", handleResenderRequest)
    EventsOn("backend:resenderResponse", handleResenderResponse)
    EventsOn("backend:requestTimeout", handleRequestTimeout)
    EventsOn("backend:newTabCreated", handleNewTabCreated)
    EventsEmit("frontend:getResenderTabs")

    return () => {
      EventsOff("backend:resenderTabs")
      EventsOff("backend:resenderRequest")
      EventsOff("backend:resenderResponse")
      EventsOff("backend:requestTimeout")
      EventsOff("backend:newTabCreated")
      // Clear the fetched requests set when unmounting
      fetchedRequestsRef.current.clear()
    }
  }, [handleResenderRequest]) // Keep handleResenderRequest in deps

  // Clear fetched requests when switching tabs
  useEffect(() => {
    fetchedRequestsRef.current.clear()
  }, [activeTab])

  const sendRequest = (tabId: number, request: Request) => {
    console.log("Sending request for tab:", tabId, request)
    
    // Validate request data
    if (!request || typeof request.id === 'undefined') {
      console.error("Invalid request data:", request)
      setError("Invalid request data")
      return
    }
    
    // Clear any previous errors
    setTabs(prevTabs => 
      prevTabs.map(tab => {
        if (tab.id === tabId) {
          // Keep the existing request but clear error
          const updatedRequest = {
            ...request,
            error: undefined,
            responseHeaders: "{}",
            responseBody: "",
            status: "",
          };
          
          return {
            ...tab,
            currentRequest: updatedRequest
          };
        }
        return tab;
      })
    );
    
    if (tabId === activeTab) {
      setIsLoading(true)
      setError(null)
    }
    
    setPendingRequests(prev => ({
      ...prev,
      [tabId]: true
    }))
    
    // Make sure we have valid headers
    let headers: Record<string, string> = {}
    try {
      headers = JSON.parse(request.requestHeaders || "{}")
    } catch (err) {
      console.error("Error parsing request headers:", err)
      // Use empty headers if parsing fails
      headers = {}
    }
    
    // Only set Host header if it's not already present
    try {
      const urlObj = new URL(request.url || "")
      if (!headers['Host'] && !headers['host']) {
        headers = { ...headers, Host: urlObj.host }
      }
    } catch (err) {
      console.error("Error setting Host header:", err)
    }
    
    // Send the request to the backend with the current request ID
    console.log("DEBUG: Sending request with ID:", request.id)
    EventsEmit("frontend:sendResenderRequest", {
      tabId,
      requestDetails: {
        url: request.url || "",
        method: request.method || "GET",
        headers: headers,
        body: request.requestBody || "",
        protocolVersion: request.httpVersion || "HTTP/1.1",
      },
    })
  }

  const cancelRequest = (tabId: number) => {
    console.log("Cancelling request for tab:", tabId)
    
    // Update the tab's currentRequest with a cancellation message
    setTabs(prevTabs => 
      prevTabs.map(tab => {
        if (tab.id === tabId && tab.currentRequest) {
          const updatedRequest: Request = {
            id: tab.currentRequest.id,
            url: tab.currentRequest.url || "",
            method: tab.currentRequest.method || "GET",
            httpVersion: tab.currentRequest.httpVersion || "HTTP/1.1",
            requestHeaders: tab.currentRequest.requestHeaders || "{}",
            requestBody: tab.currentRequest.requestBody || "",
            responseHeaders: tab.currentRequest.responseHeaders || "{}",
            responseBody: tab.currentRequest.responseBody || "",
            status: tab.currentRequest.status || "",
            error: "Request canceled by user"
          };
          
          return {
            ...tab,
            currentRequest: updatedRequest
          };
        }
        return tab;
      })
    );
    
    // Update loading state for the tab
    if (tabId === activeTab) {
      setIsLoading(false)
      setError(null)
    }
    
    // Update pending requests state
    setPendingRequests(prev => ({
      ...prev,
      [tabId]: false
    }))
    
    // Send cancel request to backend
    EventsEmit("frontend:cancelResenderRequest", {
      tabId,
    })
  }

  const addNewTab = () => {
    // Clear current state before creating new tab
    setCurrentResponse(null)
    setRawRequest("")
    setUrl("")
    setError(null)
    setRedirectInfo(null)
    
    // Create the new tab
    EventsEmit("frontend:createNewResenderTab", {})
    
    // Set loading state while we wait for the backend response
    setIsLoading(true)
    
    // Set a timeout to handle potential backend failures
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
      setError("Failed to create new tab. Please try again.")
    }, 5000)
    
    // Clear timeout when component unmounts
    return () => clearTimeout(timeoutId)
  }

  const deleteTab = (tabId: number) => {
    if (tabs.length <= 1) {
      return;
    }

    EventsEmit("frontend:deleteResenderTab", tabId)
    setTabs((prevTabs) => {
      const tabIndex = prevTabs.findIndex(tab => tab.id === tabId);
      const newTabs = prevTabs.filter((tab) => tab.id !== tabId);
      
      if (activeTab === tabId) {
        const newActiveIndex = Math.max(0, tabIndex - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTab(newActiveTab.id);
        
        if (newActiveTab.requestIds && newActiveTab.requestIds.length > 0) {
          EventsEmit("frontend:getResenderRequest", newActiveTab.requestIds[newActiveTab.currentIndex]);
        }
      }
      
      return newTabs;
    });
  }

  const updateTabName = (tabId: number, newName: string) => {
    EventsEmit("frontend:updateResenderTabName", { tabId, newName })
    setTabs((prevTabs) =>
      prevTabs.map((tab) => (tab.id === tabId ? { ...tab, name: newName } : tab))
    )
  }

  const followRedirect = () => {
    if (redirectInfo && activeTab !== null) {
      const currentTab = tabs.find((tab) => tab.id === activeTab)
      if (currentTab && currentTab.currentRequest) {
        const redirectUrl = new URL(redirectInfo.location)
        setUrl(redirectUrl.origin)
        setRedirectInfo(null)
        
        const redirectMethod = redirectInfo.status === 301 || redirectInfo.status === 302 ? "GET" : currentTab.currentRequest.method

        const redirectHeaders = {
          "Host": redirectUrl.host,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Connection": "keep-alive"
        }

        const redirectRequest: Request = {
          id: Date.now(),
          url: redirectInfo.location || "",
          method: redirectMethod || "GET",
          httpVersion: redirectInfo.httpVersion || "HTTP/1.1",
          requestHeaders: JSON.stringify(redirectHeaders),
          requestBody: "",
          responseHeaders: "{}",
          responseBody: "",
          status: "",
        }

        const formattedRedirectRequest = formatRequest(redirectRequest)
        setRawRequest(formattedRedirectRequest)

        EventsEmit("frontend:sendResenderRequest", {
          tabId: activeTab,
          requestDetails: {
            url: redirectInfo.location,
            method: redirectMethod,
            headers: redirectHeaders,
            body: "",
            httpVersion: redirectInfo.httpVersion || "HTTP/1.1",
          },
        })
      }
    }
  }

  const handlePrevRequest = useCallback(() => {
    if (activeTab === null) return;

    const tab = tabs.find((t) => t.id === activeTab);
    if (!tab || !tab.requestIds?.length || tab.currentIndex <= 0) return;

    // Calculate the new index
    const newIndex = Math.max(0, tab.currentIndex - 1);
    const requestId = tab.requestIds[newIndex];

    // Clear only error and redirect info
    setError(null);
    setRedirectInfo(null);

    // Update the tab's index first
    setTabs(prevTabs => prevTabs.map(t => {
      if (t.id === activeTab) {
        // Keep current request data until new data is loaded
        return { 
          ...t, 
          currentIndex: newIndex,
        };
      }
      return t;
    }));

    // Then fetch the request data
    console.log(`Loading previous request ${requestId} at index ${newIndex}`);
    EventsEmit("frontend:getResenderRequest", requestId);
  }, [activeTab, tabs]);

  const handleNextRequest = useCallback(() => {
    if (activeTab === null) return;

    const tab = tabs.find((t) => t.id === activeTab);
    if (!tab || !tab.requestIds?.length || tab.currentIndex >= tab.requestIds.length - 1) return;

    // Calculate the new index
    const newIndex = Math.min(tab.currentIndex + 1, tab.requestIds.length - 1);
    const requestId = tab.requestIds[newIndex];

    // Clear only error and redirect info
    setError(null);
    setRedirectInfo(null);

    // Update the tab's index first
    setTabs(prevTabs => prevTabs.map(t => {
      if (t.id === activeTab) {
        // Keep current request data until new data is loaded
        return { 
          ...t, 
          currentIndex: newIndex,
        };
      }
      return t;
    }));

    // Then fetch the request data
    console.log(`Loading next request ${requestId} at index ${newIndex}`);
    EventsEmit("frontend:getResenderRequest", requestId);
  }, [activeTab, tabs]);

  const handleTabClick = useCallback(
    (tabId: number) => {
      // Do nothing if clicking on already active tab, unless it has no loaded content
      if (tabId === activeTab && tabs.find(t => t.id === tabId)?.currentRequest) return;

      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) {
        console.error("Tab not found:", tabId);
        return;
      }

      // Set loading state for this tab
      setLoadingTab(tabId);
      
      // Clear only error and redirect info, preserve response data
      setRedirectInfo(null);
      setError(null);
      
      // Set active tab
      setActiveTab(tabId);
      
      // If the tab has a current request with URL information, use that
      if (tab.currentRequest && tab.currentRequest.url) {
        const request: Request = {
          id: tab.currentRequest.id,
          url: tab.currentRequest.url,
          method: tab.currentRequest.method || "GET",
          httpVersion: tab.currentRequest.httpVersion || "HTTP/1.1",
          requestHeaders: tab.currentRequest.requestHeaders || "{}",
          requestBody: tab.currentRequest.requestBody || "",
          responseHeaders: tab.currentRequest.responseHeaders || "{}",
          responseBody: tab.currentRequest.responseBody || "",
          status: tab.currentRequest.status || "",
        };
        setRawRequest(formatRequest(request));
        
        // Set only the origin part of the URL, not the full URL with path
        try {
          const urlObj = new URL(request.url);
          setUrl(urlObj.origin);
        } catch (err) {
          console.error("Error parsing URL:", request.url, err);
          setUrl(request.url);
        }
        
        setCurrentResponse(request);
        setLoadingTab(null);
      }
      // If the tab has requests but no current request, load the appropriate request
      else if (tab.requestIds?.length > 0) {
        // Get the requestId to load
        const requestIndex = tab.currentIndex >= 0 ? tab.currentIndex : tab.requestIds.length - 1;
        const requestId = tab.requestIds[requestIndex];
        
        console.log(`Loading request ${requestId} at index ${requestIndex} for tab ${tabId}`);
        
        // Update the tab's index to ensure consistency
        setTabs(prevTabs => prevTabs.map(t => 
          t.id === tabId ? { ...t, currentIndex: requestIndex } : t
        ));
        
        // Fetch the request data
        EventsEmit("frontend:getResenderRequest", requestId);
      } else {
        // If no requests, clear loading state and response
        setCurrentResponse(null);
        setRawRequest("");
        setUrl("");
        setLoadingTab(null);
      }
    },
    [activeTab, tabs, formatRequest]
  );

  const value = {
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
    setIsLoading,
    setError,
    handlePrevRequest,
    handleNextRequest,
    handleTabClick,
    setCurrentResponse,
  }

  return <ResenderContext.Provider value={value}>{children}</ResenderContext.Provider>
} 