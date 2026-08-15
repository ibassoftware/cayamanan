import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // Badges hug their content (never full width) — badges.md + ui-principles §0.1.
  // Terracotta badge sizing: 12px medium. Height relaxed to auto so the chip
  // still contains its label at 200% text zoom.
  "group/badge inline-flex h-auto w-fit shrink-0 items-center justify-center gap-1 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary:
          "border-border bg-muted text-secondary-foreground",
        destructive:
          "border-[var(--tc-border-danger-subtle)] bg-danger-soft text-fg-danger",
        outline: "border-border-control text-heading",
        ghost: "hover:bg-muted hover:text-heading",
        brand:
          "border-[var(--tc-brand-soft)] bg-brand-softer text-brand-strong",
        success:
          "border-[var(--tc-border-success-subtle)] bg-success-soft text-fg-success",
        warning:
          "border-[var(--tc-border-warning-subtle)] bg-warning-soft text-fg-warning",
        link: "text-brand-strong underline underline-offset-[3px] hover:no-underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
