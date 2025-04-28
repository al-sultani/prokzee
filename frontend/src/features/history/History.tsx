"use client"

import type React from "react"
import ResponseBodyViewer from "../../components/ResponseViewer"
import HttpRequestEditor from "../../components/HttpRequestEditor"
import { History, RefreshCw } from "lucide-react"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"
import { useRequestDetails } from "../../contexts/HistoryContext"
import { useState } from "react"

const RequestsHistory: React.FC = () => {
  const {
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
    setSearchQuery,
    fetchRequestDetails,
    handleRequestChange,
    handleSort,
    fetchAllRequests,
  } = useRequestDetails();

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAllRequests();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-dark-primary border border-slate-200 dark:border-gray-700 flex flex-col">
      <div className="w-full mx-auto p-4 sm:p-6 lg:p-8 h-full overflow-hidden">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <History className="h-8 w-8 text-indigo-600" />
              Request Details
            </h1>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full shadow-sm transition-colors duration-200 flex items-center gap-2"
              >
                {isRefreshing ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent"></div>
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </button>
              <div className="text-sm text-slate-500 dark:text-gray-400 bg-white dark:bg-dark-secondary px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-gray-700">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
            </div>
          </div>
        </header>

        <PanelGroup direction="vertical" className="flex-1">
          <Panel minSize={20}>
            <div className="bg-white dark:bg-dark-secondary p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 mb-4 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-slate-700 dark:text-white">HTTP Requests</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={isSearching ? "Searching..." : "Search requests..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-64 pl-10 pr-10 py-2 border ${
                        searchQuery ? 'border-indigo-300 dark:border-indigo-700' : 'border-slate-300 dark:border-gray-600'
                      } rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${isSearching ? 'pr-10' : ''}`}
                      autoComplete="off"
                      spellCheck="false"
                    />
                    {isSearching ? (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin h-4 w-4 border-2 border-indigo-500 rounded-full border-t-transparent"></div>
                      </div>
                    ) : searchQuery ? (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-gray-500 dark:hover:text-gray-300"
                        aria-label="Clear search"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : null}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5 text-slate-400 dark:text-gray-500 absolute left-3 top-1/2 transform -translate-y-1/2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <select
                    className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-sm text-slate-800 dark:text-white bg-white dark:bg-dark-accent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  >
                    <option value="5">5 per page</option>
                    <option value="10">10 per page</option>
                    <option value="25">25 per page</option>
                    <option value="50">50 per page</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <div className="h-full overflow-y-auto">
                  {isSearching ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-gray-400 py-10">
                      <div className="animate-spin h-12 w-12 mb-4 border-4 border-indigo-500 rounded-full border-t-transparent"></div>
                      <p className="text-lg font-medium">Searching...</p>
                      <p className="text-sm mt-1">Looking for matching requests</p>
                    </div>
                  ) : searchQuery && requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-gray-400 py-10">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-12 w-12 mb-4 text-slate-400 dark:text-gray-500" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5} 
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                        />
                      </svg>
                      <p className="text-lg font-medium">No results found</p>
                      <p className="text-sm mt-1">Try adjusting your search query</p>
                      <div className="mt-4 text-xs text-center max-w-md text-slate-500 dark:text-gray-400 bg-slate-100 dark:bg-dark-accent p-3 rounded-md">
                        <p className="font-medium mb-1">Search tips:</p>
                        <ul className="list-disc list-inside text-left">
                          <li>For HTTP methods, try exact terms like "GET", "POST", etc.</li>
                          <li>For status codes, enter the exact number (e.g., "200", "404")</li>
                          <li>For domains, include the full domain like "google.com", "api.example.org"</li>
                          <li>For paths, try partial matches like "users" or "/api/v1"</li>
                          <li>Use 4+ character terms to search in request/response bodies</li>
                          <li>Searches are case-insensitive</li>
                        </ul>
                      </div>
                    </div>
                  ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-gray-400 py-10">
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        className="h-12 w-12 mb-4 text-slate-400 dark:text-gray-500" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5} 
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
                        />
                      </svg>
                      <p className="text-lg font-medium">No requests available</p>
                      <p className="text-sm mt-1">Requests will appear here as they are captured</p>
                    </div>
                  ) : (
                    <table className="w-full divide-y divide-slate-200 dark:divide-gray-700">
                      <thead className="bg-slate-50 dark:bg-dark-accent sticky top-0 z-10">
                        <tr>
                          {[
                            { key: "id", label: "ID" },
                            { key: "method", label: "Method" },
                            { key: "domain", label: "Domain" },
                            { key: "port", label: "Port" },
                            { key: "path", label: "Path" },
                            { key: "status", label: "Status" },
                            { key: "length", label: "Length" },
                            { key: "mimeType", label: "MIME Type" },
                            { key: "timestamp", label: "Time" }
                          ].map(({ key, label }) => (
                            <th
                              key={key}
                              onClick={() => handleSort(key)}
                              className="px-3 py-1.5 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-primary shadow-sm bg-slate-50 dark:bg-dark-accent"
                            >
                              <div className="flex items-center justify-center gap-1">
                                {label}
                                {sortConfig.key === key && (
                                  <span>{sortConfig.direction === "ascending" ? "↑" : "↓"}</span>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-dark-secondary divide-y divide-slate-200 dark:divide-gray-700">
                        {requests.map((request) => (
                          <tr
                            key={request.id}
                            className="hover:bg-slate-50 dark:hover:bg-dark-accent transition-colors cursor-pointer"
                            onClick={() => fetchRequestDetails(request.id)}
                          >
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                              {request.id}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                {request.method}
                              </span>
                            </td>
                            <td className="px-3 py-0.5 text-xs text-slate-600 dark:text-gray-300 truncate max-w-xs">
                              {request.domain}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                              {request.port || "—"}
                            </td>
                            <td className="px-3 py-0.5 text-xs text-slate-600 dark:text-gray-300 truncate max-w-xs">
                              {request.path}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs">
                              {request.status ? (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                    request.status.startsWith('2')
                                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                      : request.status.startsWith('3')
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                                      : request.status.startsWith('4')
                                      ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                      : request.status.startsWith('5')
                                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                                  }`}
                                >
                                  {request.status}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                                  Pending
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                              {request.length > 0 ? request.length : "—"}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                              {request.mimeType && request.mimeType.trim() ? request.mimeType : "—"}
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                              {new Date(request.timestamp).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="px-4 py-2 flex items-center justify-between border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-dark-accent mt-auto">
                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)} to {Math.min(currentPage * itemsPerPage, totalItems)} of {totalItems} requests
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
                    disabled={currentPage === 1}
                    className={`p-1 rounded-md ${
                      currentPage === 1
                        ? "text-slate-300 dark:text-gray-600 cursor-not-allowed"
                        : "text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-dark-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs text-slate-600 dark:text-gray-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className={`p-1 rounded-md ${
                      currentPage >= totalPages
                        ? "text-slate-300 dark:text-gray-600 cursor-not-allowed"
                        : "text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-dark-primary"
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="h-2 hover:bg-slate-200 dark:hover:bg-dark-accent cursor-row-resize flex items-center justify-center">
            <div className="w-8 h-1 bg-slate-300 dark:bg-gray-600 rounded-full" />
          </PanelResizeHandle>

          <Panel minSize={30}>
            <div className="h-full pb-16">
              <PanelGroup direction="horizontal" className="h-full">
                <Panel minSize={30}>
                  <div className="p-2 flex flex-col h-full">
                    <h2 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">Request</h2>
                    <div className="flex-1 w-full border border-gray-300 dark:border-gray-700 rounded p-2 bg-white dark:bg-dark-secondary text-gray-800 dark:text-gray-200 overflow-hidden font-mono text-left">
                      {selectedRequest && <HttpRequestEditor initialRequest={editedRequest} onChange={handleRequestChange} readOnly={true} />}
                    </div>
                  </div>
                </Panel>

                <PanelResizeHandle className="w-2 hover:bg-slate-200 dark:hover:bg-dark-accent cursor-col-resize flex items-center justify-center">
                  <div className="h-8 w-1 bg-slate-300 dark:bg-gray-600 rounded-full" />
                </PanelResizeHandle>

                <Panel minSize={30}>
                  <div className="p-2 flex flex-col h-full">
                    <h2 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">Response</h2>
                    <div className="flex-1 w-full border border-gray-300 dark:border-gray-700 rounded p-2 bg-white dark:bg-dark-secondary text-gray-800 dark:text-gray-200 overflow-auto font-mono text-left">
                      {selectedRequest && (
                        <ResponseBodyViewer
                          responseHeaders={selectedRequest.responseHeaders}
                          responseBody={selectedRequest.responseBody}
                          status={selectedRequest.status}
                          httpVersion={selectedRequest.httpVersion}
                        />
                      )}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

export default RequestsHistory

