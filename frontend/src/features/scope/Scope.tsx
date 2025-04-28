"use client"

import type React from "react"
import { useContext } from "react"
import { ScopeContext } from "../../contexts/ScopeContext"
import { Save } from "lucide-react"

const ScopePage: React.FC = () => {
  const scopeContext = useContext(ScopeContext)

  if (!scopeContext) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-dark-primary">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-blue-500"></div>
      </div>
    )
  }

  const { inScope, outOfScope, setInScope, setOutOfScope, saveScopeLists } = scopeContext

  const inScopeCount = inScope.split("\n").filter((line) => line.trim() !== "").length
  const outOfScopeCount = outOfScope.split("\n").filter((line) => line.trim() !== "").length

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-dark-primary">
      <header className="bg-white dark:bg-dark-secondary shadow-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Scope Configuration</h1>
          <div className="flex items-center space-x-6">
            <div className="text-sm text-gray-600 dark:text-gray-300 flex space-x-4">
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-3 py-1 rounded-full">In-scope: {inScopeCount}</span>
              <span className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 px-3 py-1 rounded-full">Out-of-scope: {outOfScopeCount}</span>
            </div>
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition duration-150 ease-in-out"
              onClick={saveScopeLists}
            >
              <Save className="h-5 w-5 mr-2" />
              Save Scope
            </button>
          </div>
        </div>
      </header>
      <main className="flex-grow p-6 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">In Scope</h2>
            <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-md p-4 h-[calc(100vh-220px)]">
              <textarea
                className="w-full h-full p-2 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-0 resize-none focus:ring-0 focus:outline-none"
                value={inScope}
                onChange={(e) => setInScope(e.target.value)}
                placeholder="Enter in-scope URLs or patterns (one per line)"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Out of Scope</h2>
            <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-md p-4 h-[calc(100vh-220px)]">
              <textarea
                className="w-full h-full p-2 text-sm text-gray-700 dark:text-gray-300 bg-transparent border-0 resize-none focus:ring-0 focus:outline-none"
                value={outOfScope}
                onChange={(e) => setOutOfScope(e.target.value)}
                placeholder="Enter out-of-scope URLs or patterns (one per line)"
                autoComplete="off"
                spellCheck="false"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ScopePage
