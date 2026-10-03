import { PlaceDto, ServiceDateString } from "@aptransit/shared";
import { addDays } from "@aptransit/ui";
import { z } from "zod";

export const MAX_DAYS_AHEAD = 30;
const STORAGE_KEY = "apt.homeSearch";

const SavedSearch = z.object({
  from: PlaceDto.nullable(),
  to: PlaceDto.nullable(),
  date: ServiceDateString,
});
export type SavedSearch = z.infer<typeof SavedSearch>;

/**
 * The last search on this tab. The home form restores it on Back, and /search uses it for the
 * place names in the URL (the URL only carries stop ids).
 */
export function readSavedSearch(today: string): SavedSearch {
  const empty = { from: null, to: null, date: today };
  try {
    const parsed = SavedSearch.safeParse(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null"));
    if (!parsed.success) return empty;
    const date = parsed.data.date >= today && parsed.data.date <= addDays(today, MAX_DAYS_AHEAD) ? parsed.data.date : today;
    return { ...parsed.data, date };
  } catch {
    return empty;
  }
}

export function saveSearch(search: SavedSearch): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(search));
  } catch {
    // Storage blocked: the form simply starts empty next time
  }
}
