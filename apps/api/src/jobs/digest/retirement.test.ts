import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// __dirname = .../apps/api/src/jobs/digest
const apiSrc = resolve(__dirname, '..', '..');

// Regression guard: services/emailDigest/ was retired with the new jobs/digest/
// pipeline. If a future agent copy-pastes the old pattern back in, this test
// fails immediately and points at the right place to undo it.
describe('emailDigest folder retirement', () => {
  it('apps/api/src/services/emailDigest/ no longer exists', () => {
    expect(existsSync(resolve(apiSrc, 'services', 'emailDigest'))).toBe(false);
  });

  const retiredFiles = [
    'services/emailDigest/index.ts',
    'services/emailDigest/digestService.ts',
    'services/emailDigest/worker.ts',
    'services/emailDigest/scheduler.ts',
    'services/emailDigest/templates.ts',
    'services/emailDigest/resendClient.ts',
    'services/emailDigest/unsubscribeToken.ts',
    'services/emailDigest/README.md',
  ];

  for (const path of retiredFiles) {
    it(`${path} no longer exists`, () => {
      expect(existsSync(resolve(apiSrc, path))).toBe(false);
    });
  }
});
