import React, { useState, useEffect, useCallback, useRef } from "react";
import { ApproveRequest } from "../../../wailsjs/go/main/App";
import { EventsEmit, EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime";
import { Brain, Zap, Repeat, Forward, Plus, MessageCircle, MousePointerClick } from 'lucide-react';
import { X, ToggleRight, ToggleLeft, FastForward} from 'lucide-react';
import { useRequestQueue } from "../../contexts/RequestQueueContext";
import { CustomButton } from "../../components/ui/custom-button";
import { HttpRequestEditor } from "../../components";
import { useIntercept } from "../../contexts/IntercpetContext";
import { useTheme } from '../../contexts/ThemeContext';
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";


interface RequestDetails {
  url: string;
  headers: { [key: string]: string };
  body: string;
  method?: string;
  protocolVersion?: string;
  status?: string;
}

interface ApprovalData {
  requestID: string;
  details: RequestDetails;
}

interface ProxyToolProps {
  // Remove the props that are now handled by context
}

interface FuzzerTab {
  targetUrl: string
  requestDetails: string
}

interface ChatContext {
  id: number;
  name: string;
}


const Intercept: React.FC<ProxyToolProps> = () => {
  const { requestQueue, addRequestToQueue, removeRequestFromQueue } = useRequestQueue();
  const { 
    selectedRequest, 
    setSelectedRequest, 
    rawRequest, 
    setRawRequest,
    interceptionOn,
    toggleInterception,
    context
  } = useIntercept();
  const { theme } = useTheme();
  const [chatContexts, setChatContexts] = useState<ChatContext[]>([]);
  const [tableHeight, setTableHeight] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Call fetchChatContexts and store its cleanup function
    const cleanup = fetchChatContexts();

    // We don't need to listen for new chat context creation here
    // This is already handled in LLMContext.tsx

    return () => {
      // Call the cleanup function from fetchChatContexts
      cleanup();
    };
  }, []);

  const fetchChatContexts = () => {
    EventsEmit("frontend:getChatContexts");
    
    // Register the event handler
    EventsOn("backend:chatContexts", handleChatContexts);
    
    // Return a cleanup function
    return () => {
      EventsOff("backend:chatContexts");
    };
  };
  
  const handleChatContexts = (contexts: ChatContext[]) => {
    setChatContexts(contexts || []);
  };

  const handleSendToLLMAnalyzer = (contextId: number | null) => {
    if (selectedRequest) {
      const formattedRequest = formatRequest(selectedRequest);
      
      if (contextId === null) {
        // Create new chat context
        EventsEmit("frontend:createChatContext", formattedRequest);
      } else {
        // Send to existing chat context
        sendToExistingChatContext(contextId, formattedRequest);
      }
    }
  };

  const sendToExistingChatContext = (contextId: number, requestString: string) => {
    EventsEmit("frontend:sendMessage", {
      chatContextId: contextId,
      messages: [{ role: "user", content: requestString }]
    });
    setIsDropdownOpen(false)
  };
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])
  const handleApproval = (approved: boolean, request: ApprovalData) => {
    if (request) {
      const updatedRequestDetails = parseFormattedRequest(rawRequest);
      console.log("Updated Request Details for Approval:", updatedRequestDetails);

      ApproveRequest({
        requestID: request.requestID,
        approved,
        url: updatedRequestDetails.url,
        headers: updatedRequestDetails.headers,
        body: updatedRequestDetails.body,
        method: updatedRequestDetails.method,
        protocolVersion: updatedRequestDetails.protocolVersion,
        context: context,
      });

      removeRequestFromQueue(request.requestID);
      setSelectedRequest(null);
      setRawRequest("");
    }
  };

  const sendToResender= (request: RequestDetails) => {
    const { url, headers, body, method } = request;
    EventsEmit("frontend:sendToResender", { url, headers, body, method });
  };

  const sendToFuzzer = (request: RequestDetails) => {
    if (!request) return;

    const { url, headers, body, method = "GET", protocolVersion = "HTTP/1.1" } = request;

    try {
      // Extract the path and host from the URL
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname + parsedUrl.search;
      const targetUrl = parsedUrl.origin;

      // Ensure headers are in the correct format
      const formattedHeaders: { [key: string]: string } = {};
      Object.entries(headers).forEach(([key, value]) => {
        formattedHeaders[key] = value;
      });

      // Default placeholder-based payload
      const defaultPayload = [
        {
          type: "list",
          list: ["admin", "password123", "test123", "qwerty"],
        },
      ];

      // Emit event to backend
      EventsEmit("frontend:sendToFuzzer", {
        targetUrl,
        path,
        method,
        protocolVersion,
        headers: formattedHeaders,
        body,
        payloads: defaultPayload,
      });

      console.log("Sent request to Fuzzer:", {
        targetUrl,
        path,
        method,
        protocolVersion,
        headers: formattedHeaders,
        body,
        payloads: defaultPayload,
      });
    } catch (error) {
      console.error("Error formatting request for Fuzzer:", error);
    }
  };




  const handleSelectRequest = (request: ApprovalData) => {
    setSelectedRequest(request);
    const formattedRequest = formatRequest(request);
    setRawRequest(formattedRequest);
  };

  const handleForwardAll = () => {
    requestQueue.forEach((request) => {
      ApproveRequest({
        requestID: request.requestID,
        approved: true,
        url: request.details.url,
        headers: request.details.headers,
        body: request.details.body,
        method: request.details.method,
        protocolVersion: request.details.protocolVersion,
        context: context,
      });
      removeRequestFromQueue(request.requestID);
    });

    setSelectedRequest(null);
    setRawRequest("");
  };

  const formatRequest = (requestDetails: ApprovalData): string => {
    const url = new URL(requestDetails.details.url);
    const method = requestDetails.details.method || "GET";
    const httpVersion = requestDetails.details.protocolVersion || "HTTP/1.1";

    const requestLine = `${method} ${url.pathname}${url.search} ${httpVersion}`;
    const hostHeader = `Host: ${url.host}`;

    const headerLines = Object.entries(requestDetails.details.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    return `${requestLine}\n${hostHeader}\n${headerLines}\n\n${requestDetails.details.body}`;
  };

  const parseFormattedRequest = (formatted: string): RequestDetails => {
    const lines = formatted.split("\n");
    const [method, path, httpVersion] = lines[0].split(" ");
    const url = new URL(path, selectedRequest?.details.url);
    const headers: { [key: string]: string } = {};
    let body = "";
    let isBody = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "") {
        isBody = true;
        continue;
      }
      if (isBody) {
        body += lines[i] + "\n";
      } else {
        const [key, ...valueParts] = lines[i].split(":");
        if (key && valueParts.length > 0) {
          const value = valueParts.join(":").trim();
          headers[key.trim()] = value;
        }
      }
    }

    return {
      url: url.toString(),
      headers,
      body: body.trim(),
      method: method.trim(),
      protocolVersion: httpVersion.trim(),
    };
  };

  const handleRawRequestChange = (newRequest: string) => {
    setRawRequest(newRequest);
    if (selectedRequest) {
      const updatedRequestDetails = parseFormattedRequest(newRequest);
      console.log("Updated Request Details:", updatedRequestDetails);
      EventsEmit("frontend:updateRequest", {
        requestID: selectedRequest.requestID,
        details: updatedRequestDetails,
      });
    }
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const newHeight = Math.max(100, Math.min(600, e.clientY));
        setTableHeight(newHeight);
      }
    },
    [isDragging]
  );

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Add effect to handle interception state changes
  useEffect(() => {
    console.log("Interception state changed:", interceptionOn);
    if (!interceptionOn && requestQueue.length > 0) {
      handleForwardAll();
    }
  }, [interceptionOn]);

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-primary text-gray-800 dark:text-white overflow-hidden">
      <div className="flex-1 p-6 flex flex-col">
        <div className="flex flex-nowrap gap-2 mb-6">
          {/* Interception Control Group */}
          <div className="flex-shrink-0 flex gap-1 p-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-dark-secondary shadow-sm">
            <div className="flex items-center px-1 mr-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-300 dark:border-gray-700">
              Interception
            </div>
            <CustomButton
              onClick={() => {
                console.log('Toggle button clicked');
                toggleInterception();
              }}
              icon={interceptionOn ? ToggleRight : ToggleLeft}
              label={interceptionOn ? "Interception is On" : "Interception is Off"}
              variant={interceptionOn ? "green" : "destructive"}
            />
            <CustomButton
              onClick={handleForwardAll}
              icon={FastForward}
              label="Forward All"
              disabled={requestQueue.length === 0}
              variant="secondary"
            />
          </div>

          {/* Request Action Group */}
          <div className="flex-shrink-0 flex gap-1 p-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-dark-secondary shadow-sm">
            <div className="flex items-center px-1 mr-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-300 dark:border-gray-700">
              Actions
            </div>
            <CustomButton
              onClick={() => selectedRequest && handleApproval(true, selectedRequest)}
              icon={Forward}
              label="Forward"
              disabled={!selectedRequest}
              variant="default"
            />
            <CustomButton
              onClick={() => selectedRequest && handleApproval(false, selectedRequest)}
              icon={X}
              label="Drop"
              disabled={!selectedRequest}
              variant="destructive"
            />
          </div>

          {/* Tools Group */}
          <div className="flex-shrink-0 flex gap-1 p-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-dark-secondary shadow-sm">
            <div className="flex items-center px-1 mr-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-300 dark:border-gray-700">
              Tools
            </div>
            <CustomButton
              onClick={() => selectedRequest && sendToResender(parseFormattedRequest(rawRequest))}
              icon={Repeat}
              label="Resender"
              disabled={!selectedRequest}
              variant="outline"
            />
            <CustomButton
              onClick={() => selectedRequest && sendToFuzzer(parseFormattedRequest(rawRequest))}
              icon={Zap}
              label="Fuzzer"
              disabled={!selectedRequest}
              variant="outline"
            />
            <div className="relative" ref={dropdownRef}>
              <CustomButton
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                icon={Brain}
                label="LLM Analyzer"
                disabled={!selectedRequest}
                variant="outline"
              />

              {isDropdownOpen && (
                <div className="absolute z-10 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-dark-secondary ring-1 ring-black ring-opacity-5">
                  <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                    <button
                      onClick={() => handleSendToLLMAnalyzer(null)}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-accent hover:text-gray-900 dark:hover:text-white w-full text-left"
                      role="menuitem"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Analysis
                    </button>

                    {(chatContexts && chatContexts.length > 0) ? (
                      chatContexts.map((context) => (
                        <button
                          key={context.id}
                          onClick={() => handleSendToLLMAnalyzer(context.id)}
                          className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-accent hover:text-gray-900 dark:hover:text-white w-full text-left"
                          role="menuitem"
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          {context.name}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 w-full text-left">
                        No chat contexts available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col min-h-0 mb-8">
          <PanelGroup direction="horizontal" className="flex-1">
            <Panel defaultSize={25} minSize={15}>
              <div className="h-full bg-white dark:bg-dark-secondary rounded-lg shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="h-full flex flex-col">
                  <div className="bg-gray-50 dark:bg-dark-accent sticky top-0 z-10">
                    <table className="w-full table-fixed">
                      <thead>
                        <tr>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">
                            Method
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[35%]">
                            Host
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[35%]">
                            Path
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[15%]">
                            Size
                          </th>
                        </tr>
                      </thead>
                    </table>
                  </div>
                  <div className="overflow-y-auto overflow-x-hidden flex-1 max-h-[calc(100vh-250px)]">
                    <table className="w-full table-fixed">
                      <tbody className="bg-white dark:bg-dark-secondary divide-y divide-gray-200 dark:divide-gray-700">
                        {requestQueue.length > 0 ? (
                          requestQueue.map((request) => {
                            const url = new URL(request.details.url);
                            const method = request.details.method || "GET";
                            const size = request.details.body ? request.details.body.length : 0;

                            return (
                              <tr
                                key={request.requestID}
                                onClick={() => handleSelectRequest(request)}
                                className={`cursor-pointer transition-colors duration-150 ${
                                  selectedRequest?.requestID === request.requestID
                                    ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                    : 'hover:bg-gray-50 dark:hover:bg-dark-accent'
                                }`}
                              >
                                <td className="px-2 py-2 text-left whitespace-nowrap text-xs font-medium text-gray-900 dark:text-white w-[15%]">{method}</td>
                                <td className="px-2 py-2 text-left whitespace-nowrap text-xs text-gray-600 dark:text-gray-300 truncate w-[35%]">
                                  {url.hostname}
                                </td>
                                <td className="px-2 py-2 text-left whitespace-nowrap text-xs text-gray-600 dark:text-gray-300 truncate w-[35%]">
                                  {url.pathname}
                                </td>
                                <td className="px-2 py-2 text-left whitespace-nowrap text-xs text-gray-600 dark:text-gray-300 w-[15%]">{size} B</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                              No requests in queue
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Panel>
            
            <PanelResizeHandle className="w-2 mx-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-150 cursor-col-resize flex items-center justify-center">
              <div className="w-1 h-10 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
            </PanelResizeHandle>
            
            <Panel defaultSize={75} minSize={40}>
              <div className="h-full bg-gray-100 dark:bg-dark-primary rounded-lg shadow-lg overflow-hidden">
                {selectedRequest ? (
                  <div className="border-2 rounded-lg shadow-md overflow-hidden h-full dark:border-gray-700">
                    <HttpRequestEditor key={selectedRequest.requestID} initialRequest={rawRequest} onChange={handleRawRequestChange} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-dark-secondary text-gray-400 dark:text-gray-500 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                    <MousePointerClick />
                    <p className="text-lg font-semibold">No Request Selected</p>
                    <p className="text-sm">Select a request from the list to view details</p>
                  </div>
                )}
              </div>
            </Panel>
          </PanelGroup>
        </div>
        
        <div className="h-8 flex-shrink-0"></div>
      </div>
    </div>
  );
};

export default Intercept;