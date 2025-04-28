import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"

interface Plugin {
  id: number
  name: string
  description: string
  is_active?: boolean | number | string
  code: string
  template: string
  version: string
  author: string
  createdAt: string
  ui?: string
}

interface PluginContextType {
  plugins: Plugin[]
  activePluginId: number | null
  isLoading: boolean
  error: string | null
  executionResult: string | null
  setActivePluginId: (id: number | null) => void
  addPlugin: (plugin: Omit<Plugin, "id">) => void
  updatePlugin: (plugin: Plugin) => void
  deletePlugin: (pluginId: number) => void
  togglePlugin: (plugin: Plugin) => void
}

const PluginContext = createContext<PluginContextType | undefined>(undefined)

export const usePlugins = () => {
  const context = useContext(PluginContext)
  if (context === undefined) {
    throw new Error('usePlugins must be used within a PluginProvider')
  }
  return context
}

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [activePluginId, setActivePluginId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [executionResult, setExecutionResult] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isReloading, setIsReloading] = useState(false)
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handlePluginUpdated = (updatedPluginJson: string) => {
    console.log("Plugin updated event received:", updatedPluginJson)
    try {
      // Clear any pending timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      
      const updatedPlugin = JSON.parse(updatedPluginJson) as Plugin
      console.log("Parsed updated plugin:", updatedPlugin)
      
      // Ensure is_active is a boolean based on either is_active or is_active field
      const is_active = typeof updatedPlugin.is_active === 'boolean' ? updatedPlugin.is_active : 
                      typeof updatedPlugin.is_active === 'boolean' ? updatedPlugin.is_active :
                      updatedPlugin.is_active === 1 || updatedPlugin.is_active === '1' || updatedPlugin.is_active === 'true'
      
      console.log("Normalized is_active value:", is_active)
      
      setPlugins((prevPlugins) => {
        const newPlugins = prevPlugins.map((plugin) => {
          if (plugin.id === updatedPlugin.id) {
            console.log("Plugin state comparison:", {
              current: {
                id: plugin.id,
                is_active: plugin.is_active
              },
              new: {
                id: updatedPlugin.id,
                is_active: is_active
              }
            })
            
            // Handle plugin deactivation
            if (!is_active && plugin.is_active) {
              console.log("Plugin being deactivated, cleaning up resources")
              // Clean up plugin resources
              if (window.pluginBridge && plugin.name in window.pluginBridge) {
                delete window.pluginBridge[plugin.name]
              }
              if (`pluginApi_${plugin.name}` in window) {
                delete window[`pluginApi_${plugin.name}`]
              }
              // Clear plugin UI
              const pluginUI = document.querySelector(`[data-plugin-id="${plugin.id}"]`)
              if (pluginUI) {
                pluginUI.innerHTML = ''
              }
            }
            
            return {
              ...updatedPlugin,
              is_active: is_active
            }
          }
          return plugin
        })
        
        console.log("Final plugins state:", newPlugins.map(p => ({
          id: p.id,
          name: p.name,
          is_active: p.is_active
        })))
        return newPlugins
      })
      
      setIsLoading(false)
      setIsUpdating(false)
      setError(null)
    } catch (err) {
      console.error("Error handling plugin update:", err)
      setError("Failed to update plugin. Please try again.")
      setIsLoading(false)
      setIsUpdating(false)
    }
  }

  const reloadPlugins = useCallback(() => {
    if (isReloading) {
      console.log("Already reloading plugins, skipping")
      return
    }

    setIsReloading(true)
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current)
    }

    reloadTimeoutRef.current = setTimeout(() => {
      console.log("Reloading plugins")
      EventsEmit("frontend:loadPlugins")
      setIsReloading(false)
    }, 1000) // Debounce reload requests
  }, [isReloading])

  useEffect(() => {
    // Initialize the global plugin bridge
    window.pluginBridge = {}

    const handlePluginsLoaded = (loadedPlugins: string) => {
      console.log("Plugins loaded event received:", loadedPlugins)
      try {
        const parsedPlugins = JSON.parse(loadedPlugins)
        if (!Array.isArray(parsedPlugins)) {
          throw new Error("Loaded plugins is not an array")
        }
        setPlugins(parsedPlugins)
        setIsLoading(false)
      } catch (err) {
        console.error("Error parsing plugins:", err)
        setError("Failed to load plugins. Please try again.")
        setIsLoading(false)
      }
    }

    const handlePluginSaved = (savedPluginJson: string) => {
      console.log("Plugin saved event received:", savedPluginJson)
      try {
        const savedPlugin = JSON.parse(savedPluginJson) as Plugin
        setPlugins((prevPlugins) => [...prevPlugins, savedPlugin])
        setActivePluginId(savedPlugin.id)
      } catch (err) {
        console.error("Error parsing saved plugin:", err)
        setError("Failed to save new plugin. Please try again.")
      }
    }

    const handlePluginExecuted = (result: string) => {
      console.log("Plugin executed event received:", result)
      setExecutionResult(result)
    }

    const handleClearState = () => {
      console.log('Clearing plugins state')
      setPlugins([])
      setActivePluginId(null)
      setError(null)
      setExecutionResult(null)
      setIsLoading(true)
      // Clean up plugin bridge
      window.pluginBridge = {}
      // Clean up any global plugin APIs
      Object.keys(window).forEach(key => {
        if (key.startsWith('pluginApi_')) {
          delete window[key]
        }
      })
    }

    EventsOn("pluginsLoaded", handlePluginsLoaded)
    EventsOn("pluginUpdated", handlePluginUpdated)
    EventsOn("pluginSaved", handlePluginSaved)
    EventsOn("pluginExecuted", handlePluginExecuted)
    EventsOn("backend:clearState", handleClearState)

    console.log("Emitting frontend:loadPlugins event")
    EventsEmit("frontend:loadPlugins")

    return () => {
      EventsOff("pluginsLoaded")
      EventsOff("pluginUpdated")
      EventsOff("pluginSaved")
      EventsOff("pluginExecuted")
      EventsOff("backend:clearState")
      // Clean up any pending timeouts
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current)
        reloadTimeoutRef.current = null
      }
      setIsUpdating(false)
      setIsReloading(false)
      window.pluginBridge = {}
    }
  }, [])

  const addPlugin = useCallback((newPlugin: Omit<Plugin, "id">) => {
    console.log("Emitting frontend:savePlugin event with:", JSON.stringify(newPlugin))
    EventsEmit("frontend:savePlugin", JSON.stringify(newPlugin))
  }, [])

  const updatePlugin = useCallback((updatedPlugin: Plugin) => {
    console.log("Updating plugin:", updatedPlugin)
    EventsEmit("frontend:updatePlugin", JSON.stringify(updatedPlugin))
  }, [])

  const deletePlugin = useCallback((pluginId: number) => {
    console.log("Deleting plugin:", pluginId)
    EventsEmit("frontend:deletePlugin", pluginId)
    setPlugins((prevPlugins) => {
      const updatedPlugins = prevPlugins.filter((plugin) => plugin.id !== pluginId)
      const deletedPlugin = prevPlugins.find((plugin) => plugin.id === pluginId)
      if (deletedPlugin) {
        if (window.pluginBridge && deletedPlugin.name in window.pluginBridge) {
          delete window.pluginBridge[deletedPlugin.name]
        }
        if (`pluginApi_${deletedPlugin.name}` in window) {
          delete window[`pluginApi_${deletedPlugin.name}`]
        }
      }
      return updatedPlugins
    })
    if (activePluginId === pluginId) {
      setActivePluginId(null)
    }
  }, [activePluginId])

  const togglePlugin = useCallback((plugin: Plugin) => {
    // Prevent multiple rapid toggles
    if (isUpdating) {
      console.log("Update already in progress, ignoring toggle request")
      return
    }

    console.log("Starting plugin toggle for:", plugin)
    console.log("Current plugin state:", {
      id: plugin.id,
      name: plugin.name,
      is_active: plugin.is_active
    })
    
    // Ensure current is_active is a boolean
    const currentis_active = typeof plugin.is_active === 'boolean' ? plugin.is_active : false
    
    // Create updated plugin with toggled state
    const updatedPlugin = {
      ...plugin,
      is_active: !currentis_active,
    }
    
    console.log("Prepared update with new state:", {
      id: updatedPlugin.id,
      name: updatedPlugin.name,
      is_active: updatedPlugin.is_active,
    })
    
    // Show loading state
    setIsLoading(true)
    setError(null)
    setIsUpdating(true)
    
    // Clear any existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
      updateTimeoutRef.current = null
    }
    
    // Set a timeout for backend response
    const timeoutId = setTimeout(() => {
      console.log("Backend update timeout - reverting")
      setIsLoading(false)
      setIsUpdating(false)
      setError("Failed to toggle plugin. Please try again.")
      reloadPlugins() // Use the debounced reload function
    }, 10000) // 10 seconds timeout
    
    // Store timeout ID
    updateTimeoutRef.current = timeoutId
    
    // Update local state optimistically
    setPlugins(prevPlugins =>
      prevPlugins.map(p =>
        p.id === plugin.id ? updatedPlugin : p
      )
    )
    
    // Send update to backend
    const updateData = JSON.stringify(updatedPlugin)
    console.log("Sending update to backend:", updateData)
    EventsEmit("frontend:updatePlugin", updateData)
  }, [isUpdating, reloadPlugins])

  const value = {
    plugins,
    activePluginId,
    isLoading,
    error,
    executionResult,
    setActivePluginId,
    addPlugin,
    updatePlugin,
    deletePlugin,
    togglePlugin,
  }

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>
} 