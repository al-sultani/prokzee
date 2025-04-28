import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { EventsOn, EventsEmit, EventsOff } from "../../wailsjs/runtime/runtime";

interface Request {
  id: number;
  requestID: string;
  method: string;
  domain: string;
  port: string;
  httpVersion: string;
  path: string;
  query: string;
  status: string;
  length: number;
  mimeType: string;
  timestamp: string;
}

interface RequestDetails {
  method: string;
  url: string;
  requestHeaders: string;
  requestBody: string;
  domain: string;
  port: string;
  httpVersion: string;
  path: string;
  query: string;
  responseHeaders: string;
  responseBody: string;
  status: string;
}

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface SortConfig {
  key: string;
  direction: "ascending" | "descending";
}

interface RequestDetailsContextType {
  requests: Request[];
  selectedRequest: RequestDetails | null;
  editedRequest: string;
  currentPage: number;
  itemsPerPage: number;
  sortConfig: SortConfig;
  searchQuery: string;
  totalItems: number;
  totalPages: number;
  isSearching: boolean;
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (items: number) => void;
  setSortConfig: (config: SortConfig) => void;
  setSearchQuery: (query: string) => void;
  fetchRequestDetails: (id: number) => void;
  handleRequestChange: (newRequest: string) => void;
  handleSort: (key: string) => void;
  fetchAllRequests: () => void;
}

const RequestDetailsContext = createContext<RequestDetailsContextType | undefined>(undefined);

export const RequestDetailsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [editedRequest, setEditedRequest] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(50);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "id",
    direction: "descending",
  });
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [totalItems, setTotalItems] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestIdRef = useRef<number>(0);
  const lastSearchQueryRef = useRef<string>("");

  const formatHeaders = (headers: string): string => {
    try {
      const headerObj = JSON.parse(headers);
      return Object.entries(headerObj)
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n");
    } catch (e) {
      return headers;
    }
  };

  const formatRequest = useCallback((data: RequestDetails): string => {
    const formattedHeaders = formatHeaders(data.requestHeaders);
    const pathWithQuery = data.path + (data.query ? `?${data.query}` : '');
    const requestBody = data.requestBody ? data.requestBody.trim() : '';
    
    // Parse existing headers to check for Host
    let hostHeader = data.domain;
    try {
      const headerObj = JSON.parse(data.requestHeaders);
      // Check for Host header in a case-insensitive way
      const hostHeaderKey = Object.keys(headerObj).find(key => key.toLowerCase() === 'host');
      if (hostHeaderKey) {
        hostHeader = headerObj[hostHeaderKey];
        delete headerObj[hostHeaderKey]; // Remove host from other headers
        // Reformat remaining headers
        const otherHeaders = Object.entries(headerObj)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');
        let formattedRequest = `${data.method} ${pathWithQuery} HTTP/1.1\nHost: ${hostHeader}`;
        if (otherHeaders) {
          formattedRequest += `\n${otherHeaders}`;
        }
        if (requestBody) {
          formattedRequest += `\n\n${requestBody}`;
        }
        return formattedRequest;
      }
    } catch (e) {
      // If headers parsing fails, proceed with default formatting
    }
    
    let formattedRequest = `${data.method} ${pathWithQuery} HTTP/1.1\nHost: ${hostHeader}`;
    if (formattedHeaders) {
      formattedRequest += `\n${formattedHeaders}`;
    }
    if (requestBody) {
      formattedRequest += `\n\n${requestBody}`;
    }
    
    return formattedRequest;
  }, []);

  const fetchRequestDetails = useCallback((id: number) => {
    EventsEmit("frontend:getRequestByID", id.toString());
  }, []);

  const handleRequestChange = useCallback((newRequest: string) => {
    setEditedRequest(newRequest);
  }, []);

  const handleSort = (key: string) => {
    setSortConfig((prevConfig) => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === "ascending" ? "descending" : "ascending",
    }));
  };

  const fetchAllRequests = useCallback(() => {
    // If this is a search query and it's identical to the last search, don't re-request
    if (searchQuery && searchQuery === lastSearchQueryRef.current) {
      setIsSearching(false);
      return;
    }
    
    // Update last search query reference
    if (searchQuery) {
      lastSearchQueryRef.current = searchQuery;
    } else {
      lastSearchQueryRef.current = "";
    }
    
    // console.log('Fetching all requests with params:', {
    //   page: currentPage,
    //   limit: itemsPerPage,
    //   sortKey: sortConfig.key,
    //   sortDirection: sortConfig.direction,
    //   searchQuery: searchQuery
    // });
    EventsEmit("frontend:getAllRequests", {
      page: currentPage,
      limit: itemsPerPage,
      sortKey: sortConfig.key,
      sortDirection: sortConfig.direction,
      searchQuery: searchQuery
    });
  }, [currentPage, itemsPerPage, sortConfig, searchQuery]);

  // Handle search with debounce
  const handleSearchChange = useCallback((query: string) => {
    // Set searching state
    setIsSearching(true);
    setSearchQuery(query);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // If query is empty, immediately set isSearching to false and reset to first page
    if (!query.trim()) {
      setIsSearching(false);
      setCurrentPage(1);
      lastSearchQueryRef.current = ""; // Reset last search query ref
      // Trigger a fetch with empty query
      setTimeout(() => {
        fetchAllRequests();
      }, 0);
      return;
    }
    
    // Use a longer timeout for search to avoid too many queries during typing
    searchTimeoutRef.current = setTimeout(() => {
      // We keep isSearching true until we get results back
      // The fetchAllRequests will trigger the backend request
      // and handleAllRequests will set isSearching to false when results return
      setCurrentPage(1); // Reset to first page when searching
      fetchAllRequests(); // Trigger the search
    }, 750); // Increased from 500ms to 750ms to reduce unnecessary requests
  }, [fetchAllRequests]);

  // Set up auto-refresh interval
  useEffect(() => {
    // Don't set up auto-refresh if there is an active search query
    if (searchQuery) {
      return;
    }
    
    const refreshInterval = setInterval(() => {
      //console.log('Auto-refresh triggered, last request ID:', lastRequestIdRef.current);
      fetchAllRequests();
    }, 2000); // Refresh every 2 seconds
    
    return () => {
      clearInterval(refreshInterval);
    };
  }, [fetchAllRequests, searchQuery]);

  React.useEffect(() => {
    const handleAllRequests = (data: { 
      error?: string; 
      requests?: Request[]; 
      pagination?: PaginationData 
    }) => {
      // console.log('=== Request History Debug ===');
      // console.log('1. Basic Response:', {
      //   error: data.error,
      //   requestCount: data.requests?.length || 0,
      //   pagination: data.pagination,
      //   lastKnownRequestId: lastRequestIdRef.current
      // });

      if (data.error) {
        console.error('Error fetching requests:', data.error);
        setIsSearching(false);
      } else if (data.requests) {
        // Check if we have new requests
        const newRequests = data.requests;
        
        // Only update the last known request ID for non-search results to avoid
        // overwriting the main data when performing searches
        if (!searchQuery) {
          const maxRequestId = Math.max(...newRequests.map(r => r.id), 0);
          
          // console.log('2. Request Analysis:', {
          //   newRequestsCount: newRequests.length,
          //   maxRequestId: maxRequestId,
          //   lastKnownRequestId: lastRequestIdRef.current,
          //   hasNewRequests: maxRequestId > lastRequestIdRef.current
          // });

          // Update our last known request ID
          if (maxRequestId > lastRequestIdRef.current) {
            console.log('New requests detected, updating state');
            lastRequestIdRef.current = maxRequestId;
          }
        }

        // Update the requests state
        setRequests(newRequests);
        
        if (data.pagination) {
          // console.log('3. Pagination Update:', {
          //   total: data.pagination.total,
          //   currentPage: data.pagination.page,
          //   totalPages: data.pagination.totalPages
          // });
          setTotalItems(data.pagination.total);
          setTotalPages(data.pagination.totalPages);
        }
        
        // Always set isSearching to false when we receive a response, even if there are no results
        setIsSearching(false);
      } else {
        // If we get here, we didn't get an error or any requests, so we should stop the loading state
        setIsSearching(false);
      }
    };

    const handleRequestDetails = (data: { error?: string } & RequestDetails) => {
      console.log('Received request details:', data);
      if (data.error) {
        console.error('Error fetching request details:', data.error);
      } else {
        setSelectedRequest(data);
        const formattedRequest = formatRequest(data);
        setEditedRequest(formattedRequest);
      }
    };

    const handleClearState = () => {
      console.log('Clearing request history state');
      setRequests([]);
      setSelectedRequest(null);
      setEditedRequest("");
      setTotalItems(0);
      setTotalPages(1);
      setCurrentPage(1);
      setIsSearching(false);
    };

    EventsOn("backend:allRequests", handleAllRequests);
    EventsOn("backend:requestDetails", handleRequestDetails);
    EventsOn("backend:clearState", handleClearState);

    const fetchRequests = () => {
      EventsEmit("frontend:getAllRequests", {
        page: currentPage,
        limit: itemsPerPage,
        sortKey: sortConfig.key,
        sortDirection: sortConfig.direction,
        searchQuery: searchQuery
      });
    };

    fetchRequests();

    return () => {
      EventsOff("backend:allRequests");
      EventsOff("backend:requestDetails");
      EventsOff("backend:clearState");
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [currentPage, itemsPerPage, sortConfig, searchQuery, formatRequest]);

  const value = {
    requests,
    selectedRequest,
    editedRequest,
    currentPage,
    itemsPerPage,
    sortConfig,
    searchQuery,
    totalItems,
    totalPages,
    isSearching,
    setCurrentPage,
    setItemsPerPage,
    setSortConfig,
    setSearchQuery: handleSearchChange,
    fetchRequestDetails,
    handleRequestChange,
    handleSort,
    fetchAllRequests,
  };

  return (
    <RequestDetailsContext.Provider value={value}>
      {children}
    </RequestDetailsContext.Provider>
  );
};

export const useRequestDetails = () => {
  const context = useContext(RequestDetailsContext);
  if (context === undefined) {
    throw new Error('useRequestDetails must be used within a RequestDetailsProvider');
  }
  return context;
}; 