"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import "../styles/editor-theme.css"
import { EditorView } from "codemirror"
import { EditorState } from "@codemirror/state"
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language"
import { tags as t } from "@lezer/highlight"
import { Decoration, ViewPlugin, type DecorationSet } from "@codemirror/view"
import { keymap } from "@codemirror/view"
import { defaultKeymap } from "@codemirror/commands"
import { lineNumbers, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLineGutter } from "@codemirror/view"
import { history, historyKeymap } from "@codemirror/commands"
import { foldGutter, indentOnInput, bracketMatching } from "@codemirror/language"
import { searchKeymap, search } from "@codemirror/search"
import { autocompletion, completionKeymap } from "@codemirror/autocomplete"
import { lintKeymap } from "@codemirror/lint"
import { closeBrackets } from "@codemirror/autocomplete"
import { highlightSelectionMatches } from "@codemirror/search"
import { EventsEmit } from "../../wailsjs/runtime/runtime"
import { Clipboard, FileText, Brain, } from "lucide-react"
import { Compartment } from "@codemirror/state"
import { useContextMenu } from "./ContextMenuManager"
import "../styles/editor-theme.css"

interface ResponseBodyViewerProps {
  responseHeaders: string
  responseBody: string
  status: string
  httpVersion: string
}

// Context menu interface
interface ContextMenuPosition {
  x: number
  y: number
  show: boolean
}

const responseBodyTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--editor-text)",
    height: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
  },
  ".cm-content": {
    caretColor: "var(--editor-text)",
    fontFamily: "monospace",
    fontSize: "12px",
    lineHeight: "1.5",
    textAlign: "left",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    overflowWrap: "anywhere",
    flexGrow: 1,
    maxWidth: "100%",
  },
  ".cm-scroller": {
    overflow: "auto",
    scrollbarWidth: "thin",
    fontFamily: "monospace",
  },
  ".cm-line": {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    maxWidth: "100%",
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
  ".cm-activeLine": {
    backgroundColor: "transparent !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-header-name": {
    color: "var(--editor-header-name) !important",
    fontWeight: "normal",
    fontSize: "12px",
  },
  ".cm-header-value": {
    color: "var(--editor-header-value) !important",
    fontSize: "12px",
  },
  ".cm-status-line": {
    color: "var(--editor-status) !important",
    fontWeight: "normal",
    fontSize: "12px",
  },
  ".cm-json-property": {
    color: "var(--editor-property) !important",
  },
  ".cm-json-string": {
    color: "var(--editor-string) !important",
  },
  ".cm-json-number": {
    color: "var(--editor-number) !important",
  },
  ".cm-json-boolean": {
    color: "var(--editor-keyword) !important",
  },
  ".cm-json-null": {
    color: "var(--editor-keyword) !important",
  },
  ".cm-json-bracket": {
    color: "var(--editor-text) !important",
  },
  ".cm-xml-tagname": {
    color: "var(--editor-tag) !important",
  },
  ".cm-xml-attribute": {
    color: "var(--editor-attribute) !important",
  },
  ".cm-xml-content": {
    color: "var(--editor-text) !important",
  },
  ".cm-html-tagname": {
    color: "var(--editor-tag) !important",
  },
  ".cm-html-attribute": {
    color: "var(--editor-attribute) !important",
  },
  ".cm-html-content": {
    color: "var(--editor-text) !important",
  },
  ".response-body": {
    color: "var(--editor-text)",
  },
  ".response-body .cm-string": {
    color: "var(--editor-string) !important",
  },
  ".response-body .cm-number": {
    color: "var(--editor-number) !important",
  },
  ".response-body .cm-property": {
    color: "var(--editor-property) !important",
  },
  ".response-body .cm-keyword": {
    color: "var(--editor-keyword) !important",
  },
  ".response-body .cm-boolean": {
    color: "var(--editor-keyword) !important",
  },
  ".response-body .cm-null": {
    color: "var(--editor-keyword) !important",
  },
})

const responseBodyHighlightStyle = HighlightStyle.define([
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

const headerHighlighter = ViewPlugin.fromClass(
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
      const decorations = []
      const lines = view.state.doc.toString().split("\n")
      let inHeaders = true
      let pos = 0

      for (const line of lines) {
        if (inHeaders) {
          if (line.trim() === "") {
            inHeaders = false
          } else {
            const colonIndex = line.indexOf(":")
            if (colonIndex > 0) {
              decorations.push(
                Decoration.mark({
                  class: "cm-header-name",
                }).range(pos, pos + colonIndex + 1),
              )
              if (colonIndex + 1 < line.length) {
                decorations.push(
                  Decoration.mark({
                    class: "cm-header-value",
                  }).range(pos + colonIndex + 1, pos + line.length),
                )
              }
            } else {
              decorations.push(
                Decoration.mark({
                  class: "cm-status-line",
                }).range(pos, pos + line.length),
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
    decorations: (v) => v.decorations,
  },
)

const bodyHighlighter = ViewPlugin.fromClass(
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
      const decorations = []
      const content = view.state.doc.toString()
      const bodyStart = content.indexOf("\n\n") + 2
      
      // Only add decoration if there is actual body content after the headers
      if (bodyStart >= 2 && bodyStart < content.length) {
        decorations.push(
          Decoration.mark({
            class: "response-body",
          }).range(bodyStart, content.length)
        )
      }
      
      return Decoration.set(decorations)
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)

// Add custom copy keymap
const copyKeymap = [
  {
    key: "Mod-c",
    run: (view: EditorView) => {
      const selection = view.state.sliceDoc(
        view.state.selection.main.from,
        view.state.selection.main.to
      );
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
      return true;
    }
  }
];

// Update customSetup to include copyKeymap
const customSetup = [
  lineNumbers(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  syntaxHighlighting(responseBodyHighlightStyle),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLineGutter(),
  highlightSelectionMatches(),
  EditorView.lineWrapping,
  keymap.of([
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    ...lintKeymap,
    ...copyKeymap,
  ]),
  search(),
]

// Create a compartment for language modes
const languageCompartment = new Compartment()

const ResponseBodyViewer: React.FC<ResponseBodyViewerProps> = ({ responseHeaders, responseBody, status, httpVersion }) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const [editorView, setEditorView] = useState<EditorView | null>(null)
  const { showContextMenu } = useContextMenu();
  httpVersion = httpVersion || "HTTP/1.1"

  const formatBody = (body: string, contentType: string) => {
    try {
      if (contentType.includes("application/json") || isValidJSON(body)) {
        // First unescape any escaped characters if the input is a string
        let jsonToFormat = body;
        if (typeof body === 'string') {
          try {
            // Handle cases where the string has escaped characters
            jsonToFormat = body.replace(/\\n/g, '\n')
                              .replace(/\\"/g, '"')
                              .replace(/\\t/g, '\t')
                              .replace(/\\\\/g, '\\');
          } catch (e) {
            console.warn("Failed to unescape JSON string:", e);
          }
        }

        // Try to parse and format JSON with consistent 2-space indentation
        const parsedJSON = typeof jsonToFormat === 'string' ? JSON.parse(jsonToFormat) : jsonToFormat;
        return JSON.stringify(parsedJSON, null, 2);
      } else if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
        // More sophisticated XML formatting
        return body
          .replace(/></g, ">\n<")
          .replace(/(<[^>]+>)(?![\s<])/g, "$1\n")
          .replace(/^\s+/gm, (match) => " ".repeat(match.length));
      } else if (contentType.includes("text/html")) {
        // More sophisticated HTML formatting
        return body
          .replace(/></g, ">\n<")
          .replace(/<(\/?)(html|head|body|div|p|h[1-6]|ul|ol|li|table|tr|td|th)([^>]*)>/g, "\n<$1$2$3>")
          .replace(/^\s+/gm, (match) => " ".repeat(match.length));
      }
    } catch (e) {
      console.warn("Failed to format response body:", e);
      // If JSON parsing fails, return the original body
      return body;
    }
    
    return body;
  };

  // Helper function to check if a string is valid JSON
  const isValidJSON = (str: string): boolean => {
    try {
      const trimmed = str.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        JSON.parse(str);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Create editor instance
  useEffect(() => {
    if (!editorRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [
          customSetup,
          responseBodyTheme,
          headerHighlighter,
          bodyHighlighter,
          EditorView.lineWrapping,
          EditorState.readOnly.of(true),
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

              const menuItems = [
                {
                  label: "Copy",
                  icon: <Clipboard className="w-4 h-4" />,
                  action: () => {
                    const selection = view.state.sliceDoc(
                      view.state.selection.main.from,
                      view.state.selection.main.to
                    );
                    if (selection) {
                      navigator.clipboard.writeText(selection);
                    }
                  }
                },
                {
                  label: "Copy Whole Response",
                  icon: <FileText className="w-4 h-4" />,
                  action: () => {
                    const content = view.state.doc.toString();
                    navigator.clipboard.writeText(content);
                  }
                },
                {
                  label: "Select All",
                  icon: <Clipboard className="w-4 h-4" />,
                  action: () => {
                    const docLength = view.state.doc.length;
                    view.dispatch({
                      selection: { anchor: 0, head: docLength }
                    });
                  }
                },
                {
                  label: "Send to LLM Analyzer",
                  icon: <Brain className="w-4 h-4" />,
                  action: () => {
                    const content = view.state.doc.toString();
                    if (content) {
                      EventsEmit("frontend:createChatContext", content);
                    }
                  }
                }
              ];

              showContextMenu(event.clientX, event.clientY, menuItems);
              return true;
            },
            mousedown: (event) => {
              // Prevent text selection on right-click
              if (event.button === 2) {
                event.preventDefault();
                return true;
              }
              return false;
            }
          })
        ],
      }),
      parent: editorRef.current,
    });

    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, []); // Empty dependency array as we only want to create the editor once

  // Update content when props change
  useEffect(() => {
    if (!editorView) return;

    try {
      let parsedHeaders: Record<string, any> = {};
      let contentType = "";
      
      try {
        if (typeof responseHeaders === 'string') {
          parsedHeaders = JSON.parse(responseHeaders || "{}");
        } else if (typeof responseHeaders === 'object') {
          parsedHeaders = responseHeaders;
        }
        
        contentType = 
          parsedHeaders["Content-Type"] || 
          parsedHeaders["content-type"] || 
          (Array.isArray(parsedHeaders["Content-Type"]) ? parsedHeaders["Content-Type"][0] : "") ||
          (Array.isArray(parsedHeaders["content-type"]) ? parsedHeaders["content-type"][0] : "") ||
          "";
      } catch (e) {
        console.warn("Failed to parse response headers:", e);
      }

      let formattedResponse = "";
      let bodyContent = responseBody || "";
      
      const hasResponseData = Boolean(status) || Boolean(responseBody) || (Object.keys(parsedHeaders).length > 0);
      
      if (!hasResponseData) {
        formattedResponse = "No response data available.\nMake a request to see the response here.\n\nThe response will show:\n- Protocol and Status\n- Response Headers\n- Response Body";
      } else {
        const hasExistingHeaders = bodyContent?.trim().startsWith("HTTP/");
        
        if (hasExistingHeaders) {
          formattedResponse = bodyContent;
        } else {
          if (status) {
            const protocolMatch = status.match(/^(HTTP\/\d+\.\d+)\s/);
            const protocol = protocolMatch ? protocolMatch[1] : httpVersion;
            formattedResponse = `${protocol} ${status.replace(/^HTTP\/\d+\.\d+\s/, '')}\n`;
            
            for (const [key, value] of Object.entries(parsedHeaders)) {
              const headerValue = Array.isArray(value) ? value.join(", ") : value;
              formattedResponse += `${key}: ${headerValue}\n`;
            }
            formattedResponse += "\n";
          }

          if (bodyContent && bodyContent.trim()) {
            formattedResponse += formatBody(bodyContent, contentType);
          } else if (!formattedResponse.endsWith("\n\n")) {
            formattedResponse += "\n";
          }
        }
      }

      // Update the editor content
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: formattedResponse
        }
      });

    } catch (e: unknown) {
      console.error("Error updating editor content:", e);
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: "Error displaying response: " + (e instanceof Error ? e.message : String(e))
        }
      });
    }
  }, [responseBody, responseHeaders, status, httpVersion, editorView]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-white dark:bg-dark-secondary shadow-sm relative">
      <div ref={editorRef} className="w-full h-full" />
    </div>
  );
};

export default ResponseBodyViewer

