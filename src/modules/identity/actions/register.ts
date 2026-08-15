// Side-effect import: pulls every `identity.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './login';
import './logout';
import './me';
import './change-own-password';
import './list-users';
import './get-user';
import './create-user';
import './set-user-roles';
import './deactivate-user';
import './reset-user-password';
import './revoke-sessions';
