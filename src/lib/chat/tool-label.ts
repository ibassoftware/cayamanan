/**
 * Turns a registry action id into something an HR or payroll user can read.
 *
 * The chat panel used to label tool calls with the raw id (`org.listPositions`) and dump
 * the JSON parameters and result underneath. That is developer output in a screen built
 * for HR staff — Missy already narrates what she did in prose, so the card only needs to
 * say which action ran, quietly, with the detail available on demand.
 */

// Leading verbs, in past tense because the card describes something already done.
const VERBS: Record<string, string> = {
  list: 'Looked up',
  get: 'Looked up',
  search: 'Searched',
  create: 'Created',
  update: 'Updated',
  set: 'Updated',
  change: 'Changed',
  archive: 'Archived',
  deactivate: 'Deactivated',
  link: 'Linked',
  reset: 'Reset',
  revoke: 'Revoked',
  approve: 'Approved',
  open: 'Opened',
  navigate: 'Opened',
};

// Ids whose generic derivation would read badly.
const SPECIAL: Record<string, string> = {
  'identity.me': 'Checked your account',
  'system.ping': 'Checked the system',
  'ui.navigate': 'Opened a screen',
  'ui.openRecord': 'Opened a record',
  'employee.getSelf': 'Looked up your own record',
  'identity.changeOwnPassword': 'Changed your password',
};

// Acronyms that must not be lowercased when we split camelCase.
const ACRONYMS: Record<string, string> = { ids: 'IDs', id: 'ID', url: 'URL' };

function splitCamel(value: string): string[] {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ').filter(Boolean);
}

/**
 * `org.listPositions` → "Looked up positions"; `employee.updateGovernmentIds` →
 * "Updated government IDs". Falls back to the plain id rather than inventing a phrase,
 * so a new action is merely unpolished, never mislabelled.
 */
export function humanizeToolName(actionId: string): string {
  const special = SPECIAL[actionId];
  if (special) return special;

  const [, name] = actionId.split('.');
  if (!name) return actionId;

  const words = splitCamel(name);
  const verb = VERBS[words[0]?.toLowerCase() ?? ''];
  if (!verb) return actionId;

  const rest = words
    .slice(1)
    .map((word) => {
      const lower = word.toLowerCase();
      return ACRONYMS[lower] ?? lower;
    })
    .join(' ');

  return rest ? `${verb} ${rest}` : verb;
}
