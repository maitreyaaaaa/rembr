import bcrypt from 'bcryptjs';
import { Algorithm, Version, hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { dictionary } from '@zxcvbn-ts/language-common';

export const MIN_PASSWORD_CODE_POINTS = 15;
export const MAX_PASSWORD_CODE_POINTS = 128;

const argon2Options = {
  algorithm: Algorithm.Argon2id,
  version: Version.V0x13,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

const commonPasswords = new Set(dictionary['passwords-common'].map((password) => password.normalize('NFC').toLowerCase()));
const predictableSuffix = /^[0-9!@#$%^&*._-]{1,12}$/;

export function normalizePassword(password: string): string {
  return password.normalize('NFC');
}

export function countPasswordCodePoints(password: string): number {
  return [...normalizePassword(password)].length;
}

function hasContextualPattern(password: string, email: string): boolean {
  const normalized = password.toLowerCase();
  const localPart = email.split('@')[0]?.normalize('NFC').toLowerCase() ?? '';
  const terms = [localPart, 'rembr'].filter((term) => term.length >= 3);

  return terms.some((term) => {
    const suffix = normalized.startsWith(term) ? normalized.slice(term.length) : '';
    const prefix = normalized.endsWith(term) ? normalized.slice(0, -term.length) : '';
    return normalized === term
      || (suffix.length > 0 && predictableSuffix.test(suffix))
      || (prefix.length > 0 && predictableSuffix.test(prefix));
  });
}

export function validateNewPassword(password: string, email: string): { ok: true } | { ok: false; code: 'password_too_short' | 'password_too_long' | 'password_blocklisted' } {
  const normalized = normalizePassword(password);
  const length = [...normalized].length;
  if (length < MIN_PASSWORD_CODE_POINTS) return { ok: false, code: 'password_too_short' };
  if (length > MAX_PASSWORD_CODE_POINTS) return { ok: false, code: 'password_too_long' };
  const lower = normalized.toLowerCase();
  if (commonPasswords.has(lower) || hasContextualPattern(normalized, email)) {
    return { ok: false, code: 'password_blocklisted' };
  }
  return { ok: true };
}

export async function hashNewPassword(password: string): Promise<string> {
  return argon2Hash(normalizePassword(password), argon2Options);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (encodedHash.startsWith('$argon2id$')) {
    try {
      return { valid: await argon2Verify(encodedHash, normalizePassword(password)), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }
  if (/^\$2[aby]\$/.test(encodedHash)) {
    return { valid: await bcrypt.compare(password, encodedHash), needsRehash: false };
  }
  return { valid: false, needsRehash: false };
}
