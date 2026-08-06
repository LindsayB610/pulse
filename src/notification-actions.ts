/**
 * Netlify route parameters can retain percent encoding. Occurrence IDs include
 * an ISO timestamp, so decode the path segment before checking its signature
 * or looking it up in Pulse state.
 */
export function notificationActionOccurrenceId(routeParam: string): string {
  return decodeURIComponent(routeParam);
}
