import { describe, expect, it, vi } from 'vitest';

import { columnMappingAgent, suggestUnmappedColumns } from '@/mastra/agents/column-mapping-agent';

// Proves the tracing-suppression wiring itself, independent of employee.suggestColumnMapping's
// own tests (which mock this whole module and never reach the real `.generate()` call).
// No network call happens here: `Agent.generate` is stubbed directly, so this never hits
// a real model — it only asserts *what this module would have sent it*.
describe('suggestUnmappedColumns tracing suppression', () => {
  it('calls the agent with hideInput/hideOutput so no sample cell data ever reaches trace storage', async () => {
    const generateSpy = vi.spyOn(columnMappingAgent, 'generate').mockResolvedValue({
      object: { mappings: [{ column: 'Given Name', field: 'firstName', confidence: 'high' }] },
      // Minimal stand-in for the rest of FullOutput — nothing else here is read.
    } as never);

    const result = await suggestUnmappedColumns([{ column: 'Given Name', samples: ['Maria', 'Juan'] }], undefined);

    expect(generateSpy).toHaveBeenCalledTimes(1);
    const call = generateSpy.mock.calls[0] as unknown as [unknown, { tracingOptions?: { hideInput?: boolean; hideOutput?: boolean } }];
    expect(call[1]?.tracingOptions).toEqual({ hideInput: true, hideOutput: true });
    expect(result).toEqual([{ column: 'Given Name', field: 'firstName', confidence: 'high' }]);

    generateSpy.mockRestore();
  });

  it('never calls the agent at all when there are no unmapped columns', async () => {
    const generateSpy = vi.spyOn(columnMappingAgent, 'generate');
    const result = await suggestUnmappedColumns([], undefined);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(result).toEqual([]);
    generateSpy.mockRestore();
  });
});
