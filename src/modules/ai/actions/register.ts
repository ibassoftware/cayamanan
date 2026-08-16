// Side-effect import: pulls every `ai.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './list-threads';
import './create-thread';
import './rename-thread';
import './approve-action';
