"use client"

import React, {useMemo, useState } from "react"
import { EventsEmit} from "../../../wailsjs/runtime/runtime"
import { Globe, ChevronRight, Search, Folder, File, ArrowLeft } from 'lucide-react'
import { HttpRequestEditor } from "../../components"
import ResponseBodyViewer from "../../components/ResponseViewer"
import { useSiteMap } from '../../contexts/SiteMapContext'
import { useTheme } from '../../contexts/ThemeContext'

interface SiteMapNode {
  url: string
  children?: SiteMapNode[]
}

interface Request {
  id: number
  requestID: string
  method: string
  url: string
  domain: string
  path: string
  query: string
  status: string
  timestamp: string
}

interface SortConfig {
  key: keyof Request | null
  direction: 'ascending' | 'descending'
}

const SiteMap: React.FC = () => {
  const {
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
    setSelectedDomain,
    setSearchValue,
    setContentView,
    setRequestsLoading,
    setExpandedKeys,
    setCurrentRequest,
    fetchRequestDetails,
    onNodeClick,
    getExpandedKeys,
  } = useSiteMap();

  const { theme } = useTheme();
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'ascending' });

  console.log('SiteMap component state:', {
    selectedDomain,
    contentView,
    loading,
    hasSitemap: !!Sitemap
  });

  const handleSort = (key: keyof Request) => {
    setSortConfig((currentSort) => ({
      key,
      direction:
        currentSort.key === key && currentSort.direction === 'ascending'
          ? 'descending'
          : 'ascending',
    }));
  };

  const sortedRequests = useMemo(() => {
    if (!sortConfig.key) return requests;

    return [...requests].sort((a, b) => {
      if (a[sortConfig.key!] < b[sortConfig.key!]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key!] > b[sortConfig.key!]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  }, [requests, sortConfig]);

  const onSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setSearchValue(value)
    if (Sitemap) {
      const newExpandedKeys = getExpandedKeys(Sitemap, value)
      setExpandedKeys(newExpandedKeys)
    }
  }

  const renderTree = (node: SiteMapNode, parentKey = "") => {
    console.log('Rendering tree node:', node);
    const currentKey = parentKey ? 
      (node.url === "" ? parentKey : `${parentKey}/${node.url}`) : 
      node.url;
    const isExpanded = expandedKeys.includes(currentKey)
    const displayURL = node.url === "" ? "/" : node.url

    return (
      <div key={currentKey} className="ml-4">
        <div className="flex items-center cursor-pointer py-1" onClick={() => onNodeClick(currentKey, node)}>
          {node.children && node.children.length > 0 ? (
            isExpanded ? (
              <ChevronRight className="w-4 h-4 mr-1 text-gray-600 dark:text-gray-400 transform rotate-90 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-1 text-gray-600 dark:text-gray-400 flex-shrink-0" />
            )
          ) : (
            <span className="w-4 mr-1 flex-shrink-0" />
          )}
          {node.children && node.children.length > 0 ? (
            <Folder className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-400 flex-shrink-0" />
          ) : (
            <File className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-400 flex-shrink-0" />
          )}
          <span
            className={`text-sm text-gray-800 dark:text-gray-200 truncate max-w-[200px] ${searchValue && displayURL.toLowerCase().includes(searchValue.toLowerCase()) ? "bg-yellow-200 dark:bg-yellow-900" : ""
              }`}
            title={displayURL}
          >
            {displayURL}
          </span>
        </div>
        {isExpanded && node.children && node.children.length > 0 && (
          <div className="ml-4">{node.children.map((child) => renderTree(child, currentKey))}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen text-gray-800 dark:text-white bg-gray-100 dark:bg-dark-primary">
      <aside className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary shadow-md flex-shrink-0">
        <div className="flex justify-between items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Site Map</h1>
        </div>
        <div className="h-[calc(100vh-4rem)] overflow-y-auto pb-4">
          {domains.map((domain: string) => (
            <button
              key={domain}
              className={`w-full px-4 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
                selectedDomain === domain ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
              }`}
              onClick={() => setSelectedDomain(domain)}
            >
              <span className="flex items-center">
                <Globe className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                <span className="text-xs font-medium dark:text-white">{domain}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          ))}
        </div>
      </aside>
      <main className="flex-grow flex flex-col">
        <header className="flex justify-between items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={selectedDomain || ""}
              readOnly
              autoComplete="off"
              spellCheck="false"
              className="px-3 py-2 bg-gray-100 dark:bg-dark-accent text-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ width: `${(selectedDomain?.length || 0) * 8 + 32}px`, minWidth: "200px" }}
              aria-label="Selected Domain"
            />
          </div>
        </header>
        <div className="flex-grow p-6 overflow-y-auto h-[calc(100vh-64px)] bg-white dark:bg-dark-primary">
          {selectedDomain ? (
            <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-md p-6">
              <div className="mb-4 flex justify-between items-center">
                <div className="relative flex-grow mr-4">
                  <input
                    type="text"
                    placeholder="Search URLs"
                    className="w-full pl-10 pr-4 py-2 border dark:border-gray-700 rounded-md bg-white dark:bg-dark-accent text-gray-800 dark:text-white"
                    onChange={onSearch}
                    autoComplete="off"
                    spellCheck="false"
                  />
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setContentView("Sitemap")}
                    className={`px-3 py-1 rounded-md ${
                      contentView === "Sitemap" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-dark-accent text-gray-800 dark:text-white"
                    }`}
                  >
                    Sitemap
                  </button>
                  <button
                    onClick={() => {
                      setContentView("requests")
                      if (selectedNodeURL) {
                        setRequestsLoading(true)
                        EventsEmit("frontend:getRequestsByEndpoint", selectedDomain, selectedNodeURL)
                      }
                    }}
                    className={`px-3 py-1 rounded-md ${
                      contentView === "requests" || contentView === "requestDetails" ? "bg-blue-600 text-white" : "bg-gray-200 dark:bg-dark-accent text-gray-800 dark:text-white"
                    }`}
                  >
                    Requests
                  </button>
                </div>
              </div>
              {loading ? (
                <div className="flex justify-center items-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                </div>
              ) : contentView === "Sitemap" ? (
                Sitemap ? (
                  <div className="bg-gray-50 dark:bg-dark-accent p-4 rounded-md overflow-x-auto">
                    <div className="inline-block min-w-full">{renderTree(Sitemap)}</div>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No Sitemap data available for this domain.</p>
                )
              ) : contentView === "requests" ? (
                <>
                  <h3 className="text-xl font-semibold mb-4 dark:text-white">
                    Requests for endpoint: <span className="text-blue-600">{selectedNodeURL || 'None selected'}</span>
                  </h3>
                  {requestsLoading ? (
                    <div className="flex justify-center items-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full divide-y divide-slate-200 dark:divide-gray-700">
                          <thead className="bg-slate-50 dark:bg-dark-accent">
                            <tr>
                              {[
                                { key: 'method', label: 'Method' },
                                { key: 'path', label: 'Path' },
                                { key: 'query', label: 'Query' },
                                { key: 'status', label: 'Status' },
                                { key: 'timestamp', label: 'Time' }
                              ].map(({ key, label }) => (
                                <th
                                  key={key}
                                  onClick={() => handleSort(key as keyof Request)}
                                  className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-primary"
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
                            {sortedRequests.map((request: Request) => (
                              <tr
                                key={request.id}
                                className="hover:bg-slate-50 dark:hover:bg-dark-accent transition-colors cursor-pointer"
                                onClick={() => fetchRequestDetails(request.id)}
                              >
                                <td className="px-4 py-1.5 whitespace-nowrap text-xs">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                    {request.method}
                                  </span>
                                </td>
                                <td className="px-4 py-1.5 text-xs text-slate-600 dark:text-gray-300 truncate max-w-xs">
                                  {request.path}
                                </td>
                                <td className="px-4 py-1.5 text-xs text-slate-600 dark:text-gray-300 truncate max-w-xs">
                                  {request.query || "-"}
                                </td>
                                <td className="px-4 py-1.5 whitespace-nowrap text-xs">
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${
                                      Number(request.status) < 400
                                        ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                                        : Number(request.status) < 500
                                        ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                                        : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                                    }`}
                                  >
                                    {request.status}
                                  </span>
                                </td>
                                <td className="px-4 py-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                                  {new Date(request.timestamp).toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {sortedRequests.length === 0 && (
                          <p className="text-gray-500 dark:text-gray-400 mt-4">No requests found for this endpoint.</p>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : contentView === "requestDetails" && selectedRequest ? (
                <>
                  <button
                    onClick={() => setContentView("requests")}
                    className="mb-4 flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Requests
                  </button>
                  <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Request Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-350px)]">
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm flex flex-col">
                        <h3 className="text-lg font-semibold px-4 py-2 bg-gray-50 dark:bg-dark-accent border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white">Request</h3>
                        <div className="flex-1 overflow-auto">
                          <HttpRequestEditor
                            initialRequest={currentRequest}
                            onChange={(newRequest) => setCurrentRequest(newRequest)}
                            readOnly={true}
                          />
                        </div>
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm flex flex-col">
                        <h3 className="text-lg font-semibold px-4 py-2 bg-gray-50 dark:bg-dark-accent border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white">Response</h3>
                        <div className="flex-1 overflow-auto">
                          <ResponseBodyViewer
                            responseHeaders={selectedRequest.responseHeaders}
                            responseBody={selectedRequest.responseBody}
                            status={selectedRequest.status}
                            httpVersion={selectedRequest.httpVersion || "HTTP/1.1"}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <Globe className="w-16 h-16 mb-4" />
              <span className="text-lg">Select a domain to view its Sitemap</span>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default SiteMap 