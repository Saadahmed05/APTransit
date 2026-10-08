"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../cn";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary:
          "press-scale bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover",
        secondary:
          "press-scale bg-surface-raised text-fg border border-strong hover:bg-surface active:bg-surface",
        ghost:
          "press-scale bg-transparent text-fg hover:bg-surface active:bg-surface",
        danger:
          "press-scale bg-status-danger-solid text-on-solid hover:opacity-90 active:opacity-100",
        link:
          "bg-transparent text-primary hover:underline underline-offset-4 p-0 h-auto font-normal",
      },
      size: {
        sm: "h-9 px-3 text-small rounded-md min-h-9",
        md: "h-11 px-4 text-body rounded-md min-h-11",
        lg: "h-13 px-5 text-body-lg rounded-md min-h-13",
        xl: "h-14 px-6 text-body-lg rounded-md min-h-14",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || loading;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    if (asChild) {
      return (
        <Comp
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          aria-busy={loading ? "true" : undefined}
          aria-disabled={isDisabled ? "true" : undefined}
          onClick={handleClick}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        ref={ref}
        type="button"
        disabled={isDisabled}
        className={cn(buttonVariants({ variant, size, className }))}
        aria-busy={loading ? "true" : undefined}
        onClick={handleClick}
        {...props}
      >
        {loading && (
          <Spinner
            className="shrink-0"
            size={size === "xl" ? "md" : "sm"}
          />
        )}
        {!loading && leftIcon && (
          <span className="inline-flex shrink-0 items-center">
            {leftIcon}
          </span>
        )}
        <span className="truncate">{children}</span>
        {!loading && rightIcon && (
          <span className="inline-flex shrink-0 items-center">
            {rightIcon}
          </span>
        )}
      </Comp>
    );
  }
);

Button.displayName = "Button";
