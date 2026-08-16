import type { ElementType, ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface FormSectionProps {
  title: string
  description?: string
  /** Heading tag for `title` — pick whatever keeps the page's h1-h6 hierarchy unbroken. */
  headingLevel?: ElementType
  children: ReactNode
  className?: string
}

/** Groups related fields under a heading, for forms with more than a handful of fields. */
export function FormSection({
  title,
  description,
  headingLevel: Heading = "h3",
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div>
        <Heading className="text-base font-medium text-heading">{title}</Heading>
        {description && <p className="text-sm text-body-subtle">{description}</p>}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}
