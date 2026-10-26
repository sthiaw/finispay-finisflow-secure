export function validateUsername(username: string) {
  const value = username.trim();
  if (value.length < 2) return "Username must contain at least 2 characters.";
  if (value.length > 32) return "Username must contain no more than 32 characters.";
  if (!/^[A-Za-z0-9._ -]+$/.test(value))
    return "Use letters, numbers, spaces, dots, underscores or hyphens only.";
  return null;
}

export function usernamesMatch(saved: string, entered: string) {
  return saved === entered.trim();
}

