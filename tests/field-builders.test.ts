import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  employeeNo,
  hdmfMid,
  isoDate,
  orgCode,
  pagibigNo,
  philhealthNo,
  sssNo,
  tin,
  uuidRef,
} from '@/platform/fields';
import { idOrKeyShape } from '@/platform/id-or-key';

// Guards the actual point of src/platform/fields.ts: every builder attaches a
// `.describe()` a caller gets "for free". Without this, a future refactor could quietly
// drop a builder's description (e.g. simplifying `z.string().min(1).describe(...)` back
// down to `z.string().min(1)`) and every tool schema using it would silently regress to
// the "zero descriptions" state this module exists to fix — this test fails loudly
// instead.
describe('platform/fields builders attach descriptions', () => {
  const builders: Array<[string, () => z.ZodType]> = [
    ['orgCode', orgCode],
    ['employeeNo', employeeNo],
    ['isoDate', isoDate],
    ['sssNo', sssNo],
    ['philhealthNo', philhealthNo],
    ['pagibigNo', pagibigNo],
    ['tin', tin],
    ['hdmfMid', hdmfMid],
  ];

  it.each(builders)('%s() has a non-empty description', (_name, build) => {
    expect(build().description).toBeTruthy();
  });

  it('uuidRef(noun) folds the noun into a non-empty description', () => {
    const schema = uuidRef('department');
    expect(schema.description).toBeTruthy();
    expect(schema.description).toContain('department');
  });

  it('every builder still validates exactly what the ad-hoc declaration it replaces did', () => {
    expect(orgCode().safeParse('').success).toBe(false);
    expect(orgCode().safeParse('FIN').success).toBe(true);
    expect(isoDate().safeParse('2025-13-40').success).toBe(false);
    expect(isoDate().safeParse('2025-01-31').success).toBe(true);
    expect(uuidRef('department').safeParse('not-a-uuid').success).toBe(false);
    expect(uuidRef('department').safeParse(crypto.randomUUID()).success).toBe(true);
    // PH statutory identifiers stay format-unconstrained (see fields.ts header) —
    // any non-empty string still passes, exactly as the ad-hoc `z.string()` did.
    expect(sssNo().safeParse('anything').success).toBe(true);
  });
});

// The other half of the same guarantee: `id-or-key.ts`'s generated selector shape (used
// by every `org.*`/`employee.*` id-or-natural-key action) also carries descriptions, not
// just the standalone field builders above.
describe('idOrKeyShape descriptions', () => {
  it('both the id and key field carry a description in the JSON schema Missy actually receives', () => {
    // Matches tests/missy-tool-payload.test.ts's own methodology (z.toJSONSchema over
    // the object) rather than reading `.description` directly off the optional-wrapped
    // field — zod v4's `ZodOptional` does not forward `.description` to its own getter
    // even though the JSON schema (what's actually sent to the model) carries it fine.
    const shape = idOrKeyShape('id', 'code');
    const json = z.toJSONSchema(z.object(shape)) as { properties: Record<string, { description?: string }> };
    expect(json.properties.id.description).toBeTruthy();
    expect(json.properties.code.description).toBeTruthy();
    expect(json.properties.id.description).toContain('code');
    expect(json.properties.code.description).toContain('id');
  });
});
