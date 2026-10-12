import { z } from "zod";
import type { ServiceType } from "./enums";

/**
 * D-044: the three bus classes a citizen sees (owner's "Bus types and ticket rules"). A ticket is
 * valid on its own class and on every lower class: Normal on Normal only, Express on Express and
 * Normal, Super Luxury on all three. Which service sits in which class is an assumption (A), docs/18.
 */
export const BusClass = z.enum(["NORMAL", "EXPRESS", "SUPER_LUXURY"]);
export type BusClass = z.infer<typeof BusClass>;

/** Lowest first. */
export const BUS_CLASSES = BusClass.options;

export const SERVICE_BUS_CLASS: Record<ServiceType, BusClass> = {
  PALLEVELUGU: "NORMAL",
  ULTRA_PALLEVELUGU: "NORMAL",
  CITY_ORDINARY: "NORMAL",
  METRO_EXPRESS: "EXPRESS",
  EXPRESS: "EXPRESS",
  ULTRA_DELUXE: "EXPRESS",
  SUPER_LUXURY: "SUPER_LUXURY",
  INDRA_AC: "SUPER_LUXURY",
  AMARAVATI_AC: "SUPER_LUXURY",
  GARUDA_AC: "SUPER_LUXURY",
};

export function busClassOf(serviceType: ServiceType): BusClass {
  return SERVICE_BUS_CLASS[serviceType];
}

/** True when a ticket of `ticketClass` may ride a bus of `busClass` (same class or lower). */
export function classCovers(ticketClass: BusClass, busClass: BusClass): boolean {
  return BUS_CLASSES.indexOf(busClass) <= BUS_CLASSES.indexOf(ticketClass);
}

/** The classes a ticket of this class is valid on, highest first ("Super Luxury, Express and Normal"). */
export function coveredClasses(ticketClass: BusClass): BusClass[] {
  return BUS_CLASSES.filter((c) => classCovers(ticketClass, c)).reverse();
}

/** The services of one class, in enum order. */
export function servicesOfClass(busClass: BusClass): ServiceType[] {
  return (Object.keys(SERVICE_BUS_CLASS) as ServiceType[]).filter(
    (s) => SERVICE_BUS_CLASS[s] === busClass,
  );
}
