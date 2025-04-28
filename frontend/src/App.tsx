import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Network, GitGraph, Filter, History, Ruler, Repeat, Zap, Brain, Radio, Puzzle, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import "./styles/App.css";
import "prismjs/themes/prism.css";
import appIcon from './assets/images/appicon.png';
import { Dashboard, LandingPage, Settings as SettingsPage } from "./pages";
import Intercept from "./features/intercept";
import RequestsHistory from "./features/history";
import InterceptionRules from "./features/rules";
import Resender from "./features/resender";
import Scope from "./features/scope";
import Fuzzer from "./features/fuzzer";
import LLMAnalyzer from "./features/llm-analyzer";
import Listener from "./features/listener";
import Plugins from "./features/plugins";
import SiteMap from "./features/sitemap";
import { RequestQueueProvider, useRequestQueue } from "./contexts";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";
import { ThemeProvider } from "./contexts";
import { ContextMenuProvider } from "./components/ContextMenuManager";
import { SettingsProvider } from "./contexts/SettingsContext";
import { InterceptProvider } from "./contexts/IntercpetContext";

function NavigationContent({ onNameSubmit }: { onNameSubmit: (name: string) => void }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSidebarFixed, setIsSidebarFixed] = useState<boolean>(false);
  const { addRequestToQueue } = useRequestQueue();
  const location = useLocation();

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  const toggleSidebarFixed = () => {
    setIsSidebarFixed((prev) => !prev);
  };

  useEffect(() => {
    const handleApprovalRequest = (data: any) => {
      const approvalData = {
        requestID: data.requestID,
        details: {
          url: data.details.url,
          headers: data.details.headers,
          body: data.details.body,
          method: data.details.method,
          protocolVersion: data.details.protocolVersion,
          status: data.details.status,
        },
      };
      console.log("Adding request to queue:", approvalData);
      addRequestToQueue(approvalData);
    };

    EventsOn("app:requestApproval", handleApprovalRequest);

    return () => {
      EventsOff("app:requestApproval");
    };
  }, [addRequestToQueue]);

  const getLinkClassName = (path: string) => {
    const isActive = location.pathname === path;
    return `${isActive ? 'bg-gray-700/80 dark:bg-dark-accent/80 ' : ''}hover:bg-gray-700/50 dark:hover:bg-dark-accent/50 flex items-center px-2 py-1.5 rounded-md text-sm text-gray-300 dark:text-gray-200 transition-colors duration-200`;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-dark-primary text-gray-900 dark:text-gray-100">
      <div className={`${
        isSidebarCollapsed ? "w-16" : "w-48"
      } bg-gray-800 dark:bg-dark-secondary text-white flex flex-col transition-all duration-300 ease-in-out border-r border-gray-700 dark:border-gray-600 shadow-lg ${
        isSidebarFixed ? "fixed h-full" : ""
      }`}>
        <div className="p-4 text-lg font-bold flex justify-between items-center border-b border-gray-700/50 dark:border-gray-600/50 bg-gray-900/50 dark:bg-dark-accent/30">
          {!isSidebarCollapsed && (
           <div className="flex items-center gap-2">
            ProKZee
           </div>
          )}
          <button onClick={toggleSidebar} className="text-white hover:bg-gray-700 dark:hover:bg-dark-accent p-1.5 rounded-md transition-colors duration-200">
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <nav className="flex-1 py-2">
          <div className="space-y-3">
            {!isSidebarCollapsed && <h2 className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Overview</h2>}
            <ul className="space-y-1 px-2">
              <li>
                <Link to="/" className={getLinkClassName("/")} title={isSidebarCollapsed ? "Dashboard" : ""}>
                  <LayoutDashboard size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Dashboard</span>}
                </Link>
              </li>
              <li>
                <Link to="/Sitemap" className={getLinkClassName("/Sitemap")} title={isSidebarCollapsed ? "Sitemap" : ""}>
                  <GitGraph size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Sitemap</span>}
                </Link>
              </li>
              <li>
                <Link to="/scope" className={getLinkClassName("/scope")} title={isSidebarCollapsed ? "Scope" : ""}>
                  <Network size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Scope</span>}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3 mt-4">
            {!isSidebarCollapsed && <h2 className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Proxy</h2>}
            <ul className="space-y-1 px-2">
              <li>
                <Link to="/proxy-tool" className={getLinkClassName("/proxy-tool")} title={isSidebarCollapsed ? "Intercept" : ""}>
                  <Filter size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Intercept</span>}
                </Link>
              </li>
              <li>
                <Link to="/http-history" className={getLinkClassName("/http-history")} title={isSidebarCollapsed ? "HTTP history" : ""}>
                  <History size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">HTTP history</span>}
                </Link>
              </li>
              <li>
                <Link to="/rules" className={getLinkClassName("/rules")} title={isSidebarCollapsed ? "Rules" : ""}>
                  <Ruler size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Rules</span>}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3 mt-4">
            {!isSidebarCollapsed && <h2 className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Functions</h2>}
            <ul className="space-y-1 px-2">
              <li>
                <Link to="/resender" className={getLinkClassName("/resender")} title={isSidebarCollapsed ? "Re-sender" : ""}>
                  <Repeat size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Re-sender</span>}
                </Link>
              </li>
              <li>
                <Link to="/fuzzer" className={getLinkClassName("/fuzzer")} title={isSidebarCollapsed ? "Fuzzer" : ""}>
                  <Zap size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Fuzzer</span>}
                </Link>
              </li>
              <li>
                <Link to="/llm-analyzer" className={getLinkClassName("/llm-analyzer")} title={isSidebarCollapsed ? "LLM analyzer" : ""}>
                  <Brain size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">LLM analyzer</span>}
                </Link>
              </li>
              <li>
                <Link to="/listener" className={getLinkClassName("/listener")} title={isSidebarCollapsed ? "Listener" : ""}>
                  <Radio size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Listener</span>}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3 mt-4">
            {!isSidebarCollapsed && <h2 className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Plugins</h2>}
            <ul className="space-y-1 px-2">
              <li>
                <Link to="/plugin" className={getLinkClassName("/plugin")} title={isSidebarCollapsed ? "Manage" : ""}>
                  <Puzzle size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Manage</span>}
                </Link>
              </li>
            </ul>
          </div>
          <div className="space-y-3 mt-4">
            {!isSidebarCollapsed && <h2 className="px-4 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Settings</h2>}
            <ul className="space-y-1 px-2">
              <li>
                <Link to="/settings" className={getLinkClassName("/settings")} title={isSidebarCollapsed ? "Settings" : ""}>
                  <Settings size={20} />
                  {!isSidebarCollapsed && <span className="ml-3">Settings</span>}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </div>
      <div className={`flex-1 overflow-hidden ${isSidebarFixed ? "ml-16" : ""}`}>
        <div className="flex-1 overflow-auto bg-white dark:bg-dark-primary">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scope" element={<Scope />} />
            <Route path="/Sitemap" element={<SiteMap />} />
            <Route path="/proxy-tool" element={<Intercept />} />
            <Route path="/http-history" element={<RequestsHistory />} />
            <Route path="/rules" element={<InterceptionRules />} />
            <Route path="/resender" element={<Resender/>} />
            <Route path="/fuzzer" element={<Fuzzer />} />
            <Route path="/llm-analyzer" element={<LLMAnalyzer />} />
            <Route path="/listener" element={<Listener />} />
            <Route path="/plugin" element={<Plugins />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [isNameSubmitted, setIsNameSubmitted] = useState<boolean>(false);

  const handleNameSubmit = (name: string) => {
    setIsNameSubmitted(true);
  };

  if (!isNameSubmitted) {
    return <LandingPage onNameSubmit={handleNameSubmit} />;
  }

  return (
    <Router>
      <NavigationContent onNameSubmit={handleNameSubmit} />
    </Router>
  );
}

const AppWrapper = () => (
  <ThemeProvider>
    <SettingsProvider>
      <RequestQueueProvider>
        <InterceptProvider>
          <ContextMenuProvider>
            <App />
          </ContextMenuProvider>
        </InterceptProvider>
      </RequestQueueProvider>
    </SettingsProvider>
  </ThemeProvider>
);

export default AppWrapper;