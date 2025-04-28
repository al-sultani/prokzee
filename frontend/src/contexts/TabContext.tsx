// src/TabContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface Request {
  id: number;
  url: string;
  method: string;
  requestHeaders: string;
  requestBody: string;
  responseHeaders: string;
  responseBody: string;
  status: string;
}

interface RepeaterTab {
  id: number;
  name: string;
  requestIds: number[];
  currentIndex: number;
  currentRequest: Request;
}

interface TabContextProps {
  tabs: RepeaterTab[];
  activeTab: number | null;
  setTabs: (tabs: RepeaterTab[]) => void;
  setActiveTab: (tabId: number | null) => void;
  saveTabs: () => void;
}

export const TabContext = createContext<TabContextProps | undefined>(undefined);

export const TabProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<RepeaterTab[]>([]);
  const [activeTab, setActiveTab] = useState<number | null>(null);

  useEffect(() => {
    // Fetch the initial tabs from the backend
    EventsEmit('frontend:getRepeaterTabs');

    const handleRepeaterTabs = (data: RepeaterTab[]) => {
      setTabs(data);
      if (data.length > 0 && activeTab === null) {
        setActiveTab(data[0].id);
      }
    };

    EventsOn('backend:repeaterTabs', handleRepeaterTabs);

    return () => {
      EventsOff('backend:repeaterTabs');
    };
  }, [activeTab]);

  const saveTabs = () => {
    EventsEmit('frontend:updateRepeaterTabs', tabs);
  };

  return (
    <TabContext.Provider value={{ tabs, activeTab, setTabs, setActiveTab, saveTabs }}>
      {children}
    </TabContext.Provider>
  );
};