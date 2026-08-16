import { describe, expect, it } from 'vitest';

import { isInternalToolPart, isVisibleOutputPart } from '@/lib/chat/internal-tools';

describe('internal tool parts', () => {
  it('hides Mastra’s working-memory bookkeeping', () => {
    expect(isInternalToolPart({ type: 'tool-updateWorkingMemory' })).toBe(true);
    expect(isInternalToolPart({ type: 'tool-__updateWorkingMemory' })).toBe(true);
  });

  it('does not hide real registry actions', () => {
    expect(isInternalToolPart({ type: 'tool-org_createDepartment' })).toBe(false);
    expect(isInternalToolPart({ type: 'tool-employee_list' })).toBe(false);
    expect(isInternalToolPart({ type: 'text' })).toBe(false);
  });

  // The regression this file exists for: the panel's "Missy is thinking…" indicator and
  // the renderer must agree on what counts as visible. When only the renderer knew about
  // the hidden memory tool, the indicator switched off the moment that tool arrived —
  // leaving a reasoning block, nothing, and no spinner while the model was still
  // streaming its answer. The turn looked frozen; it wasn't.
  it('does not count a hidden tool as visible output', () => {
    expect(isVisibleOutputPart({ type: 'tool-updateWorkingMemory' })).toBe(false);
  });

  it('counts text and real tool calls as visible output', () => {
    expect(isVisibleOutputPart({ type: 'text' })).toBe(true);
    expect(isVisibleOutputPart({ type: 'tool-org_createDepartment' })).toBe(true);
  });

  it('does not count reasoning as visible output — it renders as nothing when empty', () => {
    expect(isVisibleOutputPart({ type: 'reasoning' })).toBe(false);
  });
});
