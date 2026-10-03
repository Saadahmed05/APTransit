"use client";

import { type PlaceDto, PlacesSearchResponse } from "@aptransit/shared";
import { Button, cn, Skeleton } from "@aptransit/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, History, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useId, useState, useSyncExternalStore } from "react";
import { api, errorKey } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { readRecentPlaces, rememberPlace } from "../lib/recent-places";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;
const noopSubscribe = () => () => {};

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function placeName(place: PlaceDto, locale: string): string {
  return locale === "te" ? place.nameTe : place.nameEn;
}

export interface PlaceComboboxProps {
  id: string;
  label: string;
  placeholder: string;
  value: PlaceDto | null;
  onChange: (place: PlaceDto | null) => void;
  error?: string;
  /** Leading icon inside the input. */
  icon?: "from" | "to";
}

/**
 * docs/09 PlaceCombobox: ARIA 1.2 combobox with a listbox popup. Searches GET /places/search
 * (English or Telugu, 2 characters, 200 ms debounce), shows recent places when empty.
 */
export function PlaceCombobox({ id, label, placeholder, value, onChange, error, icon = "from" }: PlaceComboboxProps) {
  const t = useTranslations();
  const locale = useLocale();
  const listId = useId();
  const errorId = `${id}-error`;

  /** Text being typed. Null shows the selected place's name. */
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Recent places live in browser storage: read them only after hydration so server and client match.
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [recentOverride, setRecent] = useState<PlaceDto[] | null>(null);
  const recent = recentOverride ?? (mounted ? readRecentPlaces() : []);

  const text = draft ?? (value ? placeName(value, locale) : "");
  const typed = (draft ?? "").trim();
  const debounced = useDebounced(typed, DEBOUNCE_MS);
  const searching = debounced.length >= MIN_CHARS;

  const places = useQuery({
    queryKey: queryKeys.places(debounced),
    queryFn: ({ signal }) =>
      api("/places/search", {
        query: { q: debounced, limit: 10 },
        schema: PlacesSearchResponse,
        signal,
        redirectOn401: false,
      }),
    enabled: searching,
    staleTime: 60_000,
  });

  // While the debounce runs, the old list would be stale: show the skeleton instead.
  const waiting = typed.length >= MIN_CHARS && (typed !== debounced || places.isPending);
  const options: PlaceDto[] = searching ? (waiting ? [] : (places.data ?? [])) : typed.length === 0 ? recent : [];
  const showRecentHeading = !searching && typed.length === 0 && recent.length > 0;
  const popupHasContent =
    options.length > 0 || waiting || (searching && (places.isError || options.length === 0)) || (typed.length > 0 && typed.length < MIN_CHARS);
  const expanded = open && popupHasContent;

  const select = (place: PlaceDto) => {
    onChange(place);
    rememberPlace(place);
    setRecent(readRecentPlaces());
    setDraft(null);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (options.length === 0 ? -1 : Math.min(options.length - 1, i + 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      if (expanded && active >= 0 && options[active]) {
        event.preventDefault();
        select(options[active]);
      }
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      } else {
        setDraft(null);
      }
    }
  };

  const activeId = expanded && active >= 0 && options[active] ? `${listId}-${active}` : undefined;
  const Icon = icon === "from" ? MapPin : Building2;

  let statusText = "";
  if (expanded && searching && !waiting) {
    statusText = places.isError ? t("home.places.error") : t("home.places.count", { count: options.length });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setOpen(true);
            setActive(-1);
            if (value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "h-13 w-full rounded-md border border-strong bg-surface-raised pr-3.5 pl-11 text-body text-fg transition-colors placeholder:text-subtle",
            "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none",
            error && "border-status-danger-solid",
          )}
        />

        <div
          className={cn(
            "absolute inset-x-0 top-full z-overlay mt-1 overflow-hidden rounded-md border border-default bg-surface-raised shadow-md",
            !expanded && "hidden",
          )}
        >
          {showRecentHeading ? (
            <p className="flex items-center gap-2 px-4 pt-3 pb-1 text-caption text-muted">
              <History className="size-4" aria-hidden="true" />
              {t("home.places.recent")}
            </p>
          ) : null}

          <ul id={listId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
            {options.map((place, index) => {
              const PlaceIcon = place.kind === "BUS_STAND" ? Building2 : MapPin;
              const district = locale === "te" ? place.districtNameTe : place.districtNameEn;
              return (
                // Keyboard support lives on the input (aria-activedescendant), as in the ARIA combobox pattern.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={place.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onClick={() => select(place)}
                  // Keep focus in the input so the click lands before blur closes the popup
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActive(index)}
                  className={cn(
                    "flex min-h-13 cursor-pointer items-center gap-3 px-4 py-2",
                    index === active ? "bg-primary-soft" : "hover:bg-surface",
                  )}
                >
                  <PlaceIcon className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body text-fg">{placeName(place, locale)}</span>
                    <span className="truncate text-small text-muted">
                      {place.kind === "BUS_STAND"
                        ? t("home.places.busStandIn", { district })
                        : t("home.places.stopIn", { district })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {waiting ? (
            <div className="flex flex-col gap-3 px-4 py-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton shape="circle" className="size-5" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {typed.length > 0 && typed.length < MIN_CHARS ? (
            <p className="px-4 py-3 text-small text-muted">{t("home.places.minChars")}</p>
          ) : null}

          {searching && !waiting && places.isSuccess && options.length === 0 ? (
            <p className="px-4 py-3 text-small text-muted">{t("home.places.empty", { query: debounced })}</p>
          ) : null}

          {searching && !waiting && places.isError ? (
            <div className="flex flex-col items-start gap-2 px-4 py-3">
              <p className="text-small text-status-danger">{t(errorKey(places.error, (k) => t.has(k)))}</p>
              <Button variant="secondary" onMouseDown={(event) => event.preventDefault()} onClick={() => void places.refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>

      {error ? (
        <p id={errorId} className="text-small text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
