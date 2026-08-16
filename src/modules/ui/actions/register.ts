// Side-effect import: pulls every `ui.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './navigate';
import './open-record';
