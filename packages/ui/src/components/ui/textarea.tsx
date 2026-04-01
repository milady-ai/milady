import * as React from "react";

import { cn } from "../../lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: "default" | "form";
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <textarea
        className={cn(
          variant === "form"
            ? "min-h-[132px] w-full resize-y rounded-2xl border border-border/60 bg-bg/70 px-4 py-3 text-sm outline-none transition-[border-color,box-shadow,background-color] focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent"
            : "flex min-h-[80px] w-full rounded-md border border-input bg-bg px-3 py-2 text-sm ring-offset-bg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
