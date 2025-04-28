/**
 * API utility functions for making HTTP requests
 */

/**
 * Formats HTTP headers for display
 * @param headers - HTTP headers object
 * @returns Formatted headers string
 */
export const formatHeaders = (headers: Record<string, string>): string => {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
};

/**
 * Parses HTTP headers from string
 * @param headersString - Headers as string
 * @returns Parsed headers object
 */
export const parseHeaders = (headersString: string): Record<string, string> => {
  const headers: Record<string, string> = {};
  
  if (!headersString) return headers;
  
  headersString.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) return;
    
    const key = trimmedLine.substring(0, colonIndex).trim();
    const value = trimmedLine.substring(colonIndex + 1).trim();
    
    if (key) {
      headers[key] = value;
    }
  });
  
  return headers;
};

/**
 * Formats a URL with query parameters
 * @param baseUrl - Base URL
 * @param params - Query parameters
 * @returns Formatted URL with query parameters
 */
export const formatUrl = (baseUrl: string, params: Record<string, string>): string => {
  const url = new URL(baseUrl);
  
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  
  return url.toString();
}; 