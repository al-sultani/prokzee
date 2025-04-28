"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { EventsEmit, EventsOn, EventsOff } from "../../../wailsjs/runtime/runtime"
import { Play, Square, Plus, X, Pen } from "lucide-react"
import HttpRequestEditor from "../../components/HttpRequestEditor"
import ResponseBodyViewer from "../../components/ResponseViewer"
import { useFuzzer } from '../../contexts/FuzzerContext' 
import { useTheme } from '../../contexts/ThemeContext'
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

import type { EditorView } from "@codemirror/view"

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return <h1>Something went wrong.</h1>
    }

    return this.props.children
  }
}
interface FuzzerTab {
  id: number
  name: string
  targetUrl: string
  method: string
  path: string
  httpVersion: string
  headers: { [key: string]: string }
  body: string
  payloads: Payload[]
}

interface SequencePayload {
  type: "sequence"
  from: number
  to: number
  step: number
}

interface ListPayload {
  type: "list"
  list: string[]
}

type Payload = SequencePayload | ListPayload

interface FuzzerResult {
  payload: string;
  statusCode: string;
  responseLength: number;
  responseBody: string;
  contentType: string;
  responseHeaders: { [key: string]: string[] };
  rawStatusLine: string;
  error?: string;
}

interface Column<T> {
  accessorKey: keyof T;
  header: string;
  width?: string;
  Cell?: (props: { row: T }) => React.ReactNode;
}

interface CustomTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick: (row: T) => void;
}


function CustomTable<T>({ data, columns, onRowClick }: CustomTableProps<T>) {
  const { theme } = useTheme();
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof T) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (sortColumn) {
      return [...data].sort((a, b) => {
        const valueA = a[sortColumn];
        const valueB = b[sortColumn];

        // Convert to numbers if possible
        const numA = typeof valueA === "string" && !isNaN(Number(valueA)) ? Number(valueA) : valueA;
        const numB = typeof valueB === "string" && !isNaN(Number(valueB)) ? Number(valueB) : valueB;

        if (numA < numB) return sortDirection === 'asc' ? -1 : 1;
        if (numA > numB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [data, sortColumn, sortDirection]);

  return (
    <div className="h-64 overflow-hidden shadow-sm rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="overflow-auto h-full">
        <table className="w-full border-collapse bg-white dark:bg-dark-secondary text-xs">
          <thead className="bg-gray-50 dark:bg-dark-accent">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.accessorKey)}
                  className="text-center py-2 px-3 font-semibold text-gray-600 dark:text-gray-300 cursor-pointer transition duration-150 ease-in-out hover:bg-gray-100 dark:hover:bg-dark-primary sticky top-0 z-10 bg-gray-50 dark:bg-dark-accent"
                  style={{ width: column.width }}
                  onClick={() => handleSort(column.accessorKey)}
                >
                  {column.header}
                  {sortColumn === column.accessorKey && (
                    <span className="ml-1 text-gray-400 dark:text-gray-500">
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, index) => (
              <tr
                key={index}
                onClick={() => onRowClick(row)}
                className="border-b border-gray-100 dark:border-gray-700 cursor-pointer transition duration-150 ease-in-out hover:bg-gray-50 dark:hover:bg-dark-accent"
              >
                {columns.map((column) => (
                  <td
                    key={String(column.accessorKey)}
                    className="py-1 px-3 text-gray-700 dark:text-gray-300"
                    style={{ width: column.width }}
                  >
                    {column.Cell ? column.Cell({ row }) : String(row[column.accessorKey])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


const Fuzzer: React.FC = () => {
  const {
    FuzzerTabs,
    activeFuzzerTab,
    results,
    isRunning,
    runningTabId,
    FuzzerProgress,
    setActiveFuzzerTab,
    addFuzzerTab,
    removeFuzzerTab,
    updateFuzzerTab,
    startFuzzer,
    stopFuzzer,
    updateTabName
  } = useFuzzer();

  const { theme } = useTheme();

  const [editingTabId, setEditingTabId] = useState<number | null>(null)
  const [editingTabName, setEditingTabName] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("target")
  const [selectedResult, setSelectedResult] = useState<FuzzerResult | null>(null)

  useEffect(() => {
    // Switch to results tab when we get new results
    if (activeFuzzerTab !== null && results[activeFuzzerTab]?.length > 0) {
      setActiveTab("results");
    }
  }, [results, activeFuzzerTab]);

  // Add a new effect to switch to the target tab when activeFuzzerTab changes
  useEffect(() => {
    if (activeFuzzerTab !== null) {
      setActiveTab("target");
      // Reset selected result when switching tabs
      setSelectedResult(null);
    }
  }, [activeFuzzerTab]);

  // Add an effect to select the first result when switching to results tab
  useEffect(() => {
    if (activeTab === "results" && activeFuzzerTab !== null) {
      const tabResults = results[activeFuzzerTab];
      if (tabResults && tabResults.length > 0 && !selectedResult) {
        setSelectedResult(tabResults[0]);
      }
    }
  }, [activeTab, activeFuzzerTab, results, selectedResult]);

  const handleDoubleClickTab = (tabId: number, currentName: string) => {
    if (!isRunning) {
      setEditingTabId(tabId)
      setEditingTabName(currentName)
    }
  }

  const handleTabNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingTabName(e.target.value)
  }

  const handleTabNameSubmit = (tabId: number) => {
    if (editingTabName.trim() !== "") {
      updateTabName(tabId, editingTabName.trim())
    }
    setEditingTabId(null)
    setEditingTabName("")
  }

  const countInjectionPoints = (tab: FuzzerTab): number => {
    const regex = /\[__Inject-Here__\[\d+\]\]/g
    const fullRequest = `${tab.method} ${tab.path} ${tab.httpVersion}\n${Object.entries(tab.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n${tab.body}`
    const matches = fullRequest.match(regex)
    return matches ? matches.length : 0
  }

  const addPayload = (tab: FuzzerTab) => {
    const injectionCount = countInjectionPoints(tab)
    if (tab.payloads.length < injectionCount) {
      const newPayloads = [...tab.payloads]
      while (newPayloads.length < injectionCount) {
        newPayloads.push({ type: "list", list: [] })
      }
      updateFuzzerTab(tab.id, { payloads: newPayloads })
    }
  }

  const removePayload = (tabId: number, index: number) => {
    if (!isRunning) {
      const tab = FuzzerTabs.find(t => t.id === tabId)
      if (tab) {
        const newPayloads = tab.payloads.filter((_, i) => i !== index)
        updateFuzzerTab(tabId, { payloads: newPayloads })
      }
    }
  }

  const updatePayload = (tabId: number, index: number, updates: Partial<Payload>) => {
    if (!isRunning) {
      const tab = FuzzerTabs.find(t => t.id === tabId)
      if (tab) {
        const newPayloads = [...tab.payloads]
        if ("type" in updates && updates.type !== newPayloads[index].type) {
          newPayloads[index] =
            updates.type === "sequence" ? { type: "sequence", from: 1, to: 10, step: 1 } : { type: "list", list: [] }
        } else {
          newPayloads[index] = { ...newPayloads[index], ...updates } as Payload
        }
        updateFuzzerTab(tabId, { payloads: newPayloads })
      }
    }
  }

  const renderRequestResponseBoxes = (result: FuzzerResult) => {
    const request = FuzzerTabs.find(tab => tab.id === activeFuzzerTab);
    if (!request || !result) return null;

    const firstLine = `${request.method} ${request.path} ${request.httpVersion}\n`;
    const headers = Object.entries(request.headers).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n\n';
    const body = request.body;
    const requestWithPayload = (firstLine + headers + body).replace(/\[__Inject-Here__\[\d+\]\]/g, result.payload);

    return (
      <PanelGroup direction="horizontal" className="flex flex-1 overflow-hidden">
        <Panel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full pr-2">
            <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Request</h3>
            <div className="border border-gray-300 dark:border-gray-700 rounded p-2 overflow-auto h-[500px] bg-white dark:bg-dark-secondary">
              <HttpRequestEditor
                initialRequest={requestWithPayload}
                onChange={() => { }}
                readOnly={true}
              />
            </div>
          </div>
        </Panel>
        
        <PanelResizeHandle className="w-2 hover:bg-slate-200 dark:hover:bg-dark-accent cursor-col-resize flex items-center justify-center">
          <div className="h-8 w-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
        </PanelResizeHandle>
        
        <Panel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full pl-2">
            {result.error ? (
              <>
                <h3 className="text-lg font-semibold mb-2 text-red-600 dark:text-red-400">Error</h3>
                <div className="border border-red-300 dark:border-red-700 rounded p-4 overflow-auto h-[500px] bg-red-50 dark:bg-red-900/30">
                  <div className="text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                    {result.error}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">Response</h3>
                <div className="border border-gray-300 dark:border-gray-700 rounded p-2 overflow-auto h-[500px] bg-white dark:bg-dark-secondary">
                  <ResponseBodyViewer
                    responseHeaders={JSON.stringify(result.responseHeaders)}
                    responseBody={`${result.rawStatusLine}\n${
                      Object.entries(result.responseHeaders)
                        .map(([key, values]) => values.map(value => `${key}: ${value}`).join('\n'))
                        .join('\n')
                    }\n\n${result.responseBody}`}
                    status={result.statusCode}
                    httpVersion={request?.httpVersion || "HTTP/1.1"}
                  />
                </div>
              </>
            )}
          </div>
        </Panel>
      </PanelGroup>
    );
  };

  const injectPlaceholder = (view: EditorView) => {
    const activeTab = FuzzerTabs.find((t) => t.id === activeFuzzerTab);
    if (!activeTab) return;

    // Get the current selection
    const selection = view.state.selection.main;
    const startPos = selection.from;
    const endPos = selection.to;

    // Get the current content from the editor view
    const currentContent = view.state.doc.toString();

    // Count existing placeholders to determine the new placeholder number
    const placeholderMatches = currentContent.match(/\[__Inject-Here__\[\d+\]\]/g) || [];
    const newPlaceholder = `[__Inject-Here__[${placeholderMatches.length + 1}]]`;

    // Split the content into sections
    const lines = currentContent.split('\n');
    const firstLineEnd = currentContent.indexOf('\n');
    const headersEnd = currentContent.indexOf('\n\n');

    // Parse the current content
    const firstLine = lines[0];
    const [method, path, httpVersion] = firstLine.split(' ');
    
    // Parse headers
    const headers: Record<string, string> = {};
    let body = '';
    let isBody = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') {
        isBody = true;
        continue;
      }
      if (isBody) {
        body += (body ? '\n' : '') + lines[i];
      } else {
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex > 0) {
          const key = lines[i].slice(0, colonIndex).trim();
          const value = lines[i].slice(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
    }

    // Determine where to inject based on the selection position
    if (startPos < firstLineEnd) {
      // Injection in request line
      if (startPos <= method.length) {
        // Inject into METHOD
        const relativePos = startPos;
        const newMethod = method.slice(0, relativePos) + newPlaceholder + method.slice(relativePos);
        lines[0] = `${newMethod} ${path} ${httpVersion}`;
      } else if (startPos <= method.length + 1 + path.length) {
        // Inject into PATH
        const relativePos = startPos - (method.length + 1);
        const newPath = path.slice(0, relativePos) + newPlaceholder + path.slice(relativePos);
        lines[0] = `${method} ${newPath} ${httpVersion}`;
      } else {
        // Inject into HTTP VERSION
        const relativePos = startPos - (method.length + 1 + path.length + 1);
        const newHttpVersion = httpVersion.slice(0, relativePos) + newPlaceholder + httpVersion.slice(relativePos);
        lines[0] = `${method} ${path} ${newHttpVersion}`;
      }
    } else if (startPos < headersEnd) {
      // Injection in headers
      let cumulative = firstLineEnd + 1;
      for (let i = 1; i < lines.length && lines[i] !== ''; i++) {
        const lineStart = cumulative;
        const lineEnd = lineStart + lines[i].length;
        if (startPos >= lineStart && startPos <= lineEnd) {
          const relativePos = startPos - lineStart;
          lines[i] = lines[i].slice(0, relativePos) + newPlaceholder + lines[i].slice(relativePos);
          break;
        }
        cumulative += lines[i].length + 1;
      }
    } else {
      // Injection in body
      const bodyStartIndex = headersEnd + 2;
      const bodyLines = body.split('\n');
      let cumulative = bodyStartIndex;
      let injected = false;
      
      for (let i = 0; i < bodyLines.length; i++) {
        const lineStart = cumulative;
        const lineEnd = lineStart + bodyLines[i].length;
        if (startPos >= lineStart && startPos <= lineEnd) {
          const relativePos = startPos - lineStart;
          bodyLines[i] = bodyLines[i].slice(0, relativePos) + newPlaceholder + bodyLines[i].slice(relativePos);
          injected = true;
          break;
        }
        cumulative += bodyLines[i].length + 1;
      }
      
      if (!injected && bodyLines.length > 0) {
        // If we haven't injected yet, append to the last line
        bodyLines[bodyLines.length - 1] += newPlaceholder;
      } else if (!injected) {
        // If body is empty, create new line with placeholder
        bodyLines.push(newPlaceholder);
      }
      
      // Update the lines array with the new body
      lines.splice(headersEnd + 2, lines.length - (headersEnd + 2), ...bodyLines);
    }

    // Reconstruct the full request
    const newContent = lines.join('\n');

    // Update the editor content and selection
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newContent },
      selection: { anchor: startPos + newPlaceholder.length, head: startPos + newPlaceholder.length }
    });

    // Parse the new content to update the fuzzer state
    const [newMethod, newPath, newHttpVersion] = lines[0].split(' ');
    const newHeaders: Record<string, string> = {};
    let newBody = '';
    let isNewBody = false;

    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '') {
        isNewBody = true;
        continue;
      }
      if (isNewBody) {
        newBody += (newBody ? '\n' : '') + lines[i];
      } else {
        const colonIndex = lines[i].indexOf(':');
        if (colonIndex > 0) {
          const key = lines[i].slice(0, colonIndex).trim();
          const value = lines[i].slice(colonIndex + 1).trim();
          newHeaders[key] = value;
        }
      }
    }

    // Update the fuzzer tab state
    updateFuzzerTab(activeTab.id, {
      method: newMethod,
      path: newPath,
      httpVersion: newHttpVersion,
      headers: newHeaders,
      body: newBody
    });
  };

  const getTotalPayloads = (tab: FuzzerTab | undefined) => {
    if (!tab) return 0;
    return tab.payloads.reduce((total, payload) => {
      if (payload.type === 'sequence') {
        return total + Math.floor((payload.to - payload.from) / payload.step) + 1;
      } else if (payload.type === 'list') {
        return total + payload.list.length;
      }
      return total;
    }, 0);
  };

  const getStatusCodeColor = (statusCode: string | number) => {
    const code = String(statusCode);
    if (code.startsWith('2')) return 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200';
    if (code.startsWith('4')) return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200';
    if (code.startsWith('5')) return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
    return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200';
  };

  const renderFuzzerTabContent = (tab: FuzzerTab) => {
    if (!activeFuzzerTab) return null

    switch (activeTab) {
      case "target":
        return (
          <div className="flex flex-col space-y-4">
            <input
              type="text"
              autoComplete="off"
              value={tab.targetUrl}
              onChange={(e) => updateFuzzerTab(tab.id, { targetUrl: e.target.value })}
              placeholder="Enter target URL"
              className="w-full p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
              disabled={isRunning}
            />
            <div className="h-[760px] w-[600] border-2 rounded-lg shadow-md overflow-hidden border-gray-200 dark:border-gray-700">
              <HttpRequestEditor
                key={tab.id}
                initialRequest={`${tab.method} ${tab.path} ${tab.httpVersion}\n${Object.entries(tab.headers).map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n${tab.body}`}
                onChange={(newRequest: string) => {
                  // Preserve cursor position
                  const editorElement = document.activeElement as HTMLTextAreaElement;
                  const cursorPosition = editorElement?.selectionStart || 0;

                  // Parse request text while preserving placeholders
                  const lines = newRequest.split("\n");
                  if (lines.length < 1) return;

                  const [method, path, httpVersion] = lines[0].split(" ");
                  const headers: Record<string, string> = {};
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
                        headers[key.trim()] = valueParts.join(":").trim();
                      }
                    }
                  }

                  const currentTab = FuzzerTabs.find(tab => tab.id === activeFuzzerTab);
                  if (!currentTab) return;

                  // Ensure placeholders remain intact
                  const updatedBody = body.replace(/\[__Inject-Here__\[\d+\]\]/g, match => match);

                  const updatedTab = {
                    ...currentTab,
                    method: method || "GET",
                    path: path || "/",
                    httpVersion: httpVersion || "HTTP/1.1",
                    headers: headers,
                    body: updatedBody.trim(),
                  };

                  // Prevent unnecessary state updates
                  if (JSON.stringify(updatedTab) !== JSON.stringify(currentTab)) {
                    updateFuzzerTab(currentTab.id, updatedTab);
                  }

                  // Restore cursor position
                  setTimeout(() => {
                    if (editorElement) {
                      editorElement.selectionStart = editorElement.selectionEnd = cursorPosition;
                    }
                  }, 0);
                }}

                onInjectPlaceholder={injectPlaceholder}

                readOnly={isRunning}
              />
            </div>
          </div>
        )
      case "payloads":
        const injectionCount = countInjectionPoints(tab)
        const canAddPayload = tab.payloads.length < injectionCount

        return (
          <div className="space-y-4">
            {tab.payloads.map((payload, index) => (
              <div key={index} className="bg-gray-50 dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold text-black dark:text-white">Payload {index + 1}</h3>
                  <div className="flex items-center">
                    <select
                      value={payload.type}
                      onChange={(e) => updatePayload(tab.id, index, { type: e.target.value as "sequence" | "list" })}
                      className="w-48 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 mr-2"
                      disabled={isRunning}
                    >
                      <option value="sequence">Sequence</option>
                      <option value="list">List</option>
                    </select>
                    <button
                      onClick={() => removePayload(tab.id, index)}
                      className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 focus:outline-none"
                      aria-label="Remove payload"
                      disabled={isRunning}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                {payload.type === "sequence" ? (
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      autoComplete="off"
                      value={payload.from}
                      onChange={(e) => updatePayload(tab.id, index, { from: Number(e.target.value) })}
                      placeholder="From"
                      className="w-1/3 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
                      disabled={isRunning}
                    />
                    <input
                      type="number"
                      autoComplete="off"
                      value={payload.to}
                      onChange={(e) => updatePayload(tab.id, index, { to: Number(e.target.value) })}
                      placeholder="To"
                      className="w-1/3 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
                      disabled={isRunning}
                    />
                    <input
                      type="number"
                      autoComplete="off"
                      value={payload.step}
                      onChange={(e) => updatePayload(tab.id, index, { step: Number(e.target.value) })}
                      placeholder="Step"
                      className="w-1/3 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
                      disabled={isRunning}
                    />
                  </div>
                ) : (
                  <textarea
                    value={Array.isArray(payload.list) ? payload.list.join('\n') : payload.list || ''}
                    onChange={(e) => {
                      const newList = e.target.value.split('\n');
                      updatePayload(tab.id, index, { list: newList });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const cursorPosition = e.currentTarget.selectionStart;
                        const currentValue = e.currentTarget.value;
                        const newValue = currentValue.slice(0, cursorPosition) + '\n' + currentValue.slice(cursorPosition);
                        e.currentTarget.value = newValue;
                        e.currentTarget.dispatchEvent(new Event('input', { bubbles: true }));
                        setTimeout(() => {
                          e.currentTarget.selectionStart = e.currentTarget.selectionEnd = cursorPosition + 1;
                        }, 0);
                      }
                    }}
                    placeholder="Enter list (one item per line)"
                    className="w-full p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600"
                    rows={5}
                    autoComplete="off"
                    spellCheck="false"
                    disabled={isRunning}
                  />
                )}
              </div>
            ))}
            <div className="text-center">
              <button
                onClick={() => addPayload(tab)}
                className={`px-4 py-2 text-white rounded transition-colors ${
                  canAddPayload && !isRunning 
                    ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600" 
                    : "bg-gray-400 dark:bg-gray-600 cursor-not-allowed"
                }`}
                disabled={!canAddPayload || isRunning}
              >
                Add Payload
              </button>
            </div>
            {tab.payloads.length !== injectionCount && (
              <div
                className={`p-4 rounded-lg ${
                  tab.payloads.length < injectionCount 
                    ? "bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-200" 
                    : "bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-200"
                }`}
              >
                {tab.payloads.length < injectionCount
                  ? `Warning: You have fewer payloads (${tab.payloads.length}) than injection points (${injectionCount}). Some injection points may not be used.`
                  : `Warning: You have more payloads (${tab.payloads.length}) than injection points (${injectionCount}). Some payloads may not be used.`}
              </div>
            )}
          </div>
        )
      case "results":
        return (
          <PanelGroup direction="vertical" className="flex flex-col h-full">
            {isRunning && runningTabId && (
              <div className="px-6 py-2 rounded-lg bg-gray-100 dark:bg-dark-secondary border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  Progress: {FuzzerProgress[runningTabId] || 0} / {getTotalPayloads(FuzzerTabs.find(tab => tab.id === runningTabId))}
                </div>
              </div>
            )}
            <Panel defaultSize={35} minSize={15}>
              <div className="h-full overflow-auto">
                <CustomTable<FuzzerResult>
                  columns={columns}
                  data={activeFuzzerTab !== null && results[activeFuzzerTab] ? results[activeFuzzerTab] : []}
                  onRowClick={setSelectedResult}
                />
              </div>
            </Panel>
            
            <PanelResizeHandle className="h-2 hover:bg-slate-200 dark:hover:bg-dark-accent cursor-row-resize flex items-center justify-center">
              <div className="w-8 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
            </PanelResizeHandle>
            
            <Panel defaultSize={65} minSize={35}>
              <div className="h-full overflow-hidden" key={selectedResult ? selectedResult.payload : 'default'}>
                {selectedResult ? renderRequestResponseBoxes(selectedResult) : (
                  <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                    {activeFuzzerTab !== null && results[activeFuzzerTab]?.length > 0 
                      ? "Select a result from the table above to view details" 
                      : "No results available for this tab"}
                  </div>
                )}
              </div>
            </Panel>
          </PanelGroup>
        );
      default:
        return null
    }
  }

  const columns: Column<FuzzerResult>[] = [
    {
      accessorKey: "payload",
      header: "Payload",
      width: "25%",
      Cell: ({ row }) => (
        <span className={`px-1.5 py-0.5 rounded-full text-2xs font-semibold`}>
          {Array.isArray(row.payload)
            ? row.payload.join(', ')
            : row.payload}
        </span>
      ),
    },
    {
      accessorKey: "statusCode",
      header: "Status Code",
      width: "25%",
      Cell: ({ row }) => (
        <span className={`px-1.5 py-0.5 rounded-full text-2xs font-semibold ${getStatusCodeColor(row.statusCode)}`}>
          {row.statusCode}
        </span>
      ),
    },
    {
      accessorKey: "responseLength",
      header: "Length",
      width: "50%",
      Cell: ({ row }) => (
        <span>{typeof row.responseLength === 'number' ? row.responseLength.toLocaleString() : row.responseLength}</span>
      ),
    }
  ];

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-gray-100 dark:bg-dark-primary">
        {/* Tabs */}
        <div className="bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 p-4 flex flex-wrap items-center gap-2">
          {FuzzerTabs.map((tab) => (
            <div
              key={tab.id}
              className={`flex items-center px-3 h-8 mr-2 text-sm font-medium cursor-pointer border rounded-md ${
                activeFuzzerTab === tab.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-accent hover:text-gray-800 dark:hover:text-white"
              } ${isRunning && tab.id !== runningTabId ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (!isRunning || tab.id === runningTabId) {
                  setActiveFuzzerTab(tab.id)
                  setActiveTab("target")
                }
              }}
            >
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  value={editingTabName}
                  onChange={handleTabNameChange}
                  onBlur={() => handleTabNameSubmit(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleTabNameSubmit(tab.id)
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-gray-800 dark:text-gray-200"
                  disabled={isRunning}
                />
              ) : (
                <>
                  <span className="truncate max-w-xs">{tab.name}</span>
                  {!isRunning && activeFuzzerTab === tab.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDoubleClickTab(tab.id, tab.name)
                      }}
                      className="ml-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
                    >
                      <Pen className="h-3 w-3" />
                    </button>
                  )}
                  {FuzzerTabs.length > 1 && !isRunning && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFuzzerTab(tab.id)
                      }}
                      className="ml-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={addFuzzerTab}
            className="px-3 h-8 mr-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-dark-accent text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Add new tab"
            disabled={isRunning}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <main className="flex-grow flex flex-col">
          <header className="flex justify-between items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm">
            {activeFuzzerTab !== null && (
              <div className="flex space-x-4">
                {["target", "payloads", "results"].map((tab) => (
                  <button
                    key={tab}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeTab === tab 
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" 
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-accent"
                    }`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {activeFuzzerTab !== null && (
              <button
                onClick={() =>
                  activeFuzzerTab !== null && (isRunning ? stopFuzzer() : startFuzzer(activeFuzzerTab))
                }
                className={`px-4 py-2 rounded-md flex items-center text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isRunning
                    ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                    : "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                }`}
                disabled={activeFuzzerTab === null}
              >
                {isRunning ? (
                  <>
                    <Square className="mr-2 h-5 w-5" />
                    Stop Fuzzer
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Start Fuzzer
                  </>
                )}
              </button>
            )}
          </header>
          <div className="flex-grow p-6 overflow-y-auto bg-white dark:bg-dark-primary">
            {activeFuzzerTab !== null &&
              renderFuzzerTabContent(FuzzerTabs.find((tab) => tab.id === activeFuzzerTab)!)}
          </div>
        </main>
      </div>
    </ErrorBoundary>
  )
}


export default Fuzzer