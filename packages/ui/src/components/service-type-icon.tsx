import type { ServiceType } from "@aptransit/shared";
import { Bus, BusFront, Crown, type LucideIcon, Rocket, Snowflake, TramFront } from "lucide-react";
import { cn } from "../cn";

/**
 * One icon per kind of bus, so travellers tell them apart at a glance. The service name is always
 * shown next to it (the icon is decorative): local, city, express, super express (Ultra Deluxe),
 * luxury (Super Luxury) and AC.
 */
const ICONS: Record<ServiceType, LucideIcon> = {
  PALLEVELUGU: Bus,
  ULTRA_PALLEVELUGU: Bus,
  CITY_ORDINARY: TramFront,
  METRO_EXPRESS: BusFront,
  EXPRESS: BusFront,
  ULTRA_DELUXE: Rocket,
  SUPER_LUXURY: Crown,
  INDRA_AC: Snowflake,
  AMARAVATI_AC: Snowflake,
  GARUDA_AC: Snowflake,
};

const TONES: Record<ServiceType, string> = {
  PALLEVELUGU: "bg-surface-sunken text-fg",
  ULTRA_PALLEVELUGU: "bg-surface-sunken text-fg",
  CITY_ORDINARY: "bg-surface-sunken text-fg",
  METRO_EXPRESS: "bg-primary-soft text-primary",
  EXPRESS: "bg-primary-soft text-primary",
  ULTRA_DELUXE: "bg-status-warning-soft text-fg",
  SUPER_LUXURY: "bg-status-success-soft text-fg",
  INDRA_AC: "bg-status-info-soft text-fg",
  AMARAVATI_AC: "bg-status-info-soft text-fg",
  GARUDA_AC: "bg-status-info-soft text-fg",
};

export function ServiceTypeIcon({ serviceType, className }: { serviceType: ServiceType; className?: string }) {
  const Icon = ICONS[serviceType] ?? Bus;
  return (
    <span
      aria-hidden="true"
      data-service-icon={serviceType}
      className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full", TONES[serviceType], className)}
    >
      <Icon className="size-4" />
    </span>
  );
}
