// Side-effect import: pulls every `employee.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './list-employees';
import './get-employee';
import './get-self';
import './create-employee';
import './update-employee';
import './update-government-ids';
import './link-user-account';
import './set-status';
