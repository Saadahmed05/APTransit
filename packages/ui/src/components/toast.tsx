"use client";

import * as React from "react";
import { Toaster as Sonner, toast } from "sonner";
import { cn } from "../cn";

export { toast };

export type ToasterProps = React.ComponentProps<typeof Sonner>;

export const Toaster = ({ className, ...props }: ToasterProps) => {
  return (
    <Sonner
      className={cn("toaster group", className)}
      position="bottom-center"
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans rounded-md border border-default bg-surface-raised text-fg shadow-md p-4 text-body",
          description: "text-muted text-small",
          actionButton:
            "bg-primary text-on-primary font-medium text-small px-3 py-1.5 rounded-sm",
          cancelButton:
            "bg-surface text-fg font-medium text-small px-3 py-1.5 rounded-sm",
          success: "border-status-success-soft text-status-success",
          info: "border-status-info-soft text-status-info",
        },
      }}
      {...props}
    />
  );
};
