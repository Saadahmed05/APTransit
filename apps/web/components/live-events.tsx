"use client";
import { NotificationDto, notificationParams, TicketStatus } from "@aptransit/shared";
import { toast } from "@aptransit/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { liveSocket } from "../lib/socket";
import { useAuth } from "./auth-provider";
export function LiveEvents() {
  const client = useQueryClient();
  const t = useTranslations();
  const locale = useLocale();
  const { status } = useAuth();
  useEffect(() => {
    // Anonymous visitors get no notifications or ticket events, so they never open a socket here.
    if (status !== "authenticated") return;
    const socket = liveSocket();
    const notification = (value: unknown) => {
      const parsed = NotificationDto.safeParse(value);
      if (!parsed.success) return;
      const n = parsed.data;
      void client.invalidateQueries({ queryKey: ["notifications"] });
      if (["TRIP_DELAYED", "TRIP_CANCELLED", "REPLACEMENT_BUS"].includes(n.type))
        toast(
          t(
            `notifications.${n.type}.body`,
            notificationParams(n.params, locale === "te" ? "te" : "en"),
          ),
        );
    };
    const ticket = (value: { ticketId?: unknown; status?: unknown }) => {
      if (typeof value?.ticketId !== "string" || !TicketStatus.safeParse(value.status).success)
        return;
      void client.invalidateQueries({ queryKey: ["ticket", value.ticketId] });
      void client.invalidateQueries({ queryKey: ["tickets"] });
    };
    socket.on("notification:new", notification);
    socket.on("ticket:status", ticket);
    return () => {
      socket.off("notification:new", notification);
      socket.off("ticket:status", ticket);
    };
  }, [client, t, locale, status]);
  return null;
}
