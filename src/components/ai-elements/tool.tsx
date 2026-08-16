"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

// Terracotta accordion.md: 16px radius wrapper, 1px border, card-cream fill,
// shadow-xs. The wrapper clips the trigger's corners.
export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      // `shrink-0` is load-bearing, not cosmetic. This card is a flex item in the message
      // column, so it inherits `flex-shrink: 1` and the layout was compressing its box —
      // an 80px box around 154px of content — while `overflow-hidden` (there to clip the
      // trigger's corners) quietly guillotined the rest. The result was cards that looked
      // torn in half and overlapping in the Missy panel. The header and the panel were
      // both fine the whole time; the card's own box was the problem.
      "group not-prose mb-4 w-full shrink-0 overflow-hidden rounded-lg border border-border-control bg-card shadow-xs",
      className
    )}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusLabels: Record<ToolPart["state"], string> = {
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "input-available": "Running",
  "input-streaming": "Pending",
  "output-available": "Completed",
  "output-denied": "Denied",
  "output-error": "Error",
};

// Icons come from the Terracotta status family — no raw Tailwind palette
// colours, and no second saturated accent (colors.md "Prohibited").
const statusIcons: Record<ToolPart["state"], ReactNode> = {
  "approval-requested": <ClockIcon className="size-4" />,
  "approval-responded": <CheckCircleIcon className="size-4" />,
  "input-available": <ClockIcon className="size-4 animate-pulse" />,
  "input-streaming": <CircleIcon className="size-4" />,
  "output-available": <CheckCircleIcon className="size-4" />,
  "output-denied": <XCircleIcon className="size-4" />,
  "output-error": <XCircleIcon className="size-4" />,
};

// Every status carries an icon AND a text label, so state is never encoded by
// colour alone (WCAG 1.4.1).
const statusVariants: Record<
  ToolPart["state"],
  "brand" | "secondary" | "success" | "warning" | "destructive"
> = {
  "approval-requested": "warning",
  "approval-responded": "brand",
  "input-available": "brand",
  "input-streaming": "secondary",
  "output-available": "success",
  "output-denied": "warning",
  "output-error": "destructive",
};

export const getStatusBadge = (status: ToolPart["state"]) => {
  // Plain success shows its icon alone. Measured in the Missy panel, the "Completed" chip
  // was 99px of a 255px card and squeezed the tool's own name down to 62px — "Opened a
  // record" rendered as "Opene…". Labelling every routine call "Completed" is noise
  // besides; what a user needs words for is a call that is still running, has failed, or
  // wants approval, and all of those keep their text.
  //
  // The label stays in the accessibility tree via `sr-only`, so the WCAG 1.4.1 intent of
  // the rule above still holds — state is conveyed by an icon and a name, never by colour.
  const iconOnly = status === "output-available";

  return (
    <Badge className={cn("gap-1.5 rounded-full", iconOnly && "px-1.5")} variant={statusVariants[status]}>
      {statusIcons[status]}
      {iconOnly ? <span className="sr-only">{statusLabels[status]}</span> : statusLabels[status]}
    </Badge>
  );
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        // Terracotta accordion trigger: 20/18px padding, 15px medium, heading
        // ink, card cream, hover + open both step to the warmer cream.
        // `gap-3`/`px-4`, not `gap-4`/`px-5`: this trigger's real home is the Missy panel,
        // which is ~384px wide and leaves the card about 255px. Twenty pixels of padding a
        // side plus a 16px gap was a meaningful slice of that.
        "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 bg-card px-4 py-3 text-left font-medium text-[0.9375rem] text-heading transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring group-data-[state=open]:bg-accent",
        className
      )}
      {...props}
    >
      {/* `flex-nowrap`, not `flex-wrap`. Wrapping put the wrench, the title and the status
          badge on three separate lines inside the chat panel — a 116px-tall header for one
          line of text, which read as a broken card. Nowrap lets the title's `truncate`
          actually engage, which is the behaviour that was intended all along: the icon and
          badge hold their size and the long tool name gives way. */}
      <div className="flex min-w-0 flex-nowrap items-center gap-2">
        <WrenchIcon className="size-4 shrink-0 text-body-subtle" />
        <span className="min-w-0 truncate">{title ?? derivedName}</span>
        <span className="shrink-0">{getStatusBadge(state)}</span>
      </div>
      <ChevronDownIcon className="size-4 shrink-0 text-body-subtle transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      // Panel sits on the page surface with a hairline separating it from the
      // trigger (accordion.md).
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-4 border-border border-t bg-background px-5 py-[18px] text-body outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

// "Parameters" / "Result" are field labels for the code panel below them, not
// document structure — emitting them as headings would skip a level in the page
// outline (typography-principles §2.6). Rendered as an overline label instead.
const overlineClass =
  "block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]";

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
    <span className={overlineClass}>Parameters</span>
    {/* The code well keeps the page surface: syntax tokens clear AA there but
        three of them dip below 4.5:1 on the warmer card cream. A parchment
        border does the delimiting instead of a background step. */}
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <span className={overlineClass}>{errorText ? "Error" : "Result"}</span>
      <div
        className={cn(
          "overflow-x-auto rounded-md border text-sm [&_table]:w-full",
          errorText
            ? "border-[var(--tc-border-danger-subtle)] bg-danger-soft text-fg-danger"
            : "border-border bg-background text-body"
        )}
      >
        {errorText && <div className="px-4 py-3">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
