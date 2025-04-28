import React, { createContext, useContext, useState, useEffect } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface Settings {
  id: number;
  project_name: string;
  openai_api_url: string;
  openai_api_key: string;
  proxy_port: string;
  interactsh_host: string;
  interactsh_port: number | string;
}

interface SettingsContextType {
  settings: Settings;
  isInteractshConfigured: boolean;
  isInteractshRegistered: boolean;
  updateSettings: (newSettings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>({
    id: 0,
    project_name: "",
    openai_api_url: "",
    openai_api_key: "",
    proxy_port: "",
    interactsh_host: "",
    interactsh_port: "",
  });
  const [isInteractshRegistered, setIsInteractshRegistered] = useState(false);

  const isInteractshConfigured = Boolean(settings.interactsh_host && settings.interactsh_port);

  useEffect(() => {
    const handleFetchSettings = (data: any) => {
      if (data.error) {
        console.error(data.error);
      } else {
        setSettings(data);
      }
    };

    const handleRegistrationStatus = (success: boolean) => {
      console.log("Registration status:", success);
      setIsInteractshRegistered(success);
    };

    EventsOn("backend:fetchSettings", handleFetchSettings);
    EventsOn("backend:registrationStatus", handleRegistrationStatus);
    EventsEmit("frontend:fetchSettings");

    return () => {
      EventsOff("backend:fetchSettings");
      EventsOff("backend:registrationStatus");
    };
  }, []);

  // Reset registration status when interactsh settings change
  useEffect(() => {
    setIsInteractshRegistered(false);
  }, [settings.interactsh_host, settings.interactsh_port]);

  const updateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    EventsEmit("frontend:updateSettings", newSettings);
  };

  const value = {
    settings,
    isInteractshConfigured,
    isInteractshRegistered,
    updateSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}; 