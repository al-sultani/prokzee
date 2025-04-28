"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import { EventsOn, EventsEmit, EventsOff } from "../../../wailsjs/runtime/runtime"
import { PlusCircle, Trash2, Ruler, ChevronRight, X, Search, ChevronDown } from "lucide-react"
import { ErrorBoundary } from "react-error-boundary"
import { useTheme } from '../../contexts/ThemeContext'

interface Rule {
  id: number
  rule_name: string
  operator: string
  match_type: string
  relationship: string
  pattern: string
  enabled: boolean
}

interface MatchReplaceRule {
  id: number
  rule_name: string
  match_type: string
  match_content: string
  replace_content: string
  target: string
  enabled: boolean
}

const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg mb-8" role="alert">
    <p className="font-bold">Error</p>
    <p>{error.message}</p>
  </div>
)

const InterceptionRules: React.FC = () => {
  const { theme } = useTheme()
  const [rules, setRules] = useState<Rule[]>([])
  const [matchReplaceRules, setMatchReplaceRules] = useState<MatchReplaceRule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false)
  const [isMatchReplaceRuleModalOpen, setIsMatchReplaceRuleModalOpen] = useState(false)
  const [newRule, setNewRule] = useState<Partial<Rule>>({
    rule_name: "",
    operator: "and",
    match_type: "url",
    relationship: "matches",
    pattern: "",
    enabled: true,
  })
  const [newMatchReplaceRule, setNewMatchReplaceRule] = useState<Partial<MatchReplaceRule>>({
    rule_name: "",
    match_type: "header",
    match_content: "",
    replace_content: "",
    target: "request",
    enabled: true,
  })
  const [selectedRule, setSelectedRule] = useState<Rule | MatchReplaceRule | null>(null)
  const [activeTab, setActiveTab] = useState<"rules" | "matchReplace">("rules")
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        EventsOn("backend:allRules", (data: { error?: string; rules?: Rule[] }) => {
          if (data.error) {
            setError(data.error)
          } else if (data.rules) {
            setRules(data.rules)
          }
        })

        EventsOn("backend:allMatchReplaceRules", (data: { error?: string; rules?: MatchReplaceRule[] }) => {
          if (data.error) {
            setError(data.error)
          } else if (data.rules) {
            setMatchReplaceRules(data.rules)
          }
        })

        await Promise.all([EventsEmit("frontend:getAllRules"), EventsEmit("frontend:getAllMatchReplaceRules")])
      } catch (err) {
        setError("Failed to fetch rules. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    return () => {
      EventsOff("backend:allRules")
      EventsOff("backend:allMatchReplaceRules")
    }
  }, [])

  const handleAddRule = useCallback(() => {
    const newRuleWithID: Rule = {
      id: Date.now(),
      rule_name: newRule.rule_name ?? "",
      operator: newRule.operator ?? "and",
      match_type: newRule.match_type ?? "url",
      relationship: newRule.relationship ?? "matches",
      pattern: newRule.pattern ?? "",
      enabled: newRule.enabled ?? true,
    }
    EventsEmit("frontend:addRule", newRuleWithID)
    setRules((prevRules) => [...prevRules, newRuleWithID])
    setNewRule({
      rule_name: "",
      operator: "and",
      match_type: "url",
      relationship: "matches",
      pattern: "",
      enabled: true,
    })
    setIsRuleModalOpen(false)
  }, [newRule])

  const handleAddMatchReplaceRule = useCallback(() => {
    const newMatchReplaceRuleWithID: MatchReplaceRule = {
      id: Date.now(),
      rule_name: newMatchReplaceRule.rule_name ?? "",
      match_type: newMatchReplaceRule.match_type ?? "header",
      match_content: newMatchReplaceRule.match_content ?? "",
      replace_content: newMatchReplaceRule.replace_content ?? "",
      target: newMatchReplaceRule.target ?? "request",
      enabled: newMatchReplaceRule.enabled ?? true,
    }
    EventsEmit("frontend:addMatchReplaceRule", newMatchReplaceRuleWithID)
    setMatchReplaceRules((prevRules) => [...prevRules, newMatchReplaceRuleWithID])
    setNewMatchReplaceRule({
      rule_name: "",
      match_type: "header",
      match_content: "",
      replace_content: "",
      target: "request",
      enabled: true,
    })
    setIsMatchReplaceRuleModalOpen(false)
  }, [newMatchReplaceRule])

  const handleDeleteRule = useCallback((id: number) => {
    EventsEmit("frontend:deleteRule", id)
    setRules((prevRules) => prevRules.filter((rule) => rule.id !== id))
    setSelectedRule(null)
  }, [])

  const handleDeleteMatchReplaceRule = useCallback((id: number) => {
    EventsEmit("frontend:deleteMatchReplaceRule", id)
    setMatchReplaceRules((prevRules) => prevRules.filter((rule) => rule.id !== id))
    setSelectedRule(null)
  }, [])

  const handleUpdateRule = useCallback((updatedRule: Rule) => {
    EventsEmit("frontend:updateRule", updatedRule)
    setRules((prevRules) => prevRules.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule)))
    setSelectedRule(updatedRule)
  }, [])

  const handleUpdateMatchReplaceRule = useCallback((updatedRule: MatchReplaceRule) => {
    // Convert PascalCase to snake_case for backend compatibility
    const backendRule = {
      id: updatedRule.id,
      rule_name: updatedRule.rule_name,
      match_type: updatedRule.match_type,
      match_content: updatedRule.match_content,
      replace_content: updatedRule.replace_content,
      target: updatedRule.target,
      enabled: updatedRule.enabled
    }
    EventsEmit("frontend:updateMatchReplaceRule", backendRule)
    setMatchReplaceRules((prevRules) => prevRules.map((rule) => (rule.id === updatedRule.id ? updatedRule : rule)))
    setSelectedRule(updatedRule)
  }, [])

  const filteredRules =
    activeTab === "rules"
      ? rules.filter((rule) => rule.rule_name.toLowerCase().includes(searchTerm.toLowerCase()))
      : matchReplaceRules.filter((rule) => rule.rule_name.toLowerCase().includes(searchTerm.toLowerCase()))

  const isRule = (rule: Rule | MatchReplaceRule): rule is Rule => {
    return 'operator' in rule && 'relationship' in rule && 'pattern' in rule;
  }

  const isMatchReplaceRule = (rule: Rule | MatchReplaceRule): rule is MatchReplaceRule => {
    return 'match_content' in rule && 'replace_content' in rule && 'target' in rule;
  }

  const renderRuleDetails = (rule: Rule | MatchReplaceRule) => (
    <div className="bg-white dark:bg-dark-secondary rounded-lg shadow-lg p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-white">{rule.rule_name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isRule(rule) ? "Interception Rule" : "Match & Replace"}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() =>
              isRule(rule)
                ? handleUpdateRule({ ...rule, enabled: !rule.enabled })
                : handleUpdateMatchReplaceRule({ ...rule, enabled: !rule.enabled })
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              rule.enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                rule.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isRule(rule) ? (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Operator</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2">{rule.operator}</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Match Type</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2">{rule.match_type}</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Relationship</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2">{rule.relationship}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pattern</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2 break-words">
                {rule.pattern}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Match Type</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2">{rule.match_type}</p>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2">{rule.target}</p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Match Content</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2 break-words">
                {rule.match_content}
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Replace Content</label>
              <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-accent rounded-md px-3 py-2 break-words">
                {rule.replace_content}
              </p>
            </div>
          </>
        )}
      </div>
      <div className="mt-8 flex justify-center">
        <button
          className="px-4 py-2 text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center"
          onClick={() => (isRule(rule) ? handleDeleteRule(rule.id) : handleDeleteMatchReplaceRule(rule.id))}
        >
          <Trash2 className="w-5 h-5 mr-2" />
          Delete Rule
        </button>
      </div>
    </div>
  )

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex h-screen bg-gray-100 dark:bg-dark-primary">
        <aside className="w-80 bg-white dark:bg-dark-secondary border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Interception Rules</h1>
          </div>
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              className={`flex-1 py-2 px-4 text-center ${
                activeTab === "rules" ? "bg-blue-500 text-white font-semibold" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-accent"
              }`}
              onClick={() => setActiveTab("rules")}
            >
              Rules
            </button>
            <button
              className={`flex-1 py-2 px-4 text-center ${
                activeTab === "matchReplace"
                  ? "bg-blue-500 text-white font-semibold"
                  : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-accent"
              }`}
              onClick={() => setActiveTab("matchReplace")}
            >
              Match & Rep.
            </button>
          </div>
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <button
              className="w-full px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center justify-center"
              onClick={() => (activeTab === "rules" ? setIsRuleModalOpen(true) : setIsMatchReplaceRuleModalOpen(true))}
            >
              <PlusCircle className="w-5 h-5 mr-2" />
              Add New Rule
            </button>
          </div>
          <div className="p-4">
            <div className="relative">
              <input
                type="text"
                placeholder="Search rules..."
                className="w-full pl-10 pr-4 py-2 border text-black dark:text-white border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-accent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredRules.map((rule) => (
              <button
                key={rule.id}
                className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-accent transition-colors flex items-center justify-between ${
                  selectedRule?.id === rule.id ? "bg-blue-50 dark:bg-blue-900/50 border-l-4 border-blue-500" : ""
                }`}
                onClick={() => setSelectedRule(rule)}
              >
                <span className="flex items-center">
                  <Ruler size={20} className="text-black dark:text-white" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200 ml-2">{rule.rule_name}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </button>
            ))}
          </div>
        </aside>
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-dark-primary p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-4 rounded-lg mb-8" role="alert">
              <p className="font-bold">Error</p>
              <p>{error}</p>
            </div>
          ) : selectedRule ? (
            renderRuleDetails(selectedRule)
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-lg text-gray-500 dark:text-gray-400">Select a rule to view details</span>
            </div>
          )}
        </main>
      </div>

      {isRuleModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-secondary rounded-xl shadow-lg p-8 max-w-2xl w-full border border-slate-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-white">Add New Rule</h2>
              <button className="text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" onClick={() => setIsRuleModalOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label htmlFor="rule_name" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Rule Name
                </label>
                <input
                  id="rule_name"
                  type="text"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={newRule.rule_name}
                  onChange={(e) => setNewRule({ ...newRule, rule_name: e.target.value })}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="operator" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Operator
                </label>
                <div className="relative">
                  <select
                    id="operator"
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newRule.operator}
                    onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                  >
                    <option value="and">AND</option>
                    <option value="or">OR</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-5 h-5" />
                </div>
              </div>
              <div className="flex flex-col">
                <label htmlFor="matchType" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Match Type
                </label>
                <div className="relative">
                  <select
                    id="matchType"
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newRule.match_type}
                    onChange={(e) => setNewRule({ ...newRule, match_type: e.target.value })}
                  >
                    <option value="url">URL</option>
                    <option value="domain">Domain</option>
                    <option value="protocol">Protocol</option>
                    <option value="method">Method</option>
                    <option value="path">Path</option>
                    <option value="file_extension">File Extension</option>
                    <option value="header">Header</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-5 h-5" />
                </div>
              </div>
              <div className="flex flex-col">
                <label htmlFor="relationship" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Relationship
                </label>
                <div className="relative">
                  <select
                    id="relationship"
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newRule.relationship}
                    onChange={(e) => setNewRule({ ...newRule, relationship: e.target.value })}
                  >
                    <option value="matches">Matches</option>
                    <option value="doesn't match">Doesn't Match</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-5 h-5" />
                </div>
              </div>
              <div className="flex flex-col">
                <label htmlFor="pattern" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Pattern <span className="text-xs text-gray-500">(RegEx supported)</span>
                </label>
                <input
                  id="pattern"
                  type="text"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={newRule.pattern}
                  onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
              <button
                className="px-4 py-2 text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-dark-accent rounded-lg hover:bg-slate-200 dark:hover:bg-dark-primary focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
                onClick={() => setIsRuleModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                onClick={handleAddRule}
              >
                Add Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {isMatchReplaceRuleModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-secondary rounded-xl shadow-lg p-8 max-w-2xl w-full border border-slate-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-slate-800 dark:text-white">Add New Match and Replace Rule</h2>
              <button className="text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-300" onClick={() => setIsMatchReplaceRuleModalOpen(false)}>
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label htmlFor="rule_name" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Rule Name
                </label>
                <input
                  id="rule_name"
                  type="text"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={newMatchReplaceRule.rule_name}
                  onChange={(e) => setNewMatchReplaceRule({ ...newMatchReplaceRule, rule_name: e.target.value })}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="matchReplaceMatchType" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Match Type
                </label>
                <div className="relative">
                  <select
                    id="matchReplaceMatchType"
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newMatchReplaceRule.match_type}
                    onChange={(e) => setNewMatchReplaceRule({ ...newMatchReplaceRule, match_type: e.target.value })}
                  >
                    <option value="header">Header</option>
                    <option value="body">Body</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-5 h-5" />
                </div>
              </div>
              <div className="flex flex-col md:col-span-2">
                <label htmlFor="matchContent" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Match Content
                </label>
                <input
                  id="matchContent"
                  type="text"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={newMatchReplaceRule.match_content}
                  onChange={(e) => setNewMatchReplaceRule({ ...newMatchReplaceRule, match_content: e.target.value })}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex flex-col md:col-span-2">
                <label htmlFor="replaceContent" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Replace Content
                </label>
                <input
                  id="replaceContent"
                  type="text"
                  className="w-full p-3 border border-slate-300 dark:border-gray-600 rounded-lg text-slate-800 dark:text-white bg-white dark:bg-dark-accent placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  value={newMatchReplaceRule.replace_content}
                  onChange={(e) => setNewMatchReplaceRule({ ...newMatchReplaceRule, replace_content: e.target.value })}
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>
              <div className="flex flex-col">
                <label htmlFor="target" className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">
                  Target
                </label>
                <div className="relative">
                  <select
                    id="target"
                    className="w-full p-3 pr-10 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-dark-accent text-slate-800 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    value={newMatchReplaceRule.target}
                    onChange={(e) => setNewMatchReplaceRule({ ...newMatchReplaceRule, target: e.target.value })}
                  >
                    <option value="request">Request</option>
                    <option value="response">Response</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none w-5 h-5" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
              <button
                className="px-4 py-2 text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-dark-accent rounded-lg hover:bg-slate-200 dark:hover:bg-dark-primary focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
                onClick={() => setIsMatchReplaceRuleModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                onClick={handleAddMatchReplaceRule}
              >
                Add Match and Replace Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}

export default InterceptionRules

