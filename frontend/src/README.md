# Frontend Structure

This directory contains the frontend code for the application. The structure is organized as follows:

## Directory Structure

- `assets/`: Contains static assets like images, fonts, etc.
- `components/`: Reusable UI components
  - `ui/`: Basic UI components like buttons, inputs, etc.
- `contexts/`: React context providers for state management
- `features/`: Feature-specific components and logic
  - `fuzzer/`: Fuzzer feature
  - `history/`: HTTP history feature
  - `intercept/`: Proxy interception feature
  - `listener/`: Listener feature
  - `llm-analyzer/`: LLM analyzer feature
  - `plugins/`: Plugins management feature
  - `resender/`: Request resender feature
  - `rules/`: Interception rules feature
  - `scope/`: Scope management feature
  - `sitemap/`: Site map feature
- `pages/`: Top-level page components
- `styles/`: CSS and styling files
- `utils/`: Utility functions and helpers
  - `api.ts`: API-related utility functions
  - `formatting.ts`: String and data formatting utilities
  - `hooks.ts`: Custom React hooks
  - `validation.ts`: Data validation utilities

## Import Conventions

Each directory has an `index.ts` file that exports its contents, allowing for cleaner imports:

```typescript
// Instead of
import { Component } from './components/Component';

// You can use
import { Component } from './components';
```

## Main Files

- `App.tsx`: The main application component
- `main.tsx`: The entry point for the application

## Utility Functions

The `utils` directory contains various utility functions that can be used throughout the application:

### API Utilities
- `formatHeaders`: Formats HTTP headers for display
- `parseHeaders`: Parses HTTP headers from string
- `formatUrl`: Formats a URL with query parameters

### Formatting Utilities
- `formatDate`: Formats a date to a readable string
- `formatFileSize`: Formats a file size in bytes to a human-readable string
- `truncateString`: Truncates a string to a specified length
- `formatJSON`: Formats a JSON string with proper indentation

### Validation Utilities
- `isValidUrl`: Validates if a string is a valid URL
- `isValidJson`: Validates if a string is valid JSON
- `isValidHttpMethod`: Validates if a string is a valid HTTP method
- `isValidIpAddress`: Validates if a string is a valid IP address

### Custom React Hooks
- `useLocalStorage`: Hook for managing local storage state
- `useDebounce`: Hook for debouncing a value
- `useClickOutside`: Hook for detecting clicks outside of an element 