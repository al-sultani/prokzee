"use client"

import type React from "react"
import { Clipboard, Play, Square, ChevronRight, Pause, RefreshCw } from "lucide-react"
import { useListener } from "../../contexts/ListenerContext"
import { useTheme } from "../../contexts/ThemeContext"
import { useSettings } from "../../contexts/SettingsContext"

interface InteractionData {
  protocol: string
  "unique-id": string
  "full-id": string
  "raw-request": string
  "raw-response": string
  "remote-address": string
  timestamp: string
}

const Listener: React.FC = () => {
  const {
    interactions,
    domain,
    isListening,
    isPaused,
    selectedInteraction,
    toastMessage,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    generateNewDomain,
    copyToClipboard,
    setSelectedInteraction,
    registrationAttempted,
    registrationError,
  } = useListener();
  const { theme } = useTheme();
  const { isInteractshConfigured, isInteractshRegistered } = useSettings();

  const parseInteractionData = (data: string): InteractionData | null => {
    try {
      return JSON.parse(data)
    } catch (error) {
      console.error("Failed to parse interaction data:", error)
      return null
    }
  }

  const getButtonTitle = () => {
    if (!isInteractshConfigured) {
      return "Please configure Interactsh host and port in settings";
    }
    if (registrationError) {
      return registrationError;
    }
    if (!isInteractshRegistered && !isListening && registrationAttempted) {
      return "Registration with Interactsh server pending";
    }
    return "";
  };

  const isButtonDisabled = !isInteractshConfigured;

  return (
    <div className="flex h-screen text-gray-800 dark:text-white bg-gray-100 dark:bg-dark-primary">
      <aside className="w-80 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-secondary shadow-md">
        <div className="flex justify-between items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-accent">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Interactions</h1>
        </div>
        <div className="h-[calc(100vh-64px)] overflow-y-auto">
          {interactions.map((interaction) => (
            <button
              key={interaction.id}
              className={`w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
                selectedInteraction?.id === interaction.id ? "bg-blue-50 dark:bg-blue-900 border-l-4 border-blue-500" : ""
              }`}
              onClick={() => setSelectedInteraction(interaction)}
            >
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{new Date(interaction.timestamp).toLocaleString()}</span>
              <ChevronRight className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </button>
          ))}
        </div>
      </aside>
      <main className="flex-grow flex flex-col">
        <header className="flex items-center h-16 px-6 bg-white dark:bg-dark-secondary border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex-grow">
            {isListening && (
              <div className="flex items-center space-x-4">
                <input
                  type="text"
                  value={domain}
                  readOnly
                  className="px-3 py-2 bg-gray-100 dark:bg-dark-accent text-gray-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300 ease-in-out"
                  style={{ width: `${domain.length * 8 + 32}px`, minWidth: "200px" }}
                  aria-label="Domain"
                />
                <button
                  onClick={copyToClipboard}
                  className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Copy Domain"
                >
                  <Clipboard className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                </button>
                <button
                  onClick={generateNewDomain}
                  className="p-2 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Generate New Domain"
                  title="Generate new domain"
                >
                  <RefreshCw className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            {isListening && (
              <button
                onClick={isPaused ? resumeListening : pauseListening}
                className={`px-4 py-2 rounded-md flex items-center text-white font-medium transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  isPaused
                    ? "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500"
                    : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                }`}
                title={isPaused ? "Resume listening" : "Pause listening"}
              >
                {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
            )}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isButtonDisabled}
              className={`px-4 py-2 rounded-md flex items-center text-white font-medium transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isListening
                  ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
                  : !isButtonDisabled
                  ? "bg-green-600 hover:bg-green-700 focus:ring-green-500"
                  : "bg-gray-400 cursor-not-allowed"
              }`}
              title={getButtonTitle()}
            >
              {isListening ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              <span className="ml-2">{isListening ? "Stop" : "Start"}</span>
            </button>
          </div>
        </header>
        <div className="flex-grow p-6 overflow-y-auto h-[calc(100vh-64px)] bg-gray-50 dark:bg-dark-primary">
          {selectedInteraction ? (
            <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-lg p-6 transition-all duration-300 ease-in-out">
              <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white border-b pb-2">Interaction Details</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white dark:bg-dark-secondary border-collapse">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-dark-accent">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Field
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {Object.entries(parseInteractionData(selectedInteraction.data) || {}).map(([key, value]) => (
                      <tr key={key} className="hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors duration-150 ease-in-out">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">{key}</td>
                        <td className="px-6 py-4 text-left text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap break-words max-w-xl">
                          {value as string}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-500 dark:text-gray-400 text-lg">Select an interaction to view details</span>
            </div>
          )}
        </div>
      </main>
      {(toastMessage || registrationError) && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-md shadow-lg transition-all duration-300 ease-in-out ${
          registrationError 
            ? "bg-red-600 text-white" 
            : "bg-gray-800 dark:bg-gray-700 text-white"
        }`}>
          {registrationError || toastMessage}
        </div>
      )}
    </div>
  )
}

export default Listener

