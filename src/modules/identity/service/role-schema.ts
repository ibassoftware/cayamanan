// Shared zod schema for the fixed role set (src/platform/actions.ts `Role`) — one source
// of truth for every identity action's input/output validation.
import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'HR_PAYROLL', 'EMPLOYEE']);
