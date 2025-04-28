// src/ScopeContext.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { EventsEmit, EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";

interface ScopeContextProps {
  inScope: string;
  outOfScope: string;
  setInScope: (value: string) => void;
  setOutOfScope: (value: string) => void;
  saveScopeLists: () => void;
}

export const ScopeContext = createContext<ScopeContextProps | undefined>(undefined);

export const ScopeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [inScope, setInScope] = useState('');
  const [outOfScope, setOutOfScope] = useState('');

  useEffect(() => {
    // Fetch the initial scope lists from the backend
    EventsEmit('frontend:getScopeLists');

    const handleScopeLists = (data: any) => {
      console.log('Received scope lists from backend:', data);
      if (data.inScope) {
        setInScope(data.inScope.join('\n'));
      }
      if (data.outOfScope) {
        setOutOfScope(data.outOfScope.join('\n'));
      }
    };

    const handleClearState = () => {
      console.log('Clearing scope lists state');
      setInScope('');
      setOutOfScope('');
    };

    // Listen for scope list updates
    EventsOn('backend:scopeLists', handleScopeLists);
    // Listen for project switching clear state
    EventsOn('backend:clearState', handleClearState);

    return () => {
      EventsOff('backend:scopeLists');
      EventsOff('backend:clearState');
    };
  }, []);

  const saveScopeLists = () => {
    const inScopeList = inScope.split('\n').filter(item => item.trim() !== '');
    const outOfScopeList = outOfScope.split('\n').filter(item => item.trim() !== '');

    console.log('Saving in-scope list:', inScopeList);
    console.log('Saving out-of-scope list:', outOfScopeList);

    EventsEmit('frontend:updateInScopeList', inScopeList);
    EventsEmit('frontend:updateOutOfScopeList', outOfScopeList);
  };

  return (
    <ScopeContext.Provider value={{ inScope, outOfScope, setInScope, setOutOfScope, saveScopeLists }}>
      {children}
    </ScopeContext.Provider>
  );
};