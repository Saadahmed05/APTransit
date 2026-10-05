import type { ServiceType } from "@aptransit/shared";

/** "Pallevelugu, Express and City Ordinary" in the user's language (Intl.ListFormat, no joined fragments). */
export function serviceList(types: readonly ServiceType[], translate: (key: string) => string, locale: string): string {
  const names = types.map((type) => translate(`serviceType.${type}`));
  try {
    return new Intl.ListFormat(locale === "te" ? "te-IN" : "en-IN", { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}
