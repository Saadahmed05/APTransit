"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "../cn";

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  /** segmented: sunken track with a raised pill (mobile). underline: 2 px indicator (desktop). */
  variant?: "segmented" | "underline";
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant = "segmented", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    data-variant={variant}
    className={cn(
      "group/tabs inline-flex items-center text-muted select-none",
      variant === "segmented"
        ? "h-11 justify-center rounded-md bg-surface-sunken p-1"
        : "h-11 gap-4 border-b border-default",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap px-3.5 py-1.5 text-body font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-40",
      // segmented: the selected pill sits on the sunken track, outlined by a hairline
      "group-data-[variant=segmented]/tabs:rounded-md group-data-[variant=segmented]/tabs:border group-data-[variant=segmented]/tabs:border-transparent",
      "group-data-[variant=segmented]/tabs:data-[state=active]:border-default group-data-[variant=segmented]/tabs:data-[state=active]:bg-surface-raised",
      // underline: a 2 px accent under the selected tab
      "group-data-[variant=underline]/tabs:h-full group-data-[variant=underline]/tabs:border-b-2 group-data-[variant=underline]/tabs:border-transparent group-data-[variant=underline]/tabs:px-1",
      "group-data-[variant=underline]/tabs:data-[state=active]:border-primary",
      "data-[state=active]:text-fg",
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
