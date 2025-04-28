import React, { createContext, useContext, useState, ReactNode } from 'react';

interface RequestDetails {
    url: string;
    headers: { [key: string]: string };
    body: string;
    method?: string;
    protocolVersion?: string;
  }

interface ApprovalData {
    requestID: string;
    details: RequestDetails;
}

interface RequestQueueContextType {
    requestQueue: ApprovalData[];
    addRequestToQueue: (request: ApprovalData) => void;
    removeRequestFromQueue: (requestID: string) => void;
    clearQueue: () => void;
    clearRequestQueue: () => void;
}

const RequestQueueContext = createContext<RequestQueueContextType | undefined>(undefined);

export function RequestQueueProvider({ children }: { children: ReactNode }) {
    const [requestQueue, setRequestQueue] = useState<ApprovalData[]>([]);

    const addRequestToQueue = (request: ApprovalData) => {
        setRequestQueue(prevQueue => [...prevQueue, request]);
    };

    const removeRequestFromQueue = (requestID: string) => {
        setRequestQueue(prevQueue => prevQueue.filter(req => req.requestID !== requestID));
    };

    const clearQueue = () => {
        setRequestQueue([]);
    };

    const clearRequestQueue = () => {
        setRequestQueue([]);
    };

    const value = {
        requestQueue,
        addRequestToQueue,
        removeRequestFromQueue,
        clearQueue,
        clearRequestQueue,
    };

    return (
        <RequestQueueContext.Provider value={value}>
            {children}
        </RequestQueueContext.Provider>
    );
}

export const useRequestQueue = () => {
    const context = useContext(RequestQueueContext);
    if (!context) {
        throw new Error('useRequestQueue must be used within a RequestQueueProvider');
    }
    return context;
};