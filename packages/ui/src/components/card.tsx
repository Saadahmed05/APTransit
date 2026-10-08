import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";

export const cardVariants = cva(
  "rounded-lg border text-fg transition-colors",
  {
    variants: {
      variant: {
        plain: "bg-surface-raised border-default",
        interactive:
          "press-scale bg-surface-raised border-default hover:border-strong cursor-pointer active:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 select-none",
        selected: "bg-primary-soft border-primary border-2",
      },
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-4 md:p-5",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "plain",
      padding: "md",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div";
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ variant, padding, className }))}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";
