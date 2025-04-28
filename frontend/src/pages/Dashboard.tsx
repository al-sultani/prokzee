"use client"

import React from "react"
import { useEffect, useState } from "react"
import { EventsOn, EventsEmit, EventsOff } from "../../wailsjs/runtime/runtime"
import { LayoutDashboard, BarChart2, Folder, Database, PlusCircle, AlertCircle, CheckCircle2 } from "lucide-react"
import { useTheme } from "../contexts/ThemeContext"

interface Settings {
  project_name: string
  created_at: string
}

interface LogEntry {
  id: number
  timestamp: string
  level: string
  message: string
  source: string
  details?: string // Optional field for expanded details
}

// Add new interface for paginated response
interface PaginatedLogs {
  logs: LogEntry[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

const Dashboard: React.FC = () => {
  const { theme } = useTheme()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [logFilter, setLogFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [logsPerPage, setLogsPerPage] = useState<number>(50)
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null)
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "ascending" | "descending" }>({
    key: "timestamp",
    direction: "descending",
  })
  const [projectName, setProjectName] = useState<string>("")
  const [dbName, setdbName] = useState<string>("")
  const [projects, setProjects] = useState<string[]>([])
  const [newProjectName, setNewProjectName] = useState<string>("")
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [successMessage, setSuccessMessage] = useState<string>("")
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false)
  const [projectCreatedAt, setProjectCreatedAt] = useState<string>("")
  const [totalLogs, setTotalLogs] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSwitchingProject, setIsSwitchingProject] = useState<boolean>(false)

  useEffect(() => {
    const handleLogs = (data: PaginatedLogs) => {
      // Only update logs if we have valid data with logs
      if (data && data.logs && data.logs.length > 0) {
        setLogs(data.logs)
        setTotalLogs(data.totalCount || 0)
        setTotalPages(data.totalPages || 1)
        setFilteredLogs(data.logs)
      } else if (data && data.totalCount === 0) {
        // Only clear logs if we explicitly know there are no logs
        setLogs([])
        setTotalLogs(0)
        setTotalPages(1)
        setFilteredLogs([])
      }
      // In all cases, we're no longer loading
      setIsLoading(false)
    }
    const handleSettings = (data: Settings) => {
      setProjectName(data.project_name)
      setProjectCreatedAt(data.created_at)
    }
    const handleListProjects = (data: { projects?: string[]; error?: string }) => {
      if (data.projects) {
        // Filter out default_project.db from the list
        // TODO: Remove this once we have a better way to handle the default project
        const filteredProjects = data.projects.filter(project => project !== "default_project.db")
        setProjects(filteredProjects)
      } else {
        console.error("Failed to list projects:", data.error)
      }
    }
    const handleSwitchProject = (data: { success: boolean; projectName?: string; error?: string }) => {
      if (data.success) {
        console.log("Project switched successfully!")
        setProjectName(data.projectName || "")
        EventsEmit("frontend:getLogs", {
          page: currentPage,
          perPage: logsPerPage,
          filter: logFilter,
          search: searchQuery,
          sortKey: sortConfig.key,
          sortDirection: sortConfig.direction
        })
        EventsEmit("frontend:fetchSettings")
      } else {
        console.error("Failed to switch project:", data.error)
      }
      setIsSwitchingProject(false)
    }
    const handleCreateNewProject = (data: { success: boolean; error?: string }) => {
      setIsCreatingProject(false)
      if (data.success) {
        setSuccessMessage("New project created successfully!")
        EventsEmit("frontend:listProjects")
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(""), 5000)
      } else {
        setErrorMessage(`Failed to create new project: ${data.error}`)
        setTimeout(() => setErrorMessage(""), 5000)
      }
    }

    EventsOn("backend:logs", handleLogs)
    EventsOn("backend:fetchSettings", handleSettings)
    EventsOn("backend:listProjects", handleListProjects)
    EventsOn("backend:switchProject", handleSwitchProject)
    EventsOn("backend:createNewProject", handleCreateNewProject)

    const fetchData = () => {
      if (projectName) {
        setIsLoading(true)
        EventsEmit("frontend:getLogs", {
          page: currentPage,
          perPage: logsPerPage,
          filter: logFilter,
          search: searchQuery,
          sortKey: sortConfig.key,
          sortDirection: sortConfig.direction
        })
      }
      EventsEmit("frontend:fetchSettings")
      EventsEmit("frontend:listProjects")
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)

    return () => {
      clearInterval(interval)
      // Clean up event listeners
      EventsOff("backend:logs")
      EventsOff("backend:fetchSettings")
      EventsOff("backend:listProjects")
      EventsOff("backend:switchProject")
      EventsOff("backend:createNewProject")
    }
  }, [projectName, currentPage, logsPerPage, logFilter, searchQuery, sortConfig])

  const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newProjectName = event.target.value
    setdbName(newProjectName)
    setIsSwitchingProject(true)
    console.log("Switching project to:", newProjectName)
    EventsEmit("frontend:switchProject", newProjectName)
  }

  const handleCreateNewProject = () => {
    const trimmedName = newProjectName.trim()
    if (trimmedName === "") {
      setErrorMessage("Project name cannot be empty")
      setSuccessMessage("")
      setTimeout(() => setErrorMessage(""), 5000)
      return
    }

    // Check if the project name contains only allowed characters
    const validNameRegex = /^[A-Za-z0-9 ]+$/
    if (!validNameRegex.test(trimmedName)) {
      setErrorMessage("Project name can only contain A-Z, a-z, 0-9, and spaces")
      setSuccessMessage("")
      setTimeout(() => setErrorMessage(""), 5000)
      return
    }

    // Clear any previous messages
    setErrorMessage("")
    setSuccessMessage("")
    setIsCreatingProject(true)
    EventsEmit("frontend:createNewProject", trimmedName)
    setNewProjectName("")
  }

  const handleSort = (key: string) => {
    setSortConfig((prevConfig) => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === "ascending" ? "descending" : "ascending",
    }))
  }

  const toggleLogDetails = (id: number) => {
    setExpandedLogId((prevId) => (prevId === id ? null : id))
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-dark-primary border border-slate-200 dark:border-gray-700">
      {isSwitchingProject && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-dark-secondary rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
            <div className="w-12 h-12 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">Switching Project...</p>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 h-full overflow-hidden flex flex-col">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
              <LayoutDashboard className="h-8 w-8 text-indigo-600" />
              Dashboard
            </h1>
            <div className="text-sm text-slate-500 dark:text-gray-400 bg-white dark:bg-dark-secondary px-4 py-2 rounded-full shadow-sm border border-slate-200 dark:border-gray-700">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white dark:bg-dark-secondary p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-slate-700 dark:text-white flex items-center gap-2 mb-4">
              <Folder className="h-6 w-6 text-indigo-600" />
              Project Management
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-600 dark:text-gray-300">Current Project</label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-dark-accent rounded-lg border border-indigo-100 dark:border-gray-700">
                    <Folder className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-lg font-semibold text-indigo-700 dark:text-white">
                      {projectName || "No project selected"}
                    </span>
                  </div>
                  {projectCreatedAt && (
                    <div className="text-sm text-slate-500 dark:text-gray-400">Created: {new Date(projectCreatedAt).toLocaleString()}</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="project-select" className="block text-sm font-medium text-slate-600 dark:text-gray-300">
                  Switch Project
                </label>
                <div className="relative">
                  <select
                    id="project-select"
                    onChange={handleProjectChange}
                    value={dbName}
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="" disabled>
                      Select a project
                    </option>
                    {projects.map((project, index) => (
                      <option key={index} value={project}>
                        {project}
                      </option>
                    ))}
                  </select>
                  <Database className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-secondary p-6 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-slate-700 dark:text-white flex items-center gap-2 mb-4">
              <PlusCircle className="h-6 w-6 text-indigo-600" />
              Create New Project
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="new-project" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Project Name
                </label>
                <input
                  id="new-project"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter new project name"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleCreateNewProject}
                disabled={isCreatingProject}
                className={`w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium transition-colors ${
                  isCreatingProject ? "opacity-70 cursor-not-allowed" : "hover:bg-indigo-700"
                }`}
              >
                {isCreatingProject ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-5 w-5" />
                    Create Project
                  </>
                )}
              </button>

              {errorMessage && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-dark-accent p-3 rounded-lg border border-red-100 dark:border-red-800">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">{errorMessage}</p>
                </div>
              )}

              {successMessage && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-dark-accent p-3 rounded-lg border border-green-100 dark:border-green-800">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  <p className="text-sm">{successMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col h-[calc(100vh-26rem)] mb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h2 className="text-xl font-semibold text-slate-700 dark:text-white">System Logs</h2>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative flex-grow">
                <input
                  type="text"
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-slate-400 dark:text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2"
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
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
              >
                <option value="all">All Levels</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>
              <select
                className="px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg text-sm text-slate-800 dark:text-white bg-white dark:bg-dark-accent focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                value={logsPerPage}
                onChange={(e) => setLogsPerPage(Number(e.target.value))}
              >
                <option value="5">5 per page</option>
                <option value="10">10 per page</option>
                <option value="25">25 per page</option>
                <option value="50">50 per page</option>
              </select>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-secondary rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden flex-1 flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
                <thead className="bg-slate-50 dark:bg-dark-accent sticky top-0 z-10">
                  <tr>
                    <th
                      className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-primary"
                      onClick={() => handleSort("timestamp")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Time
                        {sortConfig.key === "timestamp" && (
                          <span>{sortConfig.direction === "ascending" ? "↑" : "↓"}</span>
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-primary"
                      onClick={() => handleSort("level")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Level
                        {sortConfig.key === "level" && <span>{sortConfig.direction === "ascending" ? "↑" : "↓"}</span>}
                      </div>
                    </th>
                    <th
                      className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-dark-primary"
                      onClick={() => handleSort("source")}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Source
                        {sortConfig.key === "source" && <span>{sortConfig.direction === "ascending" ? "↑" : "↓"}</span>}
                      </div>
                    </th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wider">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dark-secondary divide-y divide-slate-200 dark:divide-gray-700">
                  {filteredLogs && filteredLogs.length > 0 ? (
                    filteredLogs.map((log) => (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-slate-50 dark:hover:bg-dark-accent transition-colors cursor-pointer ${expandedLogId === log.id ? "bg-slate-50 dark:bg-dark-accent" : ""}`}
                          onClick={() => toggleLogDetails(log.id)}
                        >
                          <td className="px-4 py-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-1.5 whitespace-nowrap text-xs">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium
                                ${
                                  log.level.toLowerCase() === "error"
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                                    : log.level.toLowerCase() === "warning"
                                      ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300"
                                      : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                                }`}
                            >
                              {log.level}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 whitespace-nowrap text-xs text-slate-600 dark:text-gray-300">{log.source}</td>
                          <td className="px-4 py-1.5 text-xs text-slate-600 dark:text-gray-300 truncate max-w-xs">
                            <div className="flex items-center justify-between">
                              <span className="truncate">{log.message}</span>
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className={`h-4 w-4 text-slate-400 dark:text-gray-400 transition-transform ${expandedLogId === log.id ? "transform rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </td>
                        </tr>
                        {expandedLogId === log.id && (
                          <tr className="bg-slate-50 dark:bg-dark-accent">
                            <td colSpan={4} className="px-4 py-2">
                              <div className="bg-slate-100 dark:bg-dark-primary p-2 rounded-lg border border-slate-200 dark:border-gray-700 whitespace-pre-wrap break-words">
                                <p className="text-xs font-mono text-slate-700 dark:text-gray-300">{log.message}</p>
                                {log.details && (
                                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-gray-700">
                                    <p className="text-xs font-medium text-slate-500 dark:text-gray-400 mb-1">Additional Details:</p>
                                    <p className="text-xs font-mono text-slate-700 dark:text-gray-300">{log.details}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500 dark:text-gray-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="h-5 w-5 text-slate-400 dark:text-gray-400" />
                          {isLoading ? (
                            <p className="text-sm">Loading logs...</p>
                          ) : (
                            <p className="text-sm">No logs found matching your filters</p>
                          )}
                          {(logFilter !== "all" || searchQuery !== "") && (
                            <button
                              onClick={() => {
                                setLogFilter("all")
                                setSearchQuery("")
                              }}
                              className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-medium mt-1"
                            >
                              Clear filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filteredLogs && filteredLogs.length > 0 && (
              <div className="px-4 py-2 flex items-center justify-between border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-dark-accent">
                <div className="text-xs text-slate-500 dark:text-gray-400">
                  Showing {Math.min(totalLogs, (currentPage - 1) * logsPerPage + 1)} to{" "}
                  {Math.min(totalLogs, currentPage * logsPerPage)} of {totalLogs} logs
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                  <span className="text-xs text-slate-600 dark:text-gray-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="h-4"></div> {/* This adds a small space at the bottom */}
    </div>
  )
}

export default Dashboard