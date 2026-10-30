import { pathToFileURL } from 'node:url';
import { config } from '../src/config.js';
import { createDatabase } from '../src/db/database.js';
import { InitialAdminProvisioningError, provisionInitialAdmin } from '../src/account/admin-provisioning.js';

export type ProvisionAdminArgs = { email: string; role: 'admin'; confirm: boolean };

export function parseProvisionAdminArgs(args: string[]): ProvisionAdminArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith('--') || values.has(key)) throw new Error('invalid_arguments');
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('invalid_arguments');
    values.set(key, value);
    index += 1;
  }
  if (values.size !== 3 || !values.has('--email') || values.get('--role') !== 'admin' || values.get('--confirm') !== 'yes') {
    throw new Error('usage: provision:admin -- --email <existing-account-email> --role admin --confirm yes');
  }
  return { email: values.get('--email')!, role: 'admin', confirm: true };
}

async function main(args: string[]): Promise<void> {
  let parsed: ProvisionAdminArgs;
  try {
    parsed = parseProvisionAdminArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'invalid_arguments');
    process.exitCode = 2;
    return;
  }

  let database: Awaited<ReturnType<typeof createDatabase>> | undefined;
  try {
    database = await createDatabase(config.databaseUrl);
    await provisionInitialAdmin(database, parsed);
    console.log('Initial admin role provisioned.');
  } catch (error) {
    const code = error instanceof InitialAdminProvisioningError ? error.code : 'provisioning_failed';
    console.error(`Initial admin provisioning failed: ${code}`);
    process.exitCode = 1;
  } finally {
    await database?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2));
}
