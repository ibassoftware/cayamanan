// Side-effect import: pulls every `system.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './ping';
import './get-settings';
import './update-setting';
import './set-openai-key';
import './get-openai-key-status';
