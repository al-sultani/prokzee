import React, { createContext, useContext, useState, useEffect } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"

interface SequencePayload {
  type: "sequence";
  from: number;
  to: number;
  step: number;
}

interface ListPayload {
  type: "list";
  list: string[];
}

type Payload = SequencePayload | ListPayload;

interface FuzzerTab {
  id: number;
  name: string;
  targetUrl: string;
  method: string;
  path: string;
  httpVersion: string;
  headers: { [key: string]: string };
  body: string;
  payloads: Payload[];
}

interface FuzzerResult {
  payload: string;
  statusCode: string;
  responseLength: number;
  responseBody: string;
  contentType: string;
  responseHeaders: { [key: string]: string[] };
  rawStatusLine: string;
}

interface FuzzerContextType {
  FuzzerTabs: FuzzerTab[];
  activeFuzzerTab: number | null;
  results: { [tabId: number]: FuzzerResult[] };
  isRunning: boolean;
  runningTabId: number | null;
  FuzzerProgress: { [tabId: number]: number };
  setActiveFuzzerTab: (id: number | null) => void;
  addFuzzerTab: () => void;
  removeFuzzerTab: (id: number) => void;
  updateFuzzerTab: (id: number, updates: Partial<FuzzerTab>) => void;
  startFuzzer: (tabId: number) => void;
  stopFuzzer: () => void;
  updateTabName: (tabId: number, newName: string) => void;
}

const FuzzerContext = createContext<FuzzerContextType | undefined>(undefined);

export const useFuzzer = () => {
  const context = useContext(FuzzerContext);
  if (context === undefined) {
    throw new Error('useFuzzer must be used within an FuzzerProvider');
  }
  return context;
};

export const FuzzerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [FuzzerTabs, setFuzzerTabs] = useState<FuzzerTab[]>([]);
  const [activeFuzzerTab, setActiveFuzzerTab] = useState<number | null>(null);
  const [results, setResults] = useState<{ [tabId: number]: FuzzerResult[] }>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runningTabId, setRunningTabId] = useState<number | null>(null);
  const [FuzzerProgress, setFuzzerProgress] = useState<{ [tabId: number]: number }>({});

  useEffect(() => {
    const handleFuzzerTabs = (data: any) => {
      if (Array.isArray(data)) {
        const formattedTabs: FuzzerTab[] = data.map((tab) => ({
          ...tab,
          payloads: tab.payloads.map((payload: any): Payload => {
            if (payload.type === "sequence") {
              return {
                type: "sequence",
                from: payload.from || 1,
                to: payload.to || 10,
                step: payload.step || 1,
              };
            } else {
              return {
                type: "list",
                list: payload.list || [],
              };
            }
          }),
        }));
        
        setFuzzerTabs(formattedTabs);
        
        // Only set activeFuzzerTab if it's null or the current active tab no longer exists
        if (activeFuzzerTab === null || !formattedTabs.some(tab => tab.id === activeFuzzerTab)) {
          if (formattedTabs.length > 0) {
            setActiveFuzzerTab(formattedTabs[0].id);
          } else {
            setActiveFuzzerTab(null);
          }
        }
      }
    };

    const handleFuzzerResult = (data: { id: number; result: FuzzerResult }) => {
      console.log("Received Fuzzer result:", data);
      setResults((prevResults) => {
        const newResults = {
          ...prevResults,
          [data.id]: [...(prevResults[data.id] || []), data.result],
        };
        console.log("Updated results state:", newResults);
        return newResults;
      });
    };

    const handleFuzzerFinished = (data: { tabId: number }) => {
      setIsRunning(false);
      setRunningTabId(null);
    };

    const handleFuzzerProgress = (data: { tabId: number; progress: number }) => {
      setFuzzerProgress(prev => ({
        ...prev,
        [data.tabId]: data.progress
      }));
    };

    const handleNewTab = (data: any) => {
      // Handle both newFuzzerTab and FuzzerTabAdded events
      const tabId = data.tabId || data.id;
      const tab = data.tab || data;
      
      if (tabId && tab) {
        setFuzzerTabs(prevTabs => {
          // Check if the tab already exists
          const exists = prevTabs.some(t => t.id === tabId);
          if (!exists) {
            return [...prevTabs, { ...tab, id: tabId }];
          }
          return prevTabs;
        });
        setActiveFuzzerTab(tabId);
      }
    };

    // Set up event listeners
    EventsOn("backend:FuzzerTabs", handleFuzzerTabs);
    EventsOn("backend:FuzzerResult", handleFuzzerResult);
    EventsOn("backend:FuzzerFinished", handleFuzzerFinished);
    EventsOn("backend:FuzzerProgress", handleFuzzerProgress);
    EventsOn("backend:newFuzzerTab", handleNewTab);
    EventsOn("backend:FuzzerTabAdded", handleNewTab);

    // Initial load of tabs
    EventsEmit("frontend:getFuzzerTabs");

    // Cleanup
    return () => {
      EventsOff("backend:FuzzerTabs");
      EventsOff("backend:FuzzerResult");
      EventsOff("backend:FuzzerFinished");
      EventsOff("backend:FuzzerProgress");
      EventsOff("backend:newFuzzerTab");
      EventsOff("backend:FuzzerTabAdded");
    };
  }, [activeFuzzerTab]); // Add activeFuzzerTab as a dependency

  const addFuzzerTab = () => {
    const newTab: Omit<FuzzerTab, 'id' | 'name'> = {
      targetUrl: "https://example.com",
      method: "GET",
      path: "/",
      httpVersion: "HTTP/1.1",
      headers: {
        "Host": "example.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
      },
      body: "",
      payloads: [
        {
          type: "list",
          list: ["payload1", "payload2", "payload3"]
        }
      ]
    };
    EventsEmit("frontend:addFuzzerTab", newTab);
  };

  const removeFuzzerTab = (id: number) => {
    if (!isRunning && FuzzerTabs.length > 1) {
      const tabIndex = FuzzerTabs.findIndex(tab => tab.id === id);
      
      console.log("Removing tab:", id);
      console.log("Current active tab:", activeFuzzerTab);
      console.log("Tab index:", tabIndex);
      console.log("All tabs:", FuzzerTabs.map(t => ({ id: t.id, name: t.name })));
      
      // First, determine which tab to select next
      let nextTabId: number | null = null;
      
      if (activeFuzzerTab === id) {
        // If there's a tab to the right, select it
        if (tabIndex < FuzzerTabs.length - 1) {
          nextTabId = FuzzerTabs[tabIndex + 1].id;
        } 
        // Otherwise select the tab to the left
        else if (tabIndex > 0) {
          nextTabId = FuzzerTabs[tabIndex - 1].id;
        }
      } else {
        // If we're not deleting the active tab, keep the current selection
        nextTabId = activeFuzzerTab;
      }
      
      // First update the active tab, then remove the tab
      if (activeFuzzerTab === id) {
        setActiveFuzzerTab(nextTabId);
      }
      
      // Use setTimeout to ensure the active tab change is processed first
      setTimeout(() => {
        setFuzzerTabs(prevTabs => prevTabs.filter(tab => tab.id !== id));
        EventsEmit("frontend:removeFuzzerTab", id);
      }, 0);
    }
  };

  const updateFuzzerTab = (id: number, updates: Partial<FuzzerTab>) => {
    setFuzzerTabs((prevTabs) => {
      const updatedTabs = prevTabs.map((tab) => 
        tab.id === id ? { ...tab, ...updates } : tab
      );
      const updatedTab = updatedTabs.find((tab) => tab.id === id);
      if (updatedTab) {
        EventsEmit("frontend:updateFuzzerTab", updatedTab);
      }
      return updatedTabs;
    });
  };

  const startFuzzer = (tabId: number) => {
    const tab = FuzzerTabs.find((t) => t.id === tabId);
    if (tab) {
      const resumeFrom = FuzzerProgress[tabId] || 0;
      
      // Only clear results if we're starting fresh (not resuming)
      if (resumeFrom === 0) {
        setResults(prevResults => ({
          ...prevResults,
          [tabId]: [] // Reset results only if starting from beginning
        }));
      }
      
      const FuzzerData = {
        id: tabId,
        targetUrl: tab.targetUrl,
        method: tab.method,
        path: tab.path,
        httpVersion: tab.httpVersion,
        headers: tab.headers,
        body: tab.body,
        payloads: tab.payloads.map((payload) =>
          payload.type === "list"
            ? { ...payload, list: payload.list.flatMap(item => item.split('\n').filter(line => line.trim() !== '')) }
            : payload
        ),
        resumeFrom
      };
      EventsEmit("frontend:startFuzzer", FuzzerData);
      setIsRunning(true);
      setRunningTabId(tabId);
    }
  };

  const stopFuzzer = () => {
    EventsEmit("frontend:stopFuzzer");
    setIsRunning(false);
    setRunningTabId(null);
  };

  const updateTabName = (tabId: number, newName: string) => {
    updateFuzzerTab(tabId, { name: newName });
    EventsEmit("frontend:updateFuzzerTabName", { tabId, newName });
  };

  const value = {
    FuzzerTabs,
    activeFuzzerTab,
    results,
    isRunning,
    runningTabId,
    FuzzerProgress,
    setActiveFuzzerTab,
    addFuzzerTab,
    removeFuzzerTab,
    updateFuzzerTab,
    startFuzzer,
    stopFuzzer,
    updateTabName,
  };

  return (
    <FuzzerContext.Provider value={value}>
      {children}
    </FuzzerContext.Provider>
  );
};

export default FuzzerContext; 