import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { useRequestQueue } from './RequestQueueContext';

interface RequestDetails {
    url: string;
    headers: { [key: string]: string };
    body: string;
    method?: string;
    protocolVersion?: string;
    status?: string;
  }
  
interface ApprovalData {
    requestID: string;
    details: RequestDetails;
  }
  
interface InterceptContextType {
  selectedRequest: ApprovalData | null;
  setSelectedRequest: (request: ApprovalData | null) => void;
  rawRequest: string;
  setRawRequest: (request: string) => void;
  interceptionOn: boolean;
  toggleInterception: () => void;
  context: string;
  setContext: (context: string) => void;
}

const InterceptContext = createContext<InterceptContextType | undefined>(undefined);

export const InterceptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedRequest, setSelectedRequest] = useState<ApprovalData | null>(null);
  const [rawRequest, setRawRequest] = useState<string>("");
  const [interceptionOn, setInterceptionOn] = useState<boolean>(false);
  const [context, setContext] = useState<string>("");
  const { requestQueue, clearRequestQueue } = useRequestQueue();

  useEffect(() => {
    // Get initial state when component mounts
    EventsEmit("frontend:getInterceptionState");

    // Listen for state updates from backend
    const handleInterceptionState = (state: boolean) => {
      console.log("Received interception state:", state);
      setInterceptionOn(state);
    };

    // Listen for toggle confirmation
    const handleInterceptionToggle = (newState: boolean) => {
      console.log("Interception toggled to:", newState);
      setInterceptionOn(newState);
      
      // If turning off interception and there are requests, forward them all
      if (!newState && requestQueue.length > 0) {
        requestQueue.forEach((request) => {
          EventsEmit("frontend:approveRequest", {
            requestID: request.requestID,
            approved: true,
            url: request.details.url,
            headers: request.details.headers,
            body: request.details.body,
            method: request.details.method,
            protocolVersion: request.details.protocolVersion,
          });
        });
        clearRequestQueue();
      }
    };

    EventsOn("backend:interceptionState", handleInterceptionState);
    EventsOn("backend:interceptionToggled", handleInterceptionToggle);

    return () => {
      EventsOff("backend:interceptionState");
      EventsOff("backend:interceptionToggled");
    };
  }, [requestQueue, clearRequestQueue]);

  const toggleInterception = () => {
    console.log("Requesting interception toggle, current state:", interceptionOn);
    EventsEmit("frontend:toggleInterception");
  };

  return (
    <InterceptContext.Provider
      value={{
        selectedRequest,
        setSelectedRequest,
        rawRequest,
        setRawRequest,
        interceptionOn,
        toggleInterception,
        context,
        setContext,
      }}
    >
      {children}
    </InterceptContext.Provider>
  );
};

export const useIntercept = () => {
  const context = useContext(InterceptContext);
  if (context === undefined) {
    throw new Error('useIntercept must be used within an InterceptProvider');
  }
  return context;
};

interface ProxyToolContextType {
  interceptionOn: boolean;
  toggleInterception: () => void;
  handleForwardAll: () => void;
  context: string;
  setContext: (context: string) => void;
  selectedRequest: ApprovalData | null;
  setSelectedRequest: (request: ApprovalData | null) => void;
  rawRequest: string;
  setRawRequest: (request: string) => void;
}

const ProxyToolContext = createContext<ProxyToolContextType | undefined>(undefined);

export function useProxyTool() {
  const context = useContext(ProxyToolContext);
  if (context === undefined) {
    throw new Error('useProxyTool must be used within a ProxyToolProvider');
  }
  return context;
}

interface ProxyToolProviderProps {
  children: ReactNode;
}

export function ProxyToolProvider({ children }: ProxyToolProviderProps) {
  const [interceptionOn, setInterceptionOn] = useState(true);
  const { requestQueue, clearRequestQueue } = useRequestQueue();
  const [context, setContext] = useState('default');
  const [selectedRequest, setSelectedRequest] = useState<ApprovalData | null>(null);
  const [rawRequest, setRawRequest] = useState("");

  useEffect(() => {
    // Get initial state when component mounts
    EventsEmit("frontend:getInterceptionState");

    // Listen for state updates from backend
    const handleInterceptionState = (state: boolean) => {
      console.log("Received interception state:", state);
      setInterceptionOn(state);
    };

    // Listen for toggle confirmation
    const handleInterceptionToggle = (newState: boolean) => {
      console.log("Interception toggled to:", newState);
      
      // Only forward requests if this was an explicit toggle action from the backend
      if (newState !== interceptionOn) {
        setInterceptionOn(newState);
        
        // Only auto-forward requests if explicitly turning off interception
        if (!newState && requestQueue.length > 0) {
          requestQueue.forEach((request) => {
            EventsEmit("frontend:approveRequest", {
              requestID: request.requestID,
              approved: true,
              url: request.details.url,
              headers: request.details.headers,
              body: request.details.body,
              method: request.details.method,
              protocolVersion: request.details.protocolVersion,
            });
          });
          clearRequestQueue();
        }
      }
    };

    EventsOn("backend:interceptionState", handleInterceptionState);
    EventsOn("backend:interceptionToggled", handleInterceptionToggle);

    // Simple cleanup that just removes event listeners
    const cleanup = () => {
      EventsOff("backend:interceptionState");
      EventsOff("backend:interceptionToggled");
    };

    return cleanup;
  }, [requestQueue, clearRequestQueue, interceptionOn]);

  const toggleInterception = () => {
    console.log("Requesting interception toggle, current state:", interceptionOn);
    // Set the state immediately for better UI responsiveness
    setInterceptionOn(!interceptionOn);
    EventsEmit("frontend:toggleInterception");
  };

  const handleForwardAll = () => {
    requestQueue.forEach((request) => {
      EventsEmit("frontend:approveRequest", {
        requestID: request.requestID,
        approved: true,
        url: request.details.url,
        headers: request.details.headers,
        body: request.details.body,
        method: request.details.method,
        protocolVersion: request.details.protocolVersion,
      });
    });
    clearRequestQueue();
  };

  const value = {
    interceptionOn,
    toggleInterception,
    handleForwardAll,
    context,
    setContext,
    selectedRequest,
    setSelectedRequest,
    rawRequest,
    setRawRequest,
  };

  return (
    <ProxyToolContext.Provider value={value}>
      {children}
    </ProxyToolContext.Provider>
  );
} 