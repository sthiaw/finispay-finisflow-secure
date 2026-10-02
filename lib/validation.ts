export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export function validateSignup(input: { fullName: string; email: string; password: string; confirmPassword: string }) {
  if (input.fullName.trim().length < 2) return "Enter your full name.";
  if (!emailPattern.test(input.email.trim())) return "Enter a valid email address.";
  if (!passwordPattern.test(input.password)) return "Password needs 8+ characters, including uppercase, lowercase and a number.";
  if (input.password !== input.confirmPassword) return "Passwords do not match.";
  return null;
}
