export function errorResponse(message: string): { error: string } {
  return { error: message };
}
