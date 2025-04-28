/**
 * Validation utility functions
 */

/**
 * Validates if a string is a valid URL
 * @param url - URL to validate
 * @returns Whether the URL is valid
 */
export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validates if a string is valid JSON
 * @param json - JSON string to validate
 * @returns Whether the JSON is valid
 */
export const isValidJson = (json: string): boolean => {
  try {
    JSON.parse(json);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validates if a string is a valid HTTP method
 * @param method - HTTP method to validate
 * @returns Whether the method is valid
 */
export const isValidHttpMethod = (method: string): boolean => {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  return validMethods.includes(method.toUpperCase());
};

/**
 * Validates if a string is a valid IP address
 * @param ip - IP address to validate
 * @returns Whether the IP is valid
 */
export const isValidIpAddress = (ip: string): boolean => {
  // IPv4 regex pattern
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  
  if (!ipv4Pattern.test(ip)) return false;
  
  // Check if each octet is valid (0-255)
  const octets = ip.split('.');
  return octets.every(octet => {
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
  });
}; 