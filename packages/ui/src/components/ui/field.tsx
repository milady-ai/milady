import * as React from "react";

import { cn } from "../../lib/utils";
import { Label } from "./label";

const Field = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("space-y-2", className)} {...props} />
));
Field.displayName = "Field";

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => (
  <Label
    ref={ref}
    className={cn("text-sm font-medium text-txt-strong", className)}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs leading-relaxed text-muted", className)}
    {...props}
  />
));
FieldDescription.displayName = "FieldDescription";

const FieldMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement> & {
    tone?: "default" | "danger" | "success";
  }
>(({ className, tone = "default", ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "text-xs leading-relaxed",
      tone === "danger"
        ? "text-danger"
        : tone === "success"
          ? "text-ok"
          : "text-muted",
      className,
    )}
    {...props}
  />
));
FieldMessage.displayName = "FieldMessage";

export { Field, FieldDescription, FieldLabel, FieldMessage };
