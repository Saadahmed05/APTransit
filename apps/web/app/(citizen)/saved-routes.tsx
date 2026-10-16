"use client";

import { type PlaceDto, type SavedRouteDto, SavedRoutesResponse, SaveRouteInput } from "@aptransit/shared";
import { Button, toast } from "@aptransit/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "../../components/auth-provider";
import { api, errorKey } from "../../lib/api";

const KEY = ["me", "saved-routes"] as const;

/** A saved route's stop is enough to fill the From and To boxes. */
const asPlace = (s: SavedRouteDto["from"]): PlaceDto => ({
  id: s.id,
  kind: "STOP",
  nameEn: s.nameEn,
  nameTe: s.nameTe,
  districtNameEn: "",
  districtNameTe: "",
});

/**
 * D-048: one tap routes saved by the citizen, and a button to save or unsave the pair now in the
 * From and To boxes. Only for signed in citizens; guests see nothing.
 */
export function SavedRoutes({
  from,
  to,
  onPick,
}: {
  from: PlaceDto | null;
  to: PlaceDto | null;
  onPick: (from: PlaceDto, to: PlaceDto) => void;
}) {
  const t = useTranslations("home.saved");
  const tAll = useTranslations();
  const locale = useLocale();
  const { status } = useAuth();
  const queryClient = useQueryClient();
  const routes = useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => api("/me/saved-routes", { schema: SavedRoutesResponse, signal }),
    enabled: status === "authenticated",
    staleTime: 60_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY });
  const fail = (err: unknown) => toast.error(tAll(errorKey(err, (k) => tAll.has(k))));
  const save = useMutation({
    mutationFn: (input: SaveRouteInput) => api("/me/saved-routes", { method: "POST", body: input }),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/me/saved-routes/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: fail,
  });

  if (status !== "authenticated") return null;
  const name = (p: { nameEn: string; nameTe: string }) => (locale === "te" ? p.nameTe : p.nameEn);
  const list = routes.data ?? [];
  const current = from && to ? list.find((r) => r.from.id === from.id && r.to.id === to.id) : undefined;
  const canSave = Boolean(from && to && from.id !== to.id);

  return (
    <div className="flex flex-col gap-3 border-t border-default pt-4">
      {list.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-small font-medium text-muted">{t("title")}</h3>
          <ul className="flex flex-wrap gap-2">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onPick(asPlace(r.from), asPlace(r.to))}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-default bg-surface px-4 text-small text-fg hover:border-strong"
                >
                  <Bookmark className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="truncate">{t("pair", { from: name(r.from), to: name(r.to) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canSave ? (
        <Button
          variant="secondary"
          className="self-start"
          loading={save.isPending || remove.isPending}
          leftIcon={
            current ? (
              <BookmarkCheck className="size-4" aria-hidden="true" />
            ) : (
              <Bookmark className="size-4" aria-hidden="true" />
            )
          }
          onClick={() =>
            current
              ? remove.mutate(current.id)
              : save.mutate(SaveRouteInput.parse({ fromStopId: from!.id, toStopId: to!.id }))
          }
        >
          {current ? t("unsave") : t("save")}
        </Button>
      ) : null}
    </div>
  );
}
