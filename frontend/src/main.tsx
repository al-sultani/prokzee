import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/style.css'
import './styles/index.css'; 
import App from './App'
import {
  RequestQueueProvider,
  ScopeProvider,
  SiteMapProvider,
  ProxyToolProvider,
  RequestDetailsProvider,
  ResenderProvider,
  FuzzerProvider,
  LLMProvider,
  ListenerProvider,
  PluginProvider,
  ThemeProvider
} from './contexts'
import "./styles/editor-theme.css"


const container = document.getElementById('root')

const root = createRoot(container!)

const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider>
      <ScopeProvider>
        <RequestQueueProvider>
          <SiteMapProvider>
            <ProxyToolProvider>
              <RequestDetailsProvider>
                <ResenderProvider>
                  <FuzzerProvider>
                    <LLMProvider>
                      <ListenerProvider>
                        <PluginProvider>
                          <React.StrictMode>
                            {children}
                          </React.StrictMode>
                        </PluginProvider>
                      </ListenerProvider>
                    </LLMProvider>
                  </FuzzerProvider>
                </ResenderProvider>
              </RequestDetailsProvider>
            </ProxyToolProvider>
          </SiteMapProvider>
        </RequestQueueProvider>
      </ScopeProvider>
    </ThemeProvider>
  )
}

root.render(
  <AppProviders>
    <App />
  </AppProviders>
)