// Read-only display of an employee's emergency/beneficiary contacts. No action exists
// to create/edit/delete `employee_contacts` rows in this slice (only `employee.get`/
// `getSelf` read them) — see docs/plan/04-organization-employees.md's action table —
// so this is intentionally view-only, not a stripped-down form.
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { EmployeeContact } from "@/components/employee/employee-state"

export function ContactsList({ contacts }: { contacts: EmployeeContact[] }) {
  if (contacts.length === 0) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>No contacts on file</CardTitle>
          <CardDescription>Emergency and beneficiary contacts will appear here once added.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {contacts.map(contact => (
        <li key={contact.id}>
          <Card className="max-w-xl">
            <CardContent className="flex flex-col gap-1 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-heading">{contact.name}</span>
                <Badge variant="secondary">{contact.kind}</Badge>
              </div>
              {contact.relationship && <span className="text-sm text-body-subtle">{contact.relationship}</span>}
              {contact.mobile && <span className="text-sm text-body-subtle">{contact.mobile}</span>}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
