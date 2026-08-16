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
import './add-education';
import './update-education';
import './remove-education';
import './add-work-history';
import './update-work-history';
import './remove-work-history';
import './add-training';
import './update-training';
import './remove-training';
import './add-contact';
import './update-contact';
import './remove-contact';
import './set-requirement';
import './remove-requirement';
import './suggest-column-mapping';
import './import-preview';
import './import-commit';
import './bulk-upsert';
import './upload-document';
import './list-documents';
import './remove-document';
import './list-onboarding-templates';
import './create-onboarding-template';
import './update-onboarding-template';
import './remove-onboarding-template';
import './apply-onboarding-template';
