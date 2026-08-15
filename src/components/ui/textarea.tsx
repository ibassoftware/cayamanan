import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // 16px at every breakpoint: Terracotta specs 15px, but the fundamentals
        // floor for interactive text wins (and sub-16px triggers iOS focus
        // zoom). Entered text uses the heading token so data reads heavier than
        // its placeholder (ui-principles §4.5).
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base text-heading transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-[var(--tc-disabled)] disabled:text-[var(--tc-fg-disabled)] aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
