import { randomUUID } from 'node:crypto';
import type { DatabaseHandle } from '../db/database.js';

export const IMPORT_AI_CAP_MICROUSD = 20_000_000;
export const MONTHLY_AI_CAP_MICROUSD = 100_000_000;
export const SPARK_INPUT_MICROUSD_PER_TOKEN = 1.25;
export const SPARK_OUTPUT_MICROUSD_PER_TOKEN = 4.25;
export const VOICE_MICROUSD_PER_SECOND = 50;

export type AiBudgetScope = 'import_budget' | 'monthly_budget';

export class AiBudgetExceededError extends Error {
  constructor(readonly scope: AiBudgetScope) {
    super(scope);
    this.name = 'AiBudgetExceededError';
  }
}

export interface AiUsageReservation {
  id: string;
  ownerId: string;
  importId: string;
  jobId: string;
  attemptNumber: number;
  monthStart: string;
  reservedMicroUsd: number;
}

export function utcMonthStart(value = new Date()): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function sparkCostMicroUsd(inputTokens: number, outputTokens: number): number {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
    throw new RangeError('Token counts must be non-negative safe integers.');
  }
  return Math.ceil(inputTokens * SPARK_INPUT_MICROUSD_PER_TOKEN + outputTokens * SPARK_OUTPUT_MICROUSD_PER_TOKEN);
}

export function voiceCostMicroUsd(audioSeconds: number): number {
  if (!Number.isFinite(audioSeconds) || audioSeconds < 0) throw new RangeError('Audio duration must be non-negative.');
  return Math.ceil(audioSeconds * VOICE_MICROUSD_PER_SECOND);
}

export function createAiUsageRepository(database: DatabaseHandle) {
  return {
    reserve(input: { ownerId: string; importId: string; jobId: string; attemptNumber: number; amountMicroUsd: number; now?: Date }) {
      return database.transaction(async () => {
        const { ownerId, importId, jobId, attemptNumber, amountMicroUsd } = input;
        if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd <= 0 || amountMicroUsd > IMPORT_AI_CAP_MICROUSD) {
          throw new RangeError('Reservation must be a positive amount within the per-import cap.');
        }
        const now = (input.now ?? new Date()).toISOString();
        const monthStart = utcMonthStart(input.now);
        await database.prepare(`INSERT INTO ai_import_usage (owner_id,import_id,created_at,updated_at)
          VALUES (?,?,?,?) ON CONFLICT(owner_id,import_id) DO NOTHING`).run(ownerId, importId, now, now);
        await database.prepare(`INSERT INTO ai_monthly_usage (month_start,created_at,updated_at)
          VALUES (?,?,?) ON CONFLICT(month_start) DO NOTHING`).run(monthStart, now, now);

        const importBudget = await database.prepare(`UPDATE ai_import_usage SET reserved_microusd=reserved_microusd+?,updated_at=?
          WHERE owner_id=? AND import_id=? AND spent_microusd+reserved_microusd+?<=cap_microusd`)
          .run(amountMicroUsd, now, ownerId, importId, amountMicroUsd);
        if (importBudget.changes !== 1) throw new AiBudgetExceededError('import_budget');

        const monthBudget = await database.prepare(`UPDATE ai_monthly_usage SET reserved_microusd=reserved_microusd+?,updated_at=?
          WHERE month_start=? AND spent_microusd+reserved_microusd+?<=cap_microusd`)
          .run(amountMicroUsd, now, monthStart, amountMicroUsd);
        if (monthBudget.changes !== 1) throw new AiBudgetExceededError('monthly_budget');

        const id = randomUUID();
        await database.prepare(`INSERT INTO ai_usage_reservations
          (id,owner_id,import_id,job_id,attempt_number,month_start,reserved_microusd,status,created_at)
          VALUES (?,?,?,?,?,?,?,'reserved',?)`)
          .run(id, ownerId, importId, jobId, attemptNumber, monthStart, amountMicroUsd, now);
        return { id, ownerId, importId, jobId, attemptNumber, monthStart, reservedMicroUsd: amountMicroUsd } satisfies AiUsageReservation;
      })();
    },

    settle(reservation: AiUsageReservation, actualMicroUsd: number, now = new Date().toISOString()) {
      return database.transaction(async () => {
        if (!Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0) throw new RangeError('Actual usage must be non-negative.');
        if (actualMicroUsd > reservation.reservedMicroUsd) {
          await database.prepare(`UPDATE ai_usage_reservations SET status='held'
            WHERE id=? AND owner_id=? AND status='reserved'`).run(reservation.id, reservation.ownerId);
          return false;
        }
        const changed = await database.prepare(`UPDATE ai_usage_reservations SET status='settled',actual_microusd=?,settled_at=?
          WHERE id=? AND owner_id=? AND status='reserved'`).run(actualMicroUsd, now, reservation.id, reservation.ownerId);
        if (changed.changes !== 1) return false;
        await database.prepare(`UPDATE ai_import_usage SET reserved_microusd=reserved_microusd-?,spent_microusd=spent_microusd+?,updated_at=?
          WHERE owner_id=? AND import_id=?`).run(reservation.reservedMicroUsd, actualMicroUsd, now, reservation.ownerId, reservation.importId);
        await database.prepare(`UPDATE ai_monthly_usage SET reserved_microusd=reserved_microusd-?,spent_microusd=spent_microusd+?,updated_at=?
          WHERE month_start=?`).run(reservation.reservedMicroUsd, actualMicroUsd, now, reservation.monthStart);
        return true;
      })();
    },

    release(reservation: AiUsageReservation, now = new Date().toISOString()) {
      return database.transaction(async () => {
        const changed = await database.prepare(`UPDATE ai_usage_reservations SET status='released',settled_at=?
          WHERE id=? AND owner_id=? AND status='reserved'`).run(now, reservation.id, reservation.ownerId);
        if (changed.changes !== 1) return false;
        await database.prepare(`UPDATE ai_import_usage SET reserved_microusd=reserved_microusd-?,updated_at=?
          WHERE owner_id=? AND import_id=?`).run(reservation.reservedMicroUsd, now, reservation.ownerId, reservation.importId);
        await database.prepare(`UPDATE ai_monthly_usage SET reserved_microusd=reserved_microusd-?,updated_at=?
          WHERE month_start=?`).run(reservation.reservedMicroUsd, now, reservation.monthStart);
        return true;
      })();
    },

    hold(reservation: AiUsageReservation) {
      return database.prepare(`UPDATE ai_usage_reservations SET status='held'
        WHERE id=? AND owner_id=? AND status='reserved'`).run(reservation.id, reservation.ownerId);
    },
  };
}
