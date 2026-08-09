import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

/**
 * Builds the next password required by the identity provider. A numeric suffix
 * after the final `?` is incremented; all other password formats gain `1`.
 */
export function nextLoginPassword(password: string): string {
  const questionMarkIndex = password.lastIndexOf('?');
  const suffix = questionMarkIndex === -1 ? '' : password.slice(questionMarkIndex + 1);

  if (/^\d+$/.test(suffix)) {
    return `${password.slice(0, questionMarkIndex + 1)}${BigInt(suffix) + 1n}`;
  }

  return `${password}1`;
}

/** Persist a successful password change for subsequent local test runs. */
export async function updateEnvValue(name: string, value: string): Promise<void> {
  const envPath = resolve(process.cwd(), '.env');
  const envContents = await readFile(envPath, 'utf8');
  const assignment = new RegExp(`^(\\s*(?:export\\s+)?${name}\\s*=).*$`, 'm');

  if (!assignment.test(envContents)) {
    throw new Error(`Cannot update missing env var: ${name}`);
  }

  await writeFile(envPath, envContents.replace(assignment, `$1${JSON.stringify(value)}`), 'utf8');
  process.env[name] = value;
}
