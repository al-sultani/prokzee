import React, { createContext, useContext, useState, useCallback } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface SiteMapNode {
  url: string;
  children?: SiteMapNode[];
}

interface Request {
  id: number;
  requestID: string;
  method: string;
  url: string;
  domain: string;
  path: string;
  query: string;
  status: string;
  timestamp: string;
}

interface RequestDetails {
  method: string;
  url: string;
  domain: string;
  path: string;
  query: string;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;
  status: string;
  httpVersion: string;
}

interface SiteMapContextType {
  domains: string[];
  selectedDomain: string | null;
  Sitemap: SiteMapNode | null;
  expandedKeys: string[];
  searchValue: string;
  loading: boolean;
  requestsLoading: boolean;
  requests: Request[];
  selectedRequest: RequestDetails | null;
  selectedNodeURL: string | null;
  contentView: "Sitemap" | "requests" | "requestDetails";
  currentRequest: string;
  currentResponse: {
    headers: string;
    body: string;
    status: string;
  };
  setDomains: (domains: string[]) => void;
  setSelectedDomain: (domain: string | null) => void;
  setSiteMap: (Sitemap: SiteMapNode | null) => void;
  setExpandedKeys: (keys: string[]) => void;
  setSearchValue: (value: string) => void;
  setContentView: (view: "Sitemap" | "requests" | "requestDetails") => void;
  setSelectedNodeURL: (url: string | null) => void;
  setRequestsLoading: (loading: boolean) => void;
  setCurrentRequest: (request: string) => void;
  fetchRequestDetails: (id: number) => void;
  onNodeClick: (key: string, node: SiteMapNode) => void;
  getExpandedKeys: (data: SiteMapNode, value: string) => string[];
}

const SiteMapContext = createContext<SiteMapContextType | undefined>(undefined);

export const SiteMapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [Sitemap, setSiteMap] = useState<SiteMapNode | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [requestsLoading, setRequestsLoading] = useState<boolean>(false);
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestDetails | null>(null);
  const [selectedNodeURL, setSelectedNodeURL] = useState<string | null>(null);
  const [contentView, setContentView] = useState<"Sitemap" | "requests" | "requestDetails">("Sitemap");
  const [currentRequest, setCurrentRequest] = useState<string>("");
  const [currentResponse, setCurrentResponse] = useState<{
    headers: string;
    body: string;
    status: string;
  }>({ headers: "", body: "", status: "" });

  const getExpandedKeys = useCallback((data: SiteMapNode, value: string): string[] => {
    const expandedKeys: string[] = [];
    const getKeys = (node: SiteMapNode, parentKey = "", index = 0) => {
      const currentKey = parentKey ? `${parentKey}/${node.url}-${index}` : `${node.url}-${index}`;
      if (node.url.toLowerCase().includes(value.toLowerCase())) {
        expandedKeys.push(currentKey);
      }
      if (node.children) {
        node.children.forEach((child, childIndex) => getKeys(child, currentKey, childIndex));
      }
    };
    getKeys(data);
    return expandedKeys;
  }, []);

  const onNodeClick = useCallback((key: string, node: SiteMapNode) => {
    if (node.children && node.children.length > 0) {
      setExpandedKeys((prevKeys) =>
        prevKeys.includes(key) ? prevKeys.filter((k) => k !== key) : [...prevKeys, key]
      );
    } else {
      if (node.url === selectedDomain || node.url === "") {
        setSelectedNodeURL("/");
        setContentView("requests");
        setRequestsLoading(true);
        EventsEmit("frontend:getRequestsByEndpoint", selectedDomain, "/");
        return;
      }

      const parts = key.split('/').filter(Boolean);
      if (parts[0] === selectedDomain) {
        parts.shift();
      }
      const path = '/' + parts.join('/');
      
      setSelectedNodeURL(path);
      setContentView("requests");
      setRequestsLoading(true);
      EventsEmit("frontend:getRequestsByEndpoint", selectedDomain, path);
    }
  }, [selectedDomain]);

  const fetchRequestDetails = useCallback((id: number) => {
    EventsEmit("frontend:getRequestByID", id.toString());
  }, []);

  React.useEffect(() => {
    EventsEmit("frontend:getDomains");
    
    const handleDomains = (data: { error?: string; domains?: string[] }) => {
      if (data.error) {
        console.error(data.error);
      } else if (data.domains) {
        setDomains(data.domains.sort());
      }
    };

    const handleProjectSwitch = (data: { success: boolean; projectName?: string; error?: string }) => {
      if (data.success) {
        console.log('Project switched, clearing sitemap state');
        setDomains([]);
        setSelectedDomain(null);
        setSiteMap(null);
        setExpandedKeys([]);
        setSearchValue("");
        setLoading(false);
        setRequestsLoading(false);
        setRequests([]);
        setSelectedRequest(null);
        setSelectedNodeURL(null);
        setContentView("Sitemap");
        setCurrentRequest("");
        setCurrentResponse({ headers: "", body: "", status: "" });
        // Fetch new domains for the new project
        EventsEmit("frontend:getDomains");
      }
    };

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      EventsEmit("frontend:getDomains");
    }, 2000);

    EventsOn("backend:domains", handleDomains);
    EventsOn("backend:switchProject", handleProjectSwitch);
    
    return () => {
      EventsOff("backend:domains");
      EventsOff("backend:switchProject");
      clearInterval(intervalId);
    };
  }, []);

  React.useEffect(() => {
    if (selectedDomain) {
      console.log('Selected domain changed:', selectedDomain);
      setLoading(true);
      setSiteMap(null);
      setSelectedNodeURL(null);
      setRequests([]);
      setSelectedRequest(null);
      setContentView("Sitemap");
      EventsEmit("frontend:getSiteMap", selectedDomain);
    }
  }, [selectedDomain]);

  React.useEffect(() => {
    const handleSiteMap = (data: { error?: string; Sitemap?: SiteMapNode }) => {
      console.log('Received sitemap data:', data);
      setLoading(false);
      if (data.error) {
        console.error('Sitemap error:', data.error);
      } else if (data.Sitemap) {
        console.log('Setting sitemap:', data.Sitemap);
        setSiteMap(data.Sitemap);
      } else {
        console.log('No sitemap data received');
      }
    };

    const handleRequests = (data: { error?: string; requests?: Request[] }) => {
      setRequestsLoading(false);
      if (data.error) {
        console.error(data.error);
      } else if (data.requests) {
        setRequests(data.requests);
      }
    };

    const handleRequestDetails = (data: { error?: string } & RequestDetails) => {
      if (data.error) {
        console.error(data.error);
      } else {
        setSelectedRequest(data);
        const requestFirstLine = `${data.method} ${data.path}${data.query ? '?' + data.query : ''} HTTP/1.1`;
        let requestHeaders = "";
        try {
          const headers = JSON.parse(data.requestHeaders);
          requestHeaders = Object.entries(headers)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
        } catch (e) {
          console.error("Failed to parse request headers:", e);
          requestHeaders = data.requestHeaders;
        }
        setCurrentRequest(`${requestFirstLine}\n${requestHeaders}\n\n${data.requestBody || ''}`);
        setCurrentResponse({
          headers: data.responseHeaders,
          body: data.responseBody,
          status: data.status
        });
        setContentView("requestDetails");
      }
    };

    const handleClearState = () => {
      console.log('Clearing sitemap state');
      setDomains([]);
      setSelectedDomain(null);
      setSiteMap(null);
      setExpandedKeys([]);
      setSearchValue("");
      setLoading(false);
      setRequestsLoading(false);
      setRequests([]);
      setSelectedRequest(null);
      setSelectedNodeURL(null);
      setContentView("Sitemap");
      setCurrentRequest("");
      setCurrentResponse({ headers: "", body: "", status: "" });
    };

    EventsOn("backend:Sitemap", handleSiteMap);
    EventsOn("backend:requestsByEndpoint", handleRequests);
    EventsOn("backend:requestDetails", handleRequestDetails);
    EventsOn("backend:clearState", handleClearState);

    return () => {
      EventsOff("backend:Sitemap");
      EventsOff("backend:requestsByEndpoint");
      EventsOff("backend:requestDetails");
      EventsOff("backend:clearState");
    };
  }, []);

  const value = {
    domains,
    selectedDomain,
    Sitemap,
    expandedKeys,
    searchValue,
    loading,
    requestsLoading,
    requests,
    selectedRequest,
    selectedNodeURL,
    contentView,
    currentRequest,
    currentResponse,
    setDomains,
    setSelectedDomain,
    setSiteMap,
    setExpandedKeys,
    setSearchValue,
    setContentView,
    setSelectedNodeURL,
    setRequestsLoading,
    setCurrentRequest,
    fetchRequestDetails,
    onNodeClick,
    getExpandedKeys,
  };

  return <SiteMapContext.Provider value={value}>{children}</SiteMapContext.Provider>;
};

export const useSiteMap = () => {
  const context = useContext(SiteMapContext);
  if (context === undefined) {
    throw new Error('useSiteMap must be used within a SiteMapProvider');
  }
  return context;
}; 