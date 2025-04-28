import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface Interaction {
  id: string;
  timestamp: string;
  data: string;
}

interface ListenerContextType {
  interactions: Interaction[];
  domain: string;
  isListening: boolean;
  isPaused: boolean;
  selectedInteraction: Interaction | null;
  toastMessage: string | null;
  registrationAttempted: boolean;
  registrationError: string | null;
  startListening: () => void;
  stopListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
  generateNewDomain: () => void;
  copyToClipboard: () => void;
  setSelectedInteraction: (interaction: Interaction | null) => void;
}

const ListenerContext = createContext<ListenerContextType | undefined>(undefined);

export const useListener = () => {
  const context = useContext(ListenerContext);
  if (context === undefined) {
    throw new Error('useListener must be used within a ListenerProvider');
  }
  return context;
};

export const ListenerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [domain, setDomain] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [registrationAttempted, setRegistrationAttempted] = useState<boolean>(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const startListening = useCallback(() => {
    setRegistrationAttempted(true);
    setRegistrationError(null);
    setIsListening(true);
    EventsEmit("frontend:startListening");
  }, []);

  const stopListening = useCallback(() => {
    setIsListening(false);
    setIsPaused(false);
    setDomain("");
    setRegistrationAttempted(false);
    setRegistrationError(null);
    EventsEmit("frontend:stopListening");
  }, []);

  const pauseListening = useCallback(() => {
    if (isListening && !isPaused) {
      setIsPaused(true);
      EventsEmit("frontend:pauseListening");
      setToastMessage("Listener paused. New interactions will not be received.");
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [isListening, isPaused]);

  const resumeListening = useCallback(() => {
    if (isListening && isPaused) {
      setIsPaused(false);
      EventsEmit("frontend:resumeListening");
      setToastMessage("Listener resumed. Now receiving interactions.");
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [isListening, isPaused]);

  const generateNewDomain = useCallback(() => {
    if (isListening) {
      EventsEmit("frontend:generateNewDomain");
      setToastMessage("Generating new domain...");
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [isListening]);

  const copyToClipboard = useCallback(() => {
    navigator.clipboard
      .writeText(domain)
      .then(() => {
        setToastMessage("Domain copied to clipboard.");
        setTimeout(() => setToastMessage(null), 3000);
      })
      .catch((err) => {
        console.error("Failed to copy: ", err);
        setToastMessage("Failed to copy domain to clipboard.");
        setTimeout(() => setToastMessage(null), 3000);
      });
  }, [domain]);

  useEffect(() => {
    const handleNewInteraction = (data: Interaction) => {
      if (!isPaused) {
        setInteractions((prevInteractions) => [data, ...prevInteractions]);
      }
    };

    const handleDomain = (data: { domain: string }) => {
      setDomain(data.domain);
      setToastMessage("New domain generated successfully.");
      setTimeout(() => setToastMessage(null), 3000);
    };

    const handleRegistrationStatus = (success: boolean) => {
      setRegistrationAttempted(true);
      if (!success) {
        setIsListening(false);
        setIsPaused(false);
        setDomain("");
      } else {
        setRegistrationError(null);
      }
    };

    const handleRegistrationError = (errorMessage: string) => {
      setRegistrationError(errorMessage);
      setIsListening(false);
      setIsPaused(false);
      setDomain("");
      setToastMessage(errorMessage);
      setTimeout(() => setToastMessage(null), 5000);
    };

    const handleSettingsUpdate = () => {
      setRegistrationAttempted(false);
      setRegistrationError(null);
    };

    EventsOn("backend:newInteraction", handleNewInteraction);
    EventsOn("backend:domain", handleDomain);
    EventsOn("backend:registrationStatus", handleRegistrationStatus);
    EventsOn("backend:registrationError", handleRegistrationError);
    EventsOn("frontend:updateSettings", handleSettingsUpdate);

    return () => {
      EventsOff("backend:newInteraction");
      EventsOff("backend:domain");
      EventsOff("backend:registrationStatus");
      EventsOff("backend:registrationError");
      EventsOff("frontend:updateSettings");
    };
  }, [isPaused]);

  const value = {
    interactions,
    domain,
    isListening,
    isPaused,
    selectedInteraction,
    toastMessage,
    registrationAttempted,
    registrationError,
    startListening,
    stopListening,
    pauseListening,
    resumeListening,
    generateNewDomain,
    copyToClipboard,
    setSelectedInteraction,
  };

  return <ListenerContext.Provider value={value}>{children}</ListenerContext.Provider>;
}; 