import { useState, useEffect, useRef } from "react"
import { EditorView, basicSetup } from "codemirror"
import { EventsEmit } from "../../wailsjs/runtime/runtime";
import { StreamLanguage } from "@codemirror/language"
import { http } from "@codemirror/legacy-modes/mode/http"
import { json } from "@codemirror/lang-json"
import { EditorState } from "@codemirror/state"
import { keymap } from "@codemirror/view"
import { defaultKeymap } from "@codemirror/commands"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { Clipboard, Scissors, ClipboardPaste, FileText, Send, Syringe, Brain, Repeat, Zap, Link, FileUp, FileDown, Plus, Minus } from "lucide-react"
import { tags as t } from "@lezer/highlight"
import { ViewPlugin, Decoration, DecorationSet, PluginValue, WidgetType } from "@codemirror/view"
import { useContextMenu } from "./ContextMenuManager"

interface HttpRequestEditorProps {
  initialRequest: string
  onChange: (newRequest: string) => void
  customContextMenuItems?: { label: string; action: (view: EditorView) => void }[]
  onInjectPlaceholder?: (view: EditorView) => void
  readOnly?: boolean
}
interface RequestDetails {
  id?: number;
  url: string;
  method: string;
  headers: { [key: string]: string };
  body: string;
  responseHeaders?: string;
  responseBody?: string;
  status?: string;
  protocolVersion?: string;
}
interface FuzzerTabData {
  targetUrl: string;
  method: string;
  path: string;
  protocolVersion: string;
  headers: { [key: string]: string };
  body: string;
  payloads: any[];
}

interface ChatContext {
  id: number;
  name: string;
}

const httpRequestTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--editor-text)",
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    boxSizing: "border-box",
  },
  ".cm-content": {
    caretColor: "var(--editor-text)",
    fontFamily: "monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    textAlign: "left",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    flexGrow: 1,
    width: "100%",
    boxSizing: "border-box",
  },
  ".cm-line": {
    padding: "0 4px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    lineHeight: "1.5",
    width: "100%",
    boxSizing: "border-box",
  },
  ".cm-line:has(.cm-header-name:contains('Cookie'))": {
    whiteSpace: "pre",
    overflow: "auto",
    maxWidth: "100%",
  },
  ".cm-line:has(.cm-header-name:contains('Cookie')) .cm-header-value": {
    whiteSpace: "pre",
    display: "inline",
  },
  ".cm-line:has(.cm-json)": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--editor-text)",
  },
  ".cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--editor-selection)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--editor-gutter-bg)",
    color: "var(--editor-gutter-text)",
    border: "none",
    fontSize: "12px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--editor-active-line-gutter)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    flexGrow: 1,
    width: "100%",
    boxSizing: "border-box",
  },
  ".cm-header-name": {
    color: "rgb(59 130 246 / 0.5) !important",
    fontWeight: "normal",
    fontSize: "12px",
  },
  ".cm-header-value": {
    color: "rgb(59 130 246 / 0.5) !important",
    fontSize: "12px",
  },
  ".cm-status-line": {
    color: "rgb(59 130 246 / 0.5) !important",
    fontWeight: "normal",
    fontSize: "12px",
  },
  ".cm-json": {
    wordBreak: "break-word",
    overflowWrap: "break-word",
    whiteSpace: "pre-wrap",
  },
  ".cm-path-separator": {
    color: "#000000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".dark .cm-path-separator": {
    color: "#ffffff !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".cm-backslash-separator": {
    color: "#ff0000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".dark .cm-backslash-separator": {
    color: "#ff0000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".cm-line:first-child .cm-path-separator": {
    color: "#000000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".dark .cm-line:first-child .cm-path-separator": {
    color: "#ffffff !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".cm-url-separator": {
    color: "#000000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".dark .cm-url-separator": {
    color: "#ffffff !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".cm-path-separator-special": {
    color: "#000000 !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
  ".dark .cm-path-separator-special": {
    color: "#ffffff !important",
    fontWeight: "bold !important",
    opacity: "1 !important",
  },
})

const httpRequestHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--editor-keyword)" },
  { tag: t.string, color: "var(--editor-string)" },
  { tag: t.number, color: "var(--editor-number)" },
  { tag: t.propertyName, color: "var(--editor-property)" },
  { tag: t.variableName, color: "var(--editor-variable)" },
  { tag: t.comment, color: "var(--editor-comment)" },
  { tag: t.tagName, color: "var(--editor-tag)" },
  { tag: t.attributeName, color: "var(--editor-attribute)" },
  { tag: t.attributeValue, color: "var(--editor-attribute-value)" },
  { tag: t.content, color: "var(--editor-text)" },
])

const jsonHighlightStyle = HighlightStyle.define([
  { tag: t.propertyName, color: "rgb(59 130 246)" }, // Blue for keys
  { tag: t.string, color: "rgb(34 197 94)" },        // Green for string values
  { tag: t.number, color: "rgb(249 115 22)" },       // Orange for number values
  { tag: t.bool, color: "rgb(168 85 247)" },         // Purple for boolean values
  { tag: t.null, color: "rgb(168 85 247)" },         // Purple for null values
  { tag: t.punctuation, color: "rgb(156 163 175)" }, // Gray for punctuation
  { tag: t.bracket, color: "rgb(156 163 175)" },     // Gray for brackets
  { tag: t.brace, color: "rgb(156 163 175)" },       // Gray for braces
])

interface HeaderHighlighterPlugin extends PluginValue {
  decorations: DecorationSet;
  bodyStartLine: number;
  getDecorations(view: EditorView): DecorationSet;
}

const headerHighlighter = ViewPlugin.fromClass(
  class implements HeaderHighlighterPlugin {
    decorations: DecorationSet
    bodyStartLine: number = -1

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view)
    }

    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged) {
        this.decorations = this.getDecorations(update.view)
      }
    }

    getDecorations(view: EditorView) {
      const decorations = []
      const lines = view.state.doc.toString().split("\n")
      let inHeaders = true
      let pos = 0
      let isFirstLine = true
      let contentType = ""

      for (const line of lines) {
        if (inHeaders) {
          if (line.trim() === "") {
            inHeaders = false
            this.bodyStartLine = pos + line.length + 1
          } else if (isFirstLine) {
            // Handle the request line (e.g., "GET /api/v1 HTTP/1.1")
            const parts = line.split(" ")
            let currentPos = pos

            // Method (e.g., "GET")
            decorations.push(
              Decoration.mark({
                class: "cm-status-line",
              }).range(currentPos, currentPos + parts[0].length)
            )
            currentPos += parts[0].length + 1

            // Path - handle each character individually
            if (parts[1]) {
              const path = parts[1]
              //console.log("Path:", path)
              
              // Process each character in the path
              for (let i = 0; i < path.length; i++) {
                const char = path[i]
                
                // Forward slashes and URL components should be styled differently
                if (char === '/' || char === '?' || char === '&' || char === '=' || char === '#' || char === '\\') {
                  // Use a different approach - create a widget decoration
                  decorations.push(
                    Decoration.replace({
                      widget: new class extends WidgetType {
                        toDOM() {
                          const span = document.createElement("span")
                          span.textContent = char
                          // Check if dark mode is enabled
                          const isDarkMode = document.documentElement.classList.contains('dark')
                          span.style.color = isDarkMode ? "white" : "black"
                          span.style.fontWeight = "bold"
                          return span
                        }
                        ignoreEvent() { return false }
                      }
                    }).range(currentPos + i, currentPos + i + 1)
                  )
                } else {
                  decorations.push(
                    Decoration.mark({
                      class: "cm-status-line",
                    }).range(currentPos + i, currentPos + i + 1)
                  )
                }
              }
              currentPos += path.length + 1
            }

            // Protocol (e.g., "HTTP/1.1")
            if (parts[2]) {
              decorations.push(
                Decoration.mark({
                  class: "cm-status-line",
                }).range(currentPos, pos + line.length)
              )
            }
            
            isFirstLine = false
          } else {
            const colonIndex = line.indexOf(":")
            if (colonIndex > 0) {
              const headerName = line.substring(0, colonIndex).toLowerCase()
              if (headerName === "content-type") {
                contentType = line.substring(colonIndex + 1).trim()
              }
              decorations.push(
                Decoration.mark({
                  class: "cm-header-name",
                }).range(pos, pos + colonIndex),
              )
              decorations.push(
                Decoration.mark({
                  class: "cm-header-value",
                }).range(pos + colonIndex + 1, pos + line.length),
              )
            }
          }
        }
        pos += line.length + 1
      }
      return Decoration.set(decorations)
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

const pathSeparatorHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.getDecorations(view)
    }

    update(update: { docChanged: boolean; view: EditorView }) {
      if (update.docChanged) {
        this.decorations = this.getDecorations(update.view)
      }
    }

    getDecorations(view: EditorView) {
      const decorations: any[] = []
      const firstLine = view.state.doc.line(1)
      const text = firstLine.text
      const parts = text.split(' ')
      
      // Check if dark mode is enabled
      const isDarkMode = document.documentElement.classList.contains('dark')
      const separatorColor = isDarkMode ? "white" : "black"
      
      if (parts.length > 1) {
        const method = parts[0]
        const path = parts[1]
        const methodEnd = text.indexOf(method) + method.length
        const pathStart = text.indexOf(path, methodEnd)
        
        // Apply decorations to each character in the path
        for (let i = 0; i < path.length; i++) {
          const char = path[i]
          if (char === '/' || char === '?' || char === '&' || char === '=' || char === '#') {
            decorations.push(
              Decoration.mark({
                class: "cm-path-separator-special",
                attributes: { 
                  style: `color: ${separatorColor} !important; font-weight: bold !important;` 
                }
              }).range(pathStart + i + firstLine.from, pathStart + i + 1 + firstLine.from)
            )
          }
        }
      }
      
      return Decoration.set(decorations)
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

export default function HttpRequestEditor({
  initialRequest = "",
  onChange,
  customContextMenuItems = [],
  onInjectPlaceholder,
  readOnly = false,
}: HttpRequestEditorProps) {
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const [contentType, setContentType] = useState<string>("")
  const { showContextMenu } = useContextMenu();
  const [selectedRequestForLLM, setSelectedRequestForLLM] = useState<RequestDetails | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Function to trim trailing empty lines
  const trimTrailingEmptyLines = (request: string): string => {
    return request.replace(/\n+$/, "");
  }

  // Function to format request body with simpler approach
  const formatRequestBody = (request: string): string => {
    const lines = request.split("\n")
    let inHeaders = true
    let body = ""
    let headers: string[] = []
    let requestLine = ""
    let hostHeader = ""
    const contentType = detectContentType(request)

    // First collect headers and raw body
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      if (!inHeaders) {
        // For body lines, collect them only if they're not empty
        if (line) {
          body += (body ? "\n" : "") + lines[i]
        }
        continue
      }
      
      if (line === "") {
        inHeaders = false
        continue
      }
      
      if (i === 0) {
        // Store the request line (GET /path HTTP/1.1)
        requestLine = line
      } else {
        // Process headers
        if (line.toLowerCase().startsWith("host:")) {
          if (!hostHeader) { // Only keep the first host header
            hostHeader = line
          }
        } else {
          headers.push(line)
        }
      }
    }

    // Construct the formatted request
    let formattedRequest = requestLine + "\n"
    
    // Add Host header first if it exists
    if (hostHeader) {
      formattedRequest += hostHeader + "\n"
    }
    
    // Add remaining headers
    formattedRequest += headers.join("\n") + "\n\n"

    // Format body if it exists and isn't empty
    if (body && body.trim()) {
      try {
        // First try to parse as JSON regardless of content type
        try {
          let jsonBody = body.trim();
          // Handle cases where the body might be a JSON string
          if (jsonBody.startsWith('"') && jsonBody.endsWith('"')) {
            jsonBody = JSON.parse(jsonBody);
          }
          // Parse and stringify with proper indentation
          const parsedJson = typeof jsonBody === 'string' ? JSON.parse(jsonBody) : jsonBody;
          formattedRequest += JSON.stringify(parsedJson, null, 2);
        } catch (e) {
          // If JSON parsing fails, try other format based on content type
          if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
            formattedRequest += body.replace(/></g, ">\n<")
                      .split("\n")
                      .map(line => line.trim())
                      .join("\n");
          } else if (contentType.includes("text/html")) {
            formattedRequest += body.replace(/></g, ">\n<")
                      .split("\n")
                      .map(line => line.trim())
                      .join("\n");
          } else {
            formattedRequest += body;
          }
        }
      } catch (e) {
        console.warn("Failed to format body:", e)
        formattedRequest += body;
      }
    }

    return trimTrailingEmptyLines(formattedRequest)
  }

  // Effect to update editor content when initialRequest changes
  useEffect(() => {
    if (editorView && initialRequest) {
      const currentContent = editorView.state.doc.toString();
      
      // Only format and update if content is actually different
      if (currentContent !== initialRequest) {
        const selection = editorView.state.selection;
        const formattedRequest = formatRequestBody(initialRequest);
        
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: formattedRequest
          },
          selection: selection
        });
      }
    }
  }, [initialRequest]);

  // Function to detect content type from request
  const detectContentType = (request: string): string => {
    const lines = request.split("\n")
    for (const line of lines) {
      if (line.trim() === "") break
      if (line.toLowerCase().startsWith("content-type:")) {
        return line.substring(line.indexOf(":") + 1).trim()
      }
    }
    return ""
  }

  useEffect(() => {
    if (!editorRef.current) return;

    const formattedRequest = formatRequestBody(initialRequest)
    const detectedContentType = detectContentType(initialRequest)
    setContentType(detectedContentType)
  
    const view = new EditorView({
      state: EditorState.create({
        doc: formattedRequest,
        extensions: [
          basicSetup,
          httpRequestTheme,
          headerHighlighter,
          pathSeparatorHighlighter,
          StreamLanguage.define(http),
          json(),
          syntaxHighlighting(httpRequestHighlightStyle),
          syntaxHighlighting(jsonHighlightStyle),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              if (update.transactions.some(tr => tr.isUserEvent("input") || tr.isUserEvent("delete"))) {
                onChange(update.state.doc.toString())
              } else {
                const newRequest = trimTrailingEmptyLines(update.state.doc.toString())
                onChange(newRequest)
              }
            }
          }),
          EditorView.theme({
            "&": { height: "100%", width: "100%" }
          }),
          keymap.of([...defaultKeymap, 
            { key: "Ctrl-l", run: logSelection, preventDefault: true },
            { key: "Mod-c", run: (view) => {
              const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
              navigator.clipboard.writeText(text);
              return true;
            }},
            { key: "Mod-x", run: (view) => {
              const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
              navigator.clipboard.writeText(text);
              view.dispatch({
                changes: {
                  from: view.state.selection.main.from,
                  to: view.state.selection.main.to,
                  insert: "",
                },
              });
              return true;
            }},
            { key: "Mod-v", run: (view) => {
              // Handle paste asynchronously but return true synchronously
              const from = view.state.selection.main.from;
              const to = view.state.selection.main.to;
              navigator.clipboard.readText().then(text => {
                view.dispatch({
                  changes: {
                    from,
                    to,
                    insert: text
                  },
                  selection: { anchor: from + text.length, head: from + text.length }
                });
              }).catch(error => {
                console.error("Failed to paste:", error);
              });
              return true;
            }}
          ]),
          EditorView.domEventHandlers({
            contextmenu: (event, view) => {
              event.preventDefault();
              event.stopPropagation();

              // Store current selection
              const currentSelection = view.state.selection;
              if (currentSelection) {
                setTimeout(() => {
                  view.dispatch({
                    selection: currentSelection
                  });
                }, 0);
              }

              // Calculate position relative to viewport
              const x = event.clientX;
              const y = event.clientY;

              // Create context menu items
              const menuItems = [
                {
                  label: "Copy Whole Request",
                  icon: <FileText className="w-4 h-4" />,
                  action: () => {
                    navigator.clipboard.writeText(view.state.doc.toString());
                  }
                },
                {
                  label: "Copy",
                  icon: <Clipboard className="w-4 h-4" />,
                  action: () => {
                    navigator.clipboard.writeText(
                      view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
                    );
                  }
                }
              ];

              if (!readOnly) {
                menuItems.push(
                  {
                    label: "Cut",
                    icon: <Scissors className="w-4 h-4" />,
                    action: () => {
                      const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
                      navigator.clipboard.writeText(text);
                      view.dispatch({
                        changes: {
                          from: view.state.selection.main.from,
                          to: view.state.selection.main.to,
                          insert: "",
                        },
                      });
                    }
                  },
                  {
                    label: "Paste",
                    icon: <ClipboardPaste className="w-4 h-4" />,
                    action: async () => {
                      // Store the selection positions before pasting
                      const from = view.state.selection.main.from;
                      const to = view.state.selection.main.to;

                      try {
                        const text = await navigator.clipboard.readText();
                        // We can't hide the Paste menu because of this issue: https://stackoverflow.com/questions/79160100/navigator-clipboard-readtext-triggers-a-paste-context-menu-on-safari-17 
                        // Use the inject placeholder pattern
                        setTimeout(() => {
                          view.dispatch({
                            changes: {
                              from,
                              to,
                              insert: text
                            },
                            selection: { anchor: from + text.length, head: from + text.length }
                          });
                        }, 0);
                      } catch (error) {
                        console.error("Failed to paste:", error);
                      }
                    }
                  }
                );
              }

              // Add action items
              menuItems.push(
                {
                  label: "Add to In-Scope",
                  icon: <Plus className="w-4 h-4" />,
                  action: () => addToInScope(view)
                },
                {
                  label: "Add to Out-of-Scope",
                  icon: <Minus className="w-4 h-4" />,
                  action: () => addToOutOfScope(view)
                }
              );

              // Add remaining action items
              const actionItems = [];
              
              if (onInjectPlaceholder) {
                actionItems.push({
                  label: "Inject Placeholder",
                  icon: <Syringe className="w-4 h-4" />,
                  action: () => {
                    // Store the selection positions before injecting
                    const from = view.state.selection.main.from;
                    const to = view.state.selection.main.to;
                    // Call onInjectPlaceholder with the view and stored selection
                    onInjectPlaceholder(view);
                    // Restore the selection after a short delay
                    setTimeout(() => {
                      view.dispatch({
                        selection: { anchor: from, head: to }
                      });
                    }, 0);
                  }
                });
              }

              actionItems.push(
                {
                  label: "Send to Resender",
                  icon: <Repeat className="w-4 h-4" />,
                  action: () => {
                    const request = parseRequestResender(view.state.doc.toString());
                    EventsEmit("frontend:sendToResender", {
                      url: request.url,
                      method: request.method,
                      headers: request.headers,
                      body: request.body
                    });
                  }
                },
                {
                  label: "Send to Fuzzer",
                  icon: <Zap className="w-4 h-4" />,
                  action: () => {
                    const request = parseRequestFuzzer(view.state.doc.toString());
                    sendToFuzzer(request);
                  }
                },
                {
                  label: "Send to LLM Analyzer",
                  icon: <Brain className="w-4 h-4" />,
                  action: () => sendToLLMAnalyzer()
                }
              );

              menuItems.push(...actionItems);

              if (!readOnly) {
                menuItems.push(
                  {
                    label: "Encode URL",
                    icon: <FileUp className="w-4 h-4" />,
                    action: () => {
                      const selection = view.state.sliceDoc(
                        view.state.selection.main.from,
                        view.state.selection.main.to
                      );
                      try {
                        const encodedUrl = encodeURIComponent(selection);
                        view.dispatch({
                          changes: {
                            from: view.state.selection.main.from,
                            to: view.state.selection.main.to,
                            insert: encodedUrl,
                          },
                        });
                      } catch (error) {
                        console.error("Failed to encode URL:", error);
                      }
                    }
                  },
                  {
                    label: "Decode URL",
                    icon: <FileDown className="w-4 h-4" />,
                    action: () => {
                      const selection = view.state.sliceDoc(
                        view.state.selection.main.from,
                        view.state.selection.main.to
                      );
                      try {
                        const decodedUrl = decodeURIComponent(selection);
                        view.dispatch({
                          changes: {
                            from: view.state.selection.main.from,
                            to: view.state.selection.main.to,
                            insert: decodedUrl,
                          },
                        });
                      } catch (error) {
                        console.error("Failed to decode URL:", error);
                      }
                    }
                  }
                );
              }

              // Add custom context menu items
              customContextMenuItems.forEach(item => {
                menuItems.push({
                  label: item.label,
                  icon: <Send className="w-4 h-4" />,
                  action: () => item.action(view)
                });
              });

              showContextMenu(x, y, menuItems);
              return true;
            },
          }),
          EditorState.readOnly.of(readOnly),
        ],
      }),
      parent: editorRef.current,
    });
  
    setEditorView(view);
  
    return () => {
      view.destroy();
    };
  }, []); // Remove initialRequest from dependencies

  function extractHostname(view: EditorView): string | null {
    const content = view.state.doc.toString()
    const lines = content.split('\n')

    for (const line of lines) {
      if (line.toLowerCase().startsWith('host:')) {
        const hostValue = line.split(':')[1].trim()
        // Extract hostname from potential port
        return hostValue.split(':')[0]
      }
    }

    return null
  }

  function escapeRegexPattern(hostname: string): string {
    // Escape special regex characters
    return hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function addToInScope(view: EditorView): void {
    const hostname = extractHostname(view)
    if (hostname) {
      const pattern = escapeRegexPattern(hostname);
      EventsEmit("frontend:addToInScope", pattern)
    } else {
      console.error("No hostname found in the Host header")
    }
  }

  function addToOutOfScope(view: EditorView): void {
    const hostname = extractHostname(view)
    if (hostname) {
      const pattern = escapeRegexPattern(hostname);
      EventsEmit("frontend:addToOutOfScope", pattern)
    } else {
      console.error("No hostname found in the Host header")
    }
  }

  function parseRequestResender(content: string): RequestDetails {
    const lines = content.split('\n');
    const [method, path, protocolVersion] = lines[0].split(' ');
    const headers: Record<string, string> = {};
    let bodyStartIndex = -1;
    let host = '';

    // Parse headers
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        bodyStartIndex = i + 1;
        break;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        headers[key] = value;
        if (key.toLowerCase() === 'host') {
          host = value;
        }
      }
    }

    // Extract body
    const body = bodyStartIndex > -1 ? lines.slice(bodyStartIndex).join('\n').trim() : '';

    // Construct the full URL
    let url = '';
    if (host) {
      const protocol = "https://";
      url = `${protocol}${host}${path}`;
    } else if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else {
      url = path.startsWith('/') ? path : `/${path}`;
    }

    return {
      method,
      url,
      headers,
      body,
      protocolVersion,
      responseHeaders: "",
      responseBody: "",
      status: ""
    };
  }
  function parseRequestFuzzer(content: string): RequestDetails {
    const lines = content.split('\n');
    const [method, path, protocolVersion] = lines[0].split(' ');
    const headers: { [key: string]: string } = {};
    let bodyStartIndex = -1;
    let host = '';
    let body = '';

    // Find the last non-empty line
    let lastNonEmptyIndex = lines.length - 1;
    while (lastNonEmptyIndex > 0 && lines[lastNonEmptyIndex].trim() === '') {
      lastNonEmptyIndex--;
    }

    // Parse headers
    for (let i = 1; i <= lastNonEmptyIndex; i++) {
      const line = lines[i].trim();
      if (line === '') {
        bodyStartIndex = i + 1;
        break;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        // Only set the header if it hasn't been set before
        if (!headers[key]) {
          headers[key] = value;
          if (key.toLowerCase() === 'host') {
            host = value;
          }
        }
      } else {
        // If we encounter a line without a colon, assume it's the start of the body
        bodyStartIndex = i;
        break;
      }
    }

    if (method.toUpperCase() !== 'GET' && bodyStartIndex !== -1) {
      // Extract body
      body = lines.slice(bodyStartIndex, lastNonEmptyIndex + 1).join('\n').trim();
    }

    // Construct the full URL
    let url = '';
    if (host) {
      // Default to HTTPS protocol
      const protocol = "https://";
      url = `${protocol}${host}${path}`;
    } else if (path.startsWith('http://') || path.startsWith('https://')) {
      // Path is already a full URL
      url = path;
    } else {
      // If no host and path doesn't have protocol, create a placeholder URL
      url = path.startsWith('/') ? path : `/${path}`;
    }

    return { method, url, headers, body, protocolVersion };
  }
  function parseRequest(content: string): RequestDetails {
    const lines = content.split('\n');
    const [method, path] = lines[0].split(' ');
    const headers: Record<string, string> = {};
    let bodyStartIndex = -1;
    let host = '';

    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        bodyStartIndex = i + 1;
        break;
      }
      const [key, value] = lines[i].split(': ');
      headers[key] = value;
      if (key.toLowerCase() === 'host') {
        host = value;
      }
    }

    const body = lines.slice(bodyStartIndex).join('\n');
    
    // Construct the full URL
    let url = '';
    if (host) {
      // Default to HTTPS protocol
      const protocol = "https://";
      url = `${protocol}${host}${path}`;
    } else if (path.startsWith('http://') || path.startsWith('https://')) {
      // Path is already a full URL
      url = path;
    } else {
      // If no host and path doesn't have protocol, create a placeholder URL
      url = path.startsWith('/') ? path : `/${path}`;
    }

    return { method, url, headers, body };
  }


  function sendToLLMAnalyzer() {
    if (!editorView) {
      console.error("Editor view is not initialized.");
      return;
    }
    const request = editorView.state.doc.toString();

    console.log("Creating new chat context and sending request:", request);

    EventsEmit("frontend:createChatContext", request);
  }

  function logSelection(view: EditorView) {
    const selection = view.state.selection.main
    const selectedText = view.state.sliceDoc(selection.from, selection.to)
    console.log("Selected text:", selectedText)
    return true
  }

  const sendToFuzzer = (request: RequestDetails): void => {
    const { url, headers, body, method, protocolVersion } = request;
    try {
      const parsedUrl = new URL(url);
      const tabData: FuzzerTabData = {
        targetUrl: `${parsedUrl.protocol}//${parsedUrl.host}`,
        method: method,
        path: parsedUrl.pathname + parsedUrl.search,
        protocolVersion: protocolVersion || 'HTTP/1.1',
        headers: headers,
        body: body,
        payloads: [] // Initialize with empty payloads
      };
      EventsEmit("frontend:sendToFuzzer", tabData);
    } catch (error) {
      console.error("Error parsing URL:", error);
      // Handle case where URL is just a path
      if (url.startsWith('/') || url === '') {
        // Try to extract host from headers
        const host = headers['Host'] || headers['host'];
        if (host) {
          const tabData: FuzzerTabData = {
            targetUrl: `https://${host}`,
            method: method,
            path: url || '/',
            protocolVersion: protocolVersion || 'HTTP/1.1',
            headers: headers,
            body: body,
            payloads: [] // Initialize with empty payloads
          };
          EventsEmit("frontend:sendToFuzzer", tabData);
        } else {
          // No host header, prompt user for base URL
          const baseUrl = prompt("No host header found. Please enter a base URL (e.g., https://example.com):", "https://");
          if (baseUrl) {
            try {
              // Validate the entered URL
              new URL(baseUrl);
              const tabData: FuzzerTabData = {
                targetUrl: baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
                method: method,
                path: url || '/',
                protocolVersion: protocolVersion || 'HTTP/1.1',
                headers: headers,
                body: body,
                payloads: [] // Initialize with empty payloads
              };
              EventsEmit("frontend:sendToFuzzer", tabData);
            } catch (e) {
              alert("Invalid base URL provided. Cannot send to Fuzzer.");
            }
          }
        }
      } else {
        // Try to make a best effort with the provided string
        try {
          // Check if adding https:// would make it valid
          const testUrl = new URL(`https://${url}`);
          const tabData: FuzzerTabData = {
            targetUrl: `https://${testUrl.host}`,
            method: method,
            path: testUrl.pathname + testUrl.search,
            protocolVersion: protocolVersion || 'HTTP/1.1',
            headers: headers,
            body: body,
            payloads: [] // Initialize with empty payloads
          };
          EventsEmit("frontend:sendToFuzzer", tabData);
        } catch (e) {
          alert("Cannot send to Fuzzer: Invalid URL format and no Host header found");
        }
      }
    }
  };

  return (
    <div className="relative w-full h-full">
      <div
        id="editor-container"
        ref={editorRef}
        className="w-full h-full overflow-hidden bg-white dark:bg-dark-secondary shadow-sm"
      />
    </div>
  )
}

