import React, { createContext, useContext, useState, useEffect } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"

interface Message {
  role: "user" | "assistant"; 
  content: string;
}

interface ChatContext {
  id: number;
  name: string;
  messages: Message[];
  unsentMessage?: string;
  isLoading: boolean;
}

interface LLMContextType {
  chatContexts: ChatContext[];
  activeChatContextId: number | null;
  isLoading: boolean;
  error: string | null;
  setActiveChatContextId: (id: number | null) => void;
  addChatContext: () => void;
  deleteChatContext: (id: number) => void;
  editChatContextName: (id: number, newName: string) => void;
  sendMessage: (message: string) => void;
  updateUnsentMessage: (message: string) => void;
  getUnsentMessage: () => string;
  clearError: () => void;
}

const LLMContext = createContext<LLMContextType | undefined>(undefined);

export const LLMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chatContexts, setChatContexts] = useState<ChatContext[]>([]);
  const [activeChatContextId, setActiveChatContextId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Setting up event listeners in LLMProvider");
    
    // Request initial chat contexts
    EventsEmit("frontend:getChatContexts");

    // Register event handlers
    EventsOn("backend:chatContexts", handleChatContexts);
    EventsOn("backend:chatMessages", handleChatMessages);
    EventsOn("backend:receiveMessage", handleReceiveMessage);
    EventsOn("backend:chatContextCreated", handleChatContextCreated);
    EventsOn("backend:chatContextDeleted", handleChatContextDeleted);
    EventsOn("backend:chatContextNameUpdated", handleChatContextNameUpdated);
    EventsOn("backend:error", handleError);

    // Add a timeout to ensure loading state is cleared
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 3000);

    // Log that event listeners are set up
    console.log("Event listeners registered");

    return () => {
      clearTimeout(loadingTimeout);
      console.log("Cleaning up event listeners");
      EventsOff("backend:chatContexts");
      EventsOff("backend:chatMessages");
      EventsOff("backend:receiveMessage");
      EventsOff("backend:chatContextCreated");
      EventsOff("backend:chatContextDeleted");
      EventsOff("backend:chatContextNameUpdated");
      EventsOff("backend:error");
    };
  }, []);

  useEffect(() => {
    if (activeChatContextId !== null) {
      EventsEmit("frontend:getChatMessages", activeChatContextId);
    }
  }, [activeChatContextId]);

  const handleChatContexts = (contexts: ChatContext[]) => {
    setChatContexts(contexts ? contexts.map(context => ({ ...context, unsentMessage: '' })) : []);
    setIsLoading(false);
  };

  const handleChatMessages = (data: { chatContextId: number; messages: Message[] }) => {
    setChatContexts((prevContexts) =>
      prevContexts.map((context) =>
        context.id === data.chatContextId 
          ? { ...context, messages: data.messages || [] }
          : context
      )
    );
  };

  const handleReceiveMessage = (data: { chatContextId: number; message: Message }) => {
    console.log("Received message:", data);
    setChatContexts((prevContexts) =>
      prevContexts.map((context) =>
        context.id === data.chatContextId
          ? {
              ...context,
              messages: [...(context.messages || []), data.message],
              isLoading: false
            }
          : context
      )
    );
    setError(null);
  };

  const handleChatContextCreated = (data: { id: number; name: string }) => {
    console.log("RECEIVED backend:chatContextCreated event with data:", data);
    
    // If name is empty or just the ID, create a proper name
    const contextName = (!data.name || data.name === data.id.toString()) 
      ? `Chat ${data.id}` 
      : data.name;
      
    const newContext: ChatContext = { 
      id: data.id, 
      name: contextName, 
      messages: [], 
      unsentMessage: '', 
      isLoading: false
    };
    
    // Force a complete state update rather than just appending
    setChatContexts((prevContexts) => {
      console.log("Previous chat contexts:", prevContexts);
      // Make sure we're creating a new array reference to trigger a re-render
      const updatedContexts = [newContext, ...prevContexts];
      console.log("Updated chat contexts:", updatedContexts);
      return updatedContexts;
    });
    
    // Set this as the active context
    setActiveChatContextId(data.id);
    
    // Log to verify the event is being received
    console.log("Chat context created event processed, new active ID:", data.id);
  };

  const handleChatContextDeleted = (data: { id: number }) => {
    setChatContexts((prevContexts) => prevContexts.filter((context) => context.id !== data.id));
    if (activeChatContextId === data.id) {
      setActiveChatContextId(null);
    }
  };

  const handleChatContextNameUpdated = (data: { id: number; newName: string }) => {
    setChatContexts((prevContexts) =>
      prevContexts.map((context) => (context.id === data.id ? { ...context, name: data.newName } : context))
    );
  };

  const handleError = (data: { chatContextId: number; error: string }) => {
    console.error("Received error:", data.error);
    setError(data.error);
    
    // Update the chat context to remove loading state and mark as error
    setChatContexts((prevContexts) =>
      prevContexts.map((context) =>
        context.id === data.chatContextId
          ? { 
              ...context, 
              isLoading: false,
            }
          : context
      )
    );
  };

  const clearError = () => {
    setError(null);
  };

  const addChatContext = () => {
    console.log("addChatContext called in LLMContext");
    // Make sure we're emitting the event correctly
    try {
      EventsEmit("frontend:createChatContext");
      console.log("Event emitted: frontend:createChatContext");
    } catch (error) {
      console.error("Error emitting createChatContext event:", error);
    }
  };

  const deleteChatContext = (id: number) => {
    EventsEmit("frontend:deleteChatContext", id);
  };

  const editChatContextName = (id: number, newName: string) => {
    EventsEmit("frontend:editChatContextName", id, newName);
  };

  const updateUnsentMessage = (message: string) => {
    if (activeChatContextId === null) return;
    
    setChatContexts((prevContexts) =>
      prevContexts.map((context) =>
        context.id === activeChatContextId
          ? { ...context, unsentMessage: message }
          : context
      )
    );
  };

  const getUnsentMessage = () => {
    if (activeChatContextId === null) return '';
    
    const activeContext = chatContexts.find(context => context.id === activeChatContextId);
    return activeContext?.unsentMessage || '';
  };

  const sendMessage = (message: string) => {
    if (!message.trim() || activeChatContextId === null) return;

    const chatContext = chatContexts.find((context) => context.id === activeChatContextId);
    if (!chatContext) return;

    // Clear any existing error when sending a new message
    setError(null);

    const newMessage: Message = { role: "user", content: message };

    // First update the UI with the new message
    setChatContexts((prevContexts) =>
      prevContexts.map((context) =>
        context.id === activeChatContextId 
          ? { 
              ...context, 
              messages: [...(context.messages || []), newMessage],
              unsentMessage: '',
              isLoading: true 
            }
          : context
      )
    );

    // Then emit the event to send the message
    EventsEmit("frontend:sendMessage", { 
      chatContextId: activeChatContextId, 
      messages: [newMessage] 
    });

    // Set a timeout to clear loading state if no response is received
    const timeoutId = setTimeout(() => {
      setChatContexts((prevContexts) =>
        prevContexts.map((context) =>
          context.id === activeChatContextId && context.isLoading
            ? { 
                ...context, 
                isLoading: false
              }
            : context
        )
      );
      setError("Request timed out. Please try again.");
    }, 30000); // 30 second timeout

    // Clear the timeout when component unmounts or when response is received
    return () => clearTimeout(timeoutId);
  };

  const value = {
    chatContexts,
    activeChatContextId,
    isLoading,
    error,
    setActiveChatContextId,
    addChatContext,
    deleteChatContext,
    editChatContextName,
    sendMessage,
    updateUnsentMessage,
    getUnsentMessage,
    clearError,
  };

  return <LLMContext.Provider value={value}>{children}</LLMContext.Provider>;
};

export const useLLM = () => {
  const context = useContext(LLMContext);
  if (context === undefined) {
    throw new Error("useLLM must be used within a LLMProvider");
  }
  return context;
}; 