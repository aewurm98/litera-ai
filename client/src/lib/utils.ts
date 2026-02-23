import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { SUPPORTED_LANGUAGES } from "@shared/schema"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatContent(content: string | string[] | null | undefined): string {
  if (!content) return "";

  const addNumbering = (items: string[]) => {
    return items.map((item, i) => {
      const cleaned = item.replace(/^\d+\.\s*/, '').trim();
      return `${i + 1}. ${cleaned}`;
    }).join("\n");
  };

  if (Array.isArray(content)) {
    return addNumbering(content);
  }

  if (typeof content === "string" && content.startsWith("{") && content.includes('","')) {
    try {
      const cleaned = content.replace(/^\{"|"\}$/g, '').split('","');
      return addNumbering(cleaned);
    } catch {
      return content;
    }
  }
  return content;
}

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.name || code;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidYearOfBirth(year: string): boolean {
  const yearNum = parseInt(year);
  return !isNaN(yearNum) && yearNum >= 1900 && yearNum <= new Date().getFullYear();
}

export async function viewAsPatient(accessToken: string): Promise<void> {
  try {
    await fetch(`/api/admin/preview-access/${accessToken}`, { method: "POST", credentials: "include" });
  } catch {
  }
  window.open(`/p/${accessToken}`, "_blank");
}

export function validatePassword(password: string) {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
  return { hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecial, isValid };
}
