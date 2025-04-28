import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { EventsEmit } from "../../../wailsjs/runtime/runtime"
import {
  PlusCircle,
  Plug,
  ChevronRight,
  Plus,
  Play,
  CircleStopIcon as Stop,
  Code,
  Layout,
  Save,
  Upload,
} from "lucide-react"
import { ErrorBoundary } from "react-error-boundary"
import { usePlugins } from "../../contexts/PluginsContext"
import { useTheme } from "../../contexts/ThemeContext"

type PluginFunction = (...args: any[]) => void

type PluginBridge = {
  [pluginId: string]: {
    [functionName: string]: PluginFunction
  }
}

type PluginApi = {
  [key: string]: PluginFunction
}

declare global {
  interface Window {
    pluginBridge: PluginBridge
    [key: string]: any // Allow indexing with string
  }
}

interface Plugin {
  id: number
  name: string
  description: string
  is_active: boolean
  code: string
  template: string
  version: string
  author: string
  createdAt: string
  ui?: string
}

type PageType = "settings" | "ui"

const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="text-center py-4 text-red-500">
    <h2>Something went wrong:</h2>
    <pre>{error.message}</pre>
  </div>
)

const Plugins: React.FC = () => {
  const {
    plugins,
    activePluginId,
    isLoading,
    error,
    setActivePluginId,
    addPlugin: contextAddPlugin,
    updatePlugin,
    deletePlugin,
    togglePlugin,
  } = usePlugins()

  const { theme } = useTheme()

  const [activePage, setActivePage] = useState<PageType>("ui")
  const [editedCode, setEditedCode] = useState("")
  const [editedTemplate, setEditedTemplate] = useState("")
  const pluginUIRef = useRef<HTMLDivElement>(null)
  const [isNewPluginModalOpen, setIsNewPluginModalOpen] = useState(false)
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [manualPluginData, setManualPluginData] = useState<{
    name?: string;
    description?: string;
    version?: string;
    author?: string;
  }>({})

  const executePlugin = useCallback((plugin: Plugin) => {
    console.log("Executing plugin:", plugin.name)

    try {
      // Clear existing functions for this plugin
      window.pluginBridge[plugin.name] = {}

      // Create plugin API
      const pluginApi = {
        updateUI: (html: string) => {
          if (pluginUIRef.current) {
            pluginUIRef.current.innerHTML = html
          }
        },
        EventsEmit: (eventName: string, eventData: any) => {
          console.log(`Plugin ${plugin.name} emitted event:`, eventName, eventData)
          if (eventName === "frontend:test") {
            EventsEmit("backend:test", eventData)
          }
        },
        name: plugin.name,
        id: plugin.id,
        template: plugin.template,
      }

      // Validate plugin code has init function
      if (!plugin.code.includes('function init')) {
        throw new Error('Plugin must have an init function')
      }

      // Create a new function from the plugin code and immediately execute it
      const pluginModule = new Function(
        "pluginApi",
        `
        try {
          with (pluginApi) {
            ${plugin.code}
            const initResult = init(pluginApi);
            if (!initResult) {
              throw new Error('Plugin init function must return an object');
            }
            return initResult;
          }
        } catch (e) {
          throw new Error('Plugin execution failed: ' + e.message);
        }
        `,
      )(pluginApi)

      // Register plugin functions
      window.pluginBridge[plugin.name] = pluginModule

      // Create a global pluginApi object for this specific plugin
      window[`pluginApi_${plugin.name}`] = {
        ...pluginModule,
        ...pluginApi,
      }

      console.log("Plugin executed successfully")
      return true
    } catch (error) {
      console.error("Error executing plugin:", error)
      // Update plugin state to inactive due to execution failure
      const updatedPlugin = { ...plugin, is_active: false }
      updatePlugin(updatedPlugin)
      return false
    }
  }, [updatePlugin])

  useEffect(() => {
    const handlePluginUI = () => {
      if (!activePluginId || !pluginUIRef.current) return;
      
      const plugin = plugins.find((p) => p.id === activePluginId)
      if (!plugin) return;

      // Clear the UI first
      pluginUIRef.current.innerHTML = '';

      if (plugin.is_active) {
        console.log("Executing active plugin:", plugin.name)
        try {
          const success = executePlugin({ ...plugin, is_active: true })
          if (!success) {
            pluginUIRef.current.innerHTML = '<div class="text-red-500 dark:text-red-400 text-center py-4">Failed to execute plugin. Plugin has been disabled.</div>';
          }
        } catch (error) {
          console.error("Failed to execute plugin:", error)
          pluginUIRef.current.innerHTML = '<div class="text-red-500 dark:text-red-400 text-center py-4">Failed to execute plugin. Plugin has been disabled.</div>';
        }
      } else {
        console.log("Plugin is inactive:", plugin.name)
        pluginUIRef.current.innerHTML = '<div class="text-gray-500 dark:text-gray-400 text-center py-4">Plugin is currently disabled</div>';
        // Clean up plugin bridge
        if (window.pluginBridge && plugin.name in window.pluginBridge) {
          delete window.pluginBridge[plugin.name]
        }
        if (`pluginApi_${plugin.name}` in window) {
          delete window[`pluginApi_${plugin.name}`]
        }
      }
    }

    if (activePage === "ui") {
      handlePluginUI()
    }

    // Cleanup function to ensure we clean resources when component unmounts
    // or when active plugin changes
    return () => {
      if (activePluginId && pluginUIRef.current) {
        pluginUIRef.current.innerHTML = '';
      }
    }
  }, [activePluginId, activePage, plugins, executePlugin])

  useEffect(() => {
    if (activePluginId !== null) {
      const activePlugin = plugins.find((p) => p.id === activePluginId)
      if (activePlugin) {
        setEditedCode(activePlugin.code)
        setEditedTemplate(activePlugin.template)
      }
    }
  }, [activePluginId, plugins])

  const addPlugin = useCallback(() => {
    setIsNewPluginModalOpen(true)
  }, [])

  const handleSaveNewPlugin = () => {
    if (jsonFile) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const jsonContent = JSON.parse(e.target?.result as string)
          const newPlugin: Omit<Plugin, "id"> = {
            name: jsonContent.name || "",
            description: jsonContent.description || "",
            is_active: false,
            code: jsonContent.code || "",
            template: jsonContent.template || "",
            version: jsonContent.version || "",
            author: jsonContent.author || "",
            createdAt: jsonContent.createdAt || "",
          }
          contextAddPlugin(newPlugin)
          setIsNewPluginModalOpen(false)
          setJsonFile(null)
          setFileError(null)
        } catch (error) {
          console.error("Error parsing JSON file:", error)
          setFileError("Failed to parse JSON file. Please check the file format.")
        }
      }
      reader.readAsText(jsonFile)
    } else {
      setFileError("Please upload a JSON file.")
    }
  }

  const savePluginChanges = useCallback(() => {
    if (activePluginId !== null) {
      const originalPlugin = plugins.find((p) => p.id === activePluginId)!;
      const updatedPlugin = {
        ...originalPlugin,
        code: editedCode,
        template: editedTemplate,
        // Ensure version and author remain unchanged
        version: originalPlugin.version,
        author: originalPlugin.author,
      }
      updatePlugin(updatedPlugin)
    }
  }, [activePluginId, editedCode, editedTemplate, plugins, updatePlugin])

  const renderPluginSettings = (plugin: Plugin) => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <h2 className="text-2xl font-bold mb-4 dark:text-white">{plugin.name}</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">{plugin.description}</p>
        <div className="bg-gray-100 dark:bg-dark-secondary p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 dark:text-white">Settings</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="text-sm font-semibold mb-1 dark:text-white">Version</h4>
              <p className="p-2 bg-gray-50 dark:bg-dark-accent rounded border border-gray-300 dark:border-gray-600 dark:text-white">
                {plugin.version || "Not specified"}
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1 dark:text-white">Author</h4>
              <p className="p-2 bg-gray-50 dark:bg-dark-accent rounded border border-gray-300 dark:border-gray-600 dark:text-white">
                {plugin.author || "Not specified"}
              </p>
            </div>
          </div>
          {plugin.createdAt && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold mb-1 dark:text-white">Created At</h4>
              <p className="text-gray-600 dark:text-gray-300">{new Date(plugin.createdAt).toLocaleString()}</p>
            </div>
          )}
          <h3 className="text-lg font-semibold mb-2 dark:text-white">Plugin Code</h3>
          <textarea
            className="w-full h-64 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent dark:text-white border-gray-300 dark:border-gray-600"
            value={editedCode}
            onChange={(e) => setEditedCode(e.target.value)}
          />
          <h3 className="text-lg font-semibold mb-2 mt-4 dark:text-white">Plugin Template</h3>
          <textarea
            className="w-full h-64 p-2 border rounded font-mono text-sm bg-white dark:bg-dark-accent dark:text-white border-gray-300 dark:border-gray-600"
            value={editedTemplate}
            onChange={(e) => setEditedTemplate(e.target.value)}
          />
        </div>
      </div>
    </div>
  )

  const renderPluginUI = (plugin: Plugin) => (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <h2 className="text-2xl font-bold mb-4 dark:text-white">{plugin.name}</h2>
        <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <div ref={pluginUIRef} className="min-h-[200px] p-2 border rounded dark:border-gray-700 dark:text-white" />
        </div>
      </div>
    </div>
  )

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0]
      if (file.type === "application/json") {
        setJsonFile(file)
        setFileError(null)
      } else {
        setJsonFile(null)
        setFileError("Please upload a valid JSON file.")
      }
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen dark:text-white">Loading plugins...</div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex h-screen text-gray-800 dark:text-white bg-gray-100 dark:bg-dark-primary">
        <aside className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary shadow-md">
          <div className="flex justify-between items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Plugins</h1>
            <button
              onClick={addPlugin}
              className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Add New Plugin"
            >
              <Plus className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
          <div className="h-[calc(100vh-64px)] overflow-y-auto">
            {plugins && plugins.length > 0 ? (
              plugins.map((plugin) => (
                <button
                  key={plugin.id}
                  className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
                    activePluginId === plugin.id ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
                  }`}
                  onClick={() => setActivePluginId(plugin.id)}
                >
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <Plug className={`w-5 h-5 mr-2 ${plugin.is_active ? "text-green-500" : "text-gray-500 dark:text-gray-400"}`} />
                      <span className="text-sm font-medium dark:text-white">{plugin.name}</span>
                      {plugin.version && (
                        <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                          v{plugin.version}
                        </span>
                      )}
                    </div>
                    {plugin.author && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-7">by {plugin.author}</span>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <Plug className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-3" />
                <p className="text-gray-600 dark:text-gray-400 mb-4">No plugins available</p>
                <button
                  onClick={addPlugin}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Your First Plugin
                </button>
              </div>
            )}
          </div>
        </aside>
        <main className="flex-grow flex flex-col">
          <header className="flex justify-between items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Plugin Details</h2>
            <div>
              {activePluginId !== null && (
                <>
                  <button
                    className={`p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 mr-2 ${
                      activePage === "ui" ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                    onClick={() => setActivePage("ui")}
                  >
                    <Layout className="h-5 w-5" />
                  </button>
                  <button
                    className={`p-2 rounded-md transition-colors focus:outline-none focus:ring-blue-500 mr-2 ${
                      activePage === "settings"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                    }`}
                    onClick={() => setActivePage("settings")}
                  >
                    <Code className="h-5 w-5" />
                  </button>
                  <button
                    className="p-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 mr-2"
                    onClick={() => {
                      const plugin = plugins.find((p) => p.id === activePluginId)
                      if (plugin) togglePlugin(plugin)
                    }}
                  >
                    {plugins.find((p) => p.id === activePluginId)?.is_active ? (
                      <Stop className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </button>
                  <button
                    className="p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 mr-2"
                    onClick={savePluginChanges}
                  >
                    <Save className="h-5 w-5" />
                  </button>
                  <button
                    className="p-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                    onClick={() => {
                      if (activePluginId !== null) {
                        deletePlugin(activePluginId)
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </header>
          <div className="flex-grow p-6 overflow-y-auto h-[calc(100vh-64px)] bg-white dark:bg-dark-primary">
            {activePluginId !== null ? (
              activePage === "ui" ? (
                renderPluginUI(plugins.find((plugin) => plugin.id === activePluginId) as Plugin)
              ) : (
                renderPluginSettings(plugins.find((plugin) => plugin.id === activePluginId) as Plugin)
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <Plug className="w-16 h-16 mb-4" />
                {plugins && plugins.length > 0 ? (
                  <>
                    <span className="text-lg">Select a plugin to view details</span>
                    <p className="text-center max-w-md mt-2 mb-4">Choose a plugin from the sidebar to view and manage its settings or UI.</p>
                  </>
                ) : (
                  <>
                    <span className="text-lg font-semibold">Welcome to the Plugin Manager</span>
                    <p className="text-center max-w-md mt-2 mb-4">
                      You don't have any plugins yet. Plugins extend the functionality of your application with custom features.
                    </p>
                    <div className="bg-gray-100 dark:bg-dark-secondary p-6 rounded-lg max-w-lg w-full mb-6">
                      <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-white">Getting Started</h3>
                      <ul className="space-y-3 text-sm text-left">
                        <li className="flex items-start">
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 mr-2 flex-shrink-0">1</span>
                          <span>Click the "Add New Plugin" button to create or import a plugin</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 mr-2 flex-shrink-0">2</span>
                          <span>Upload a JSON plugin file or create one manually with a name and description</span>
                        </li>
                        <li className="flex items-start">
                          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 mr-2 flex-shrink-0">3</span>
                          <span>Enable your plugin and customize its code and template as needed</span>
                        </li>
                      </ul>
                    </div>
                  </>
                )}
                <button
                  className="mt-4 px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center"
                  onClick={addPlugin}
                >
                  <PlusCircle className="w-5 h-5 mr-2" />
                  Add New Plugin
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
      {isNewPluginModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-[800px] max-h-[90vh] overflow-y-auto shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-white">Add New Plugin</h2>
            <div className="mb-4">
              <label htmlFor="jsonFile" className="block text-sm font-medium text-gray-300">
                Upload Plugin JSON File
              </label>
              <div className="mt-1 flex items-center">
                <input type="file" id="jsonFile" accept=".json" onChange={handleFileChange} className="hidden" />
                <label
                  htmlFor="jsonFile"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Upload className="h-5 w-5 mr-2" />
                  Choose File
                </label>
                <span className="ml-3 text-sm text-gray-300">{jsonFile ? jsonFile.name : "No file chosen"}</span>
              </div>
              {fileError && <p className="mt-2 text-sm text-red-500">{fileError}</p>}
            </div>
            <div className="mb-4 border-t border-gray-700 pt-4">
              <h3 className="text-lg font-medium text-white mb-3">Or Create Manually</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="mb-3">
                  <label htmlFor="pluginName" className="block text-sm font-medium text-gray-300 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    id="pluginName"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Enter plugin name"
                    value={manualPluginData?.name || ""}
                    onChange={(e) => setManualPluginData(prev => ({ ...prev, name: e.target.value }))}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="pluginVersion" className="block text-sm font-medium text-gray-300 mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    id="pluginVersion"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="1.0.0"
                    value={manualPluginData?.version || ""}
                    onChange={(e) => setManualPluginData(prev => ({ ...prev, version: e.target.value }))}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="pluginAuthor" className="block text-sm font-medium text-gray-300 mb-1">
                    Author
                  </label>
                  <input
                    type="text"
                    id="pluginAuthor"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Author Name"
                    value={manualPluginData?.author || ""}
                    onChange={(e) => setManualPluginData(prev => ({ ...prev, author: e.target.value }))}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
                <div className="mb-3 col-span-2">
                  <label htmlFor="pluginDescription" className="block text-sm font-medium text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    id="pluginDescription"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    rows={4}
                    placeholder="Enter plugin description"
                    value={manualPluginData?.description || ""}
                    onChange={(e) => setManualPluginData(prev => ({ ...prev, description: e.target.value }))}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setIsNewPluginModalOpen(false)
                  setJsonFile(null)
                  setFileError(null)
                  setManualPluginData({})
                }}
                className="mr-2 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (jsonFile) {
                    handleSaveNewPlugin();
                  } else if (manualPluginData?.name) {
                    const newPlugin: Omit<Plugin, "id"> = {
                      name: manualPluginData.name,
                      description: manualPluginData.description || "",
                      is_active: false,
                      code: "",
                      template: "",
                      version: manualPluginData.version || "1.0.0",
                      author: manualPluginData.author || "",
                      createdAt: new Date().toISOString(),
                    };
                    contextAddPlugin(newPlugin);
                    setIsNewPluginModalOpen(false);
                    setManualPluginData({})
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
              >
                Save Plugin
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}

export default Plugins

