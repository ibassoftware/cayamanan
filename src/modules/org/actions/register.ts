// Side-effect import: pulls every `org.*` action definition into the registry
// (src/platform/actions.ts). Imported once by the composition root
// (src/app/api/actions/[actionId]/route.ts) and by tests that exercise these actions
// directly.
import './list-departments';
import './create-department';
import './update-department';
import './archive-department';
import './list-positions';
import './create-position';
import './update-position';
import './archive-position';
import './list-locations';
import './create-location';
import './update-location';
import './archive-location';
import './list-cost-centers';
import './create-cost-center';
import './update-cost-center';
import './archive-cost-center';
