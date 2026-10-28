import type { DatabaseHandle } from '../db/database.js';
import { createAssetService } from '../assets/service.js';
import { LocalAssetStorage } from '../assets/storage.js';
import { createAccountRepository } from './repository.js';

export class AccountServiceError extends Error {
  constructor(public readonly code: 'invalid_profile' | 'username_taken', message: string) { super(message); }
}

export function createAccountService(database: DatabaseHandle, storage: LocalAssetStorage) {
  const repository = createAccountRepository(database);
  const assets = createAssetService(database, storage);
  return {
    session(user: { id: string; email: string; accountStatus: string }) {
      const profile = repository.getProfile(user.id);
      return { user: { id: user.id, email: user.email }, profile, profileComplete: Boolean(profile), accountStatus: user.accountStatus };
    },
    getProfile(userId: string) { return repository.getProfile(userId); },
    hasProfile(userId: string) { return repository.hasProfile(userId); },
    async saveProfile(userId: string, input: { username?: string; avatarUrl?: string }, file?: { buffer: Buffer; mimetype: string }) {
      const oldProfile = repository.getProfile(userId);
      const username = input.username ?? oldProfile?.username;
      if (!username) throw new AccountServiceError('invalid_profile', 'A username is required.');
      let avatarAssetId = file ? null : (input.avatarUrl === undefined ? oldProfile?.avatarAssetId ?? null : null);
      let uploaded: { id: string; key: string } | undefined;
      try {
        if (file) {
          const asset = await assets.stage(userId, 'avatar', file.buffer, file.mimetype);
          uploaded = { id: asset.id, key: asset.key };
          avatarAssetId = asset.id;
        }
        const now = new Date().toISOString();
        const avatarUrl = file ? null : input.avatarUrl === undefined ? oldProfile?.avatarUrl ?? null : input.avatarUrl || null;
        repository.saveProfile(userId, username, avatarUrl, avatarAssetId, oldProfile?.avatarAssetId ?? null, now);
      } catch (cause) {
        if (uploaded) {
          const row = createAccountRepository(database).getProfile(userId);
          if (row?.avatarAssetId !== uploaded.id) await assets.deleteAfterMarked(userId, uploaded.id, uploaded.key);
        }
        if (String(cause).includes('UNIQUE constraint failed: profiles.username')) throw new AccountServiceError('username_taken', 'That username is already in use.');
        throw cause;
      }
      if (oldProfile?.avatarAssetId && oldProfile.avatarAssetId !== avatarAssetId) await assets.deleteAfterMarked(userId, oldProfile.avatarAssetId);
      return repository.getProfile(userId);
    },
    getOnboarding(userId: string) { return repository.getOnboarding(userId); },
    saveOnboarding(userId: string, input: { contentTypes: string[]; referralSource: string; skipped: boolean }) {
      const contentTypes = [...new Set(input.contentTypes)];
      const now = new Date().toISOString();
      const completedAt = input.skipped ? null : now;
      const skippedAt = input.skipped ? now : null;
      repository.saveOnboarding(userId, contentTypes, input.referralSource || null, completedAt, skippedAt, now);
      return { contentTypes, referralSource: input.referralSource, completedAt, skippedAt };
    },
    seedProfile(userId: string, username: string) {
      const now = new Date().toISOString();
      repository.saveProfile(userId, username.toLowerCase(), null, null, null, now);
    },
  };
}
