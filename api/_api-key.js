export function getApiKey(name) {
  return process.env[name] || '';
}
