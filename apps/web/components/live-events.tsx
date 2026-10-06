"use client";
import { NotificationDto, notificationParams, TicketStatus } from "@aptransit/shared";
import { toast } from "@aptransit/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { liveSocket } from "../lib/socket";
export function LiveEvents() {
  const client = useQueryClient();
  const t = useTranslations();
  const locale = useLocale();
  useEffect(() => {
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
  }, [client, t, locale]);
  return null;
}
