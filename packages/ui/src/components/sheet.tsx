"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X } from "lucide-react";
import { cn } from "../cn";

export const Sheet = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
);
Sheet.displayName = "Sheet";

export const SheetTrigger = DrawerPrimitive.Trigger;
export const SheetPortal = DrawerPrimitive.Portal;
export const SheetClose = DrawerPrimitive.Close;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-sheet bg-scrim",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  closeLabel?: string;
  hideCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  SheetContentProps
>(({ className, children, closeLabel = "Close", hideCloseButton = false, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-sheet mt-24 flex max-h-[90svh] flex-col rounded-t-xl border-t border-default bg-surface-raised focus-visible:outline-none",
        className
      )}
      {...props}
    >
      {/* Drag handle */}
      <div className="mx-auto my-3 h-1 w-9 rounded-full bg-strong shrink-0" />

      {!hideCloseButton && (
        <DrawerPrimitive.Close
          className="absolute right-4 top-4 rounded-sm p-1 text-muted transition-opacity hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={closeLabel}
        >
          <X className="h-5 w-5" />
        </DrawerPrimitive.Close>
      )}

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
        {children}
      </div>
    </DrawerPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1.5 text-left mb-4", className)}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-auto flex flex-col gap-2 pt-4 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-h2 font-semibold text-fg", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-body text-muted", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
