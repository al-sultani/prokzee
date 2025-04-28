"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Save, RotateCcw, Settings, Palette, Info, ChevronRight, Check, Moon, Sun } from "lucide-react"
import { EventsEmit, EventsOn, EventsOff, BrowserOpenURL } from "../../wailsjs/runtime/runtime"
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'

const SettingsPage: React.FC = () => {
  const { theme, toggleTheme } = useTheme()
  const { settings, updateSettings } = useSettings();
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [errors, setErrors] = useState<any>({})
  const [currentVersion, setCurrentVersion] = useState("")
  const [latestVersion, setLatestVersion] = useState("")

  useEffect(() => {
    const handleFetchSettings = (data: any) => {
      if (data.error) {
        console.error(data.error)
      } else {
        updateSettings(data)
      }
    }

    EventsOn("backend:fetchSettings", handleFetchSettings)
    EventsEmit("frontend:fetchSettings")

    return () => {
      EventsOff("backend:fetchSettings")
    }
  }, [])

  useEffect(() => {
    // Check for updates
    const handleUpdateCheck = (data: any) => {
      setCurrentVersion(data.currentVersion)
      setLatestVersion(data.latestVersion)
    }

    EventsOn("backend:updateCheck", handleUpdateCheck)
    EventsEmit("frontend:checkForUpdates")

    return () => {
      EventsOff("backend:updateCheck")
    }
  }, [])

  useEffect(() => {
    // Add event listener to enable copy-paste
    const handleCopyPaste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleCopyPaste, true);
    return () => document.removeEventListener('keydown', handleCopyPaste, true);
  }, []);

  const handleSave = () => {
    const newErrors: any = {}
    if (!settings.project_name) newErrors.project_name = "Project Name is required"
    if (!settings.openai_api_url) newErrors.openai_api_url = "OpenAI API URL is required"
    if (!settings.openai_api_key) newErrors.openai_api_key = "OpenAI API Key is required"
    if (!settings.proxy_port) newErrors.proxy_port = "Proxy Port is required"
    if (!settings.interactsh_host) newErrors.interactsh_host = "Interactsh Host is required"
    if (!settings.interactsh_port) newErrors.interactsh_port = "Interactsh Port is required"
    if (typeof settings.interactsh_port === 'string' || isNaN(settings.interactsh_port)) {
      newErrors.interactsh_port = "Interactsh Port must be a valid number"
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    updateSettings(settings)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    updateSettings({
      ...settings,
      [name]: name === 'interactsh_port' ? parseInt(value) || value : value,
    })
  }

  const renderSection = (section: string) => {
    switch (section) {
      case "general":
        return (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-2 dark:text-white">General Settings</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">Configure your application settings and preferences</p>
            
            <div className="space-y-4">
              {/* Project Settings Group */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold dark:text-white">Project Settings</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Basic configuration for your project</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="project_name">
                      Project Name
                    </label>
                    <input
                      type="text"
                      id="project_name"
                      name="project_name"
                      value={settings.project_name}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter project name"
                    />
                    {errors.project_name && <p className="mt-1 text-xs text-red-500">{errors.project_name}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">This name will be used throughout the application</p>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="proxy_port">
                      Proxy Port
                    </label>
                    <input
                      type="text"
                      id="proxy_port"
                      name="proxy_port"
                      value={settings.proxy_port}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter proxy port"
                    />
                    {errors.proxy_port && <p className="mt-1 text-xs text-red-500">{errors.proxy_port}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Port number for the proxy server</p>
                  </div>
                </div>
              </div>

              {/* OpenAI Settings Group */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold dark:text-white">OpenAI Configuration</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Settings for OpenAI integration</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.0264 1.1706a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4929 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0264 1.1706a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1302 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0834-3.0089l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1658a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
                    </svg>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="openai_api_url">
                      API URL
                    </label>
                    <input
                      type="text"
                      id="openai_api_url"
                      name="openai_api_url"
                      value={settings.openai_api_url}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="https://api.openai.com/v1"
                    />
                    {errors.openai_api_url && <p className="mt-1 text-xs text-red-500">{errors.openai_api_url}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">The base URL for OpenAI API requests</p>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="openai_api_key">
                      API Key
                    </label>
                    <input
                      type="password"
                      id="openai_api_key"
                      name="openai_api_key"
                      value={settings.openai_api_key}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="sk-..."
                    />
                    {errors.openai_api_key && <p className="mt-1 text-xs text-red-500">{errors.openai_api_key}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Your OpenAI API key for authentication</p>
                  </div>
                </div>
              </div>

              {/* Interactsh Settings Group */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-semibold dark:text-white">Interactsh Settings</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure Interactsh server settings</p>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="interactsh_host">
                      Host
                    </label>
                    <input
                      type="text"
                      id="interactsh_host"
                      name="interactsh_host"
                      value={settings.interactsh_host}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter host address"
                    />
                    {errors.interactsh_host && <p className="mt-1 text-xs text-red-500">{errors.interactsh_host}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Hostname for the Interactsh server</p>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="interactsh_port">
                      Port
                    </label>
                    <input
                      type="text"
                      id="interactsh_port"
                      name="interactsh_port"
                      value={settings.interactsh_port}
                      onChange={handleChange}
                      autoComplete="off"
                      spellCheck="false"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-dark-accent text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter port number"
                    />
                    {errors.interactsh_port && <p className="mt-1 text-xs text-red-500">{errors.interactsh_port}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">Port number for the Interactsh server</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      case "theme":
        return (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-semibold mb-2 dark:text-white">Theme Settings</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8">Customize the appearance of your application</p>
            
            <div className="space-y-8">
              {/* Theme Mode Selection */}
              <div className="bg-white dark:bg-dark-secondary p-8 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-semibold dark:text-white">Choose Your Theme</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select between light and dark mode for optimal viewing</p>
                  </div>
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Current:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400 capitalize">{theme} Mode</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Light Theme Option */}
                  <button
                    onClick={() => theme === 'light' ? null : toggleTheme()}
                    className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                      theme === 'light'
                        ? 'border-blue-500 ring-4 ring-blue-50 dark:ring-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-lg ring-4 ring-gray-50 dark:ring-gray-700">
                          <Sun className={`w-6 h-6 ${theme === 'light' ? 'text-blue-500' : 'text-gray-400'} transition-colors duration-300`} />
                        </div>
                        {theme === 'light' && (
                          <div className="flex items-center text-blue-500 dark:text-blue-400">
                            <Check className="w-5 h-5 mr-1" />
                            <span className="text-sm font-medium">Active</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h4 className={`text-lg font-medium ${
                          theme === 'light' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                        }`}>Light Mode</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Perfect for daytime use with bright, clean interfaces</p>
                      </div>
                      <div className="mt-4 h-24 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                        <div className="w-full h-4 bg-white dark:bg-gray-900 rounded mb-2"></div>
                        <div className="w-2/3 h-4 bg-white dark:bg-gray-900 rounded"></div>
                      </div>
                    </div>
                  </button>

                  {/* Dark Theme Option */}
                  <button
                    onClick={() => theme === 'dark' ? null : toggleTheme()}
                    className={`group relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                      theme === 'dark'
                        ? 'border-blue-500 ring-4 ring-blue-50 dark:ring-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-full bg-gray-900 dark:bg-gray-800 flex items-center justify-center shadow-lg ring-4 ring-gray-800 dark:ring-gray-700">
                          <Moon className={`w-6 h-6 ${theme === 'dark' ? 'text-blue-500' : 'text-gray-400'} transition-colors duration-300`} />
                        </div>
                        {theme === 'dark' && (
                          <div className="flex items-center text-blue-500 dark:text-blue-400">
                            <Check className="w-5 h-5 mr-1" />
                            <span className="text-sm font-medium">Active</span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <h4 className={`text-lg font-medium ${
                          theme === 'dark' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'
                        }`}>Dark Mode</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Easier on the eyes in low-light environments</p>
                      </div>
                      <div className="mt-4 h-24 bg-gray-900 rounded-lg border border-gray-700 p-3">
                        <div className="w-full h-4 bg-gray-800 rounded mb-2"></div>
                        <div className="w-2/3 h-4 bg-gray-800 rounded"></div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>      
            </div>
          </div>
        )
      case "about":
        return (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4 dark:text-white">About</h2>
            <div className="space-y-4">
              {/* Version Information */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold dark:text-white">Version Information</h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-accent rounded-lg">
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Version</span>
                      <p className="text-base font-semibold mt-0.5 dark:text-white">{currentVersion || 'Unknown'}</p>
                    </div>
                    <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Information */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-3 dark:text-white">Project Information</h3>
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                  ProKZee is a proxy tool that allows you to intercept and analyze HTTP/HTTPS traffic and provides you with a comprehensive set of tools to fasilitate your pentesting and bug bounty efforts.
                  </p>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 dark:bg-dark-accent rounded-lg">
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Features</h4>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Intercept HTTP/HTTPS traffic
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Resend requests
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Analyze traffic with LLM
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Listen to Interactsh
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          And more...
                        </li>
                      </ul>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-dark-accent rounded-lg">
                      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Technologies</h4>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          React & TypeScript
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Go
                        </li>
                        <li className="flex items-center">
                          <Check className="w-3 h-3 mr-2 text-green-500" />
                          Wails Framework
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Support & Links */}
              <div className="bg-white dark:bg-dark-secondary p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-3 dark:text-white">Support & Resources</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <a
                    href=""
                    onClick={(e) => {
                      e.preventDefault()
                      BrowserOpenURL("https://github.com/al-sultani/prokzee/blob/main/docs/USER_GUIDE.md")
                    }}
                    className="flex items-center p-3 bg-gray-50 dark:bg-dark-accent rounded-lg hover:bg-gray-100 dark:hover:bg-dark-primary transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mr-3">
                      <Info className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium dark:text-white">Documentation</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">View user guides and API docs</p>
                    </div>
                  </a>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      BrowserOpenURL("https://github.com/al-sultani/prokzee/issues")
                    }}
                    className="flex items-center p-3 bg-gray-50 dark:bg-dark-accent rounded-lg hover:bg-gray-100 dark:hover:bg-dark-primary transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mr-3">
                      <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium dark:text-white">Support</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Get help and report issues</p>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <Settings className="w-16 h-16 mb-4" />
            <span className="text-lg">Select a setting section to configure</span>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen text-gray-800 dark:text-white bg-gray-100 dark:bg-dark-primary">
      <aside className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary shadow-md">
        <div className="flex justify-between items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Settings</h1>
        </div>
        <div className="h-[calc(100vh-64px)] overflow-y-auto">
          <button
            className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
              activeSection === "general" ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
            }`}
            onClick={() => setActiveSection("general")}
          >
            <span className="flex items-center">
              <Settings className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium dark:text-white">General Settings</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </button>
          <button
            className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
              activeSection === "theme" ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
            }`}
            onClick={() => setActiveSection("theme")}
          >
            <span className="flex items-center">
              <Palette className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium dark:text-white">Theme Settings</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </button>
          <button
            className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
              activeSection === "about" ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
            }`}
            onClick={() => setActiveSection("about")}
          >
            <span className="flex items-center">
              <Info className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium dark:text-white">About</span>
            </span>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
          </button>
        </div>
      </aside>
      <main className="flex-grow flex flex-col">
        <header className="flex justify-between items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white"></h2>
          <div className="flex space-x-4">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              <Save className="w-4 h-4 mr-2 inline" />
              Save
            </button>
          </div>
        </header>
        <div className="flex-grow overflow-y-auto h-[calc(100vh-64px)] bg-white dark:bg-dark-primary">
          <div className="p-6 md:p-8">{renderSection(activeSection as string)}</div>
        </div>
      </main>
    </div>
  )
}

export default SettingsPage

