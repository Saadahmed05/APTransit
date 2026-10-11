"use client";
import {
  formatDate,
  formatTime,
  SCAN_RESULT_MAP,
  ValidateTicketResult,
  type ValidateTicketInput,
} from "@aptransit/shared";
import { Button, EmptyState, ErrorState, Input, Skeleton, cn } from "@aptransit/ui";
import { Camera, CircleCheck, CircleX, Flashlight, Volume2, VolumeX, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { api, errorKey } from "../../../lib/api";
import { useConductorToday } from "../../../lib/conductor-today";
import {
  scannerFeedback,
  toggleScannerMuted,
  unlockScannerAudio,
  useScannerMuted,
} from "../../../lib/scanner-feedback";
type Result = ValidateTicketResult;
export function ConductorScanner() {
  const t = useTranslations("conductorApp"),
    root = useTranslations(),
    locale = useLocale(),
    today = useConductorToday(),
    client = useQueryClient();
  const video = useRef<HTMLVideoElement>(null),
    camera = useRef<QrScanner | null>(null),
    manualMode = useRef(false),
    busy = useRef(false),
    last = useRef({ text: "", at: 0 }),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cameraState, setCameraState] = useState<"prompt" | "active" | "denied" | "missing">(
    "prompt",
  );
  const [hasTorch, setHasTorch] = useState(false),
    [torch, setTorch] = useState(false),
    [manual, setManual] = useState(false);
  const [ticketNumber, setTicketNumber] = useState(""),
    [liveCode, setLiveCode] = useState("");
  const [result, setResult] = useState<Result | null>(null),
    [checking, setChecking] = useState(false),
    [pending, setPending] = useState(false),
    [failure, setFailure] = useState<unknown>(null),
    [elapsed, setElapsed] = useState<number | null>(null);
  const muted = useScannerMuted(),
    tripId = today.data?.trip?.id;
  const resume = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setResult(null);
    setFailure(null);
    setChecking(false);
    setPending(false);
    busy.current = false;
  }, []);
  const validate = useCallback(
    async (payload: { qr: string } | { ticketNumber: string; liveCode: string }) => {
      const text = "qr" in payload ? payload.qr : payload.ticketNumber + ":" + payload.liveCode,
        now = performance.now();
      if (
        ("qr" in payload && manualMode.current) ||
        !tripId || busy.current || (last.current.text === text && now - last.current.at < 3000)
      )
        return;
      last.current = { text, at: now };
      busy.current = true;
      setPending(true);
      setFailure(null);
      navigator.vibrate?.(30);
      const delayed = setTimeout(() => setChecking(true), 300);
      try {
        const body: ValidateTicketInput = {
          ...payload,
          tripId,
          deviceTime: new Date().toISOString(),
        };
        const value = await api("/tickets/validate", {
          method: "POST",
          body,
          schema: ValidateTicketResult,
        });
        const ms = Math.round(performance.now() - now);
        setElapsed(ms);
        setResult(value);
        scannerFeedback(value.result === "VALID");
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.info("Scanner decode to result (ms):", ms);
        }
        void client.invalidateQueries({ queryKey: ["conductor"] });
        timer.current = setTimeout(resume, 3000);
      } catch (error) {
        setFailure(error);
        setPending(false);
        busy.current = false;
      } finally {
        clearTimeout(delayed);
        setChecking(false);
      }
    },
    [tripId, client, resume],
  );
  const decode = useRef(validate);
  useEffect(() => {
    decode.current = validate;
  }, [validate]);
  const startCamera = useCallback(async () => {
    unlockScannerAudio();
    try {
      const { default: Scanner } = await import("qr-scanner");
      if (!(await Scanner.hasCamera())) {
        setCameraState("missing");
        return;
      }
      if (!video.current || manualMode.current) return;
      if (!camera.current)
        camera.current = new Scanner(
          video.current,
          (value) => void decode.current({ qr: value.data }),
          {
            preferredCamera: "environment",
            highlightScanRegion: false,
            highlightCodeOutline: false,
            maxScansPerSecond: 10,
            returnDetailedScanResult: true,
            onDecodeError: () => undefined,
          },
        );
      await camera.current.start();
      if (manualMode.current) {
        camera.current.stop();
        return;
      }
      setCameraState("active");
      setHasTorch(await camera.current.hasFlash());
    } catch {
      setCameraState(navigator.mediaDevices ? "denied" : "missing");
    }
  }, []);
  useEffect(() => {
    let alive = true;
    if (tripId && navigator.permissions)
      void navigator.permissions
        .query({ name: "camera" as PermissionName })
        .then((permission) => {
          if (!alive) return;
          if (permission.state === "granted") void startCamera();
          else if (permission.state === "denied") setCameraState("denied");
        })
        .catch(() => undefined);
    return () => {
      alive = false;
      camera.current?.destroy();
      camera.current = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tripId, startCamera]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_PAYMENTS_FAKE !== "1") return;
    const inject = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (typeof value === "string") void decode.current({ qr: value });
    };
    window.addEventListener("apt:test-scan", inject);
    return () => window.removeEventListener("apt:test-scan", inject);
  }, []);
  if (today.isLoading)
    return (
      <div aria-busy="true">
        <h1 className="sr-only">{t("scan")}</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (today.isError)
    return (
      <ErrorState
        headingLevel="h1"
        title={t("error")}
        message={root(errorKey(today.error, (k) => root.has(k)))}
        retryLabel={root("common.retry")}
        onRetry={() => void today.refetch()}
      />
    );
  if (!tripId || today.data?.trip?.status !== "RUNNING")
    return (
      <EmptyState
        icon={Camera}
        headingLevel="h1"
        title={t("notRunning")}
        hint={t("emptyHelper")}
        action={
          <Button size="xl" asChild>
            <Link href="/conductor">{t("back")}</Link>
          </Button>
        }
      />
    );
  const context = result?.context;
  // D-035: the ticket's own stop for the segment reasons
  const segmentStop =
    result?.reason === "PAST_DESTINATION" ? context?.ticketTo : result?.reason === "BEFORE_BOARDING_STOP" ? context?.ticketFrom : undefined;
  const helpers = {
    time:
      result?.reason === "ALREADY_SCANNED" && result.earlierScanAt
        ? formatTime(result.earlierScanAt, locale)
        : result?.reason === "WRONG_TRIP" && context?.departureAt
          ? formatTime(context.departureAt, locale)
          : result?.reason === "NOT_YET_VALID" && context?.validFrom
            ? formatTime(context.validFrom, locale)
            : context?.validUntil
              ? formatTime(context.validUntil, locale)
              : t("unavailable"),
    stop: segmentStop ? (locale === "te" ? segmentStop.nameTe : segmentStop.nameEn) : t("unavailable"),
    route: context?.route ?? t("unavailable"),
    date: context?.serviceDate ? formatDate(context.serviceDate, locale) : t("unavailable"),
    services:
      context?.services?.map((service) => root("serviceType." + service)).join(", ") ??
      t("unavailable"),
  };
  const status = result ? SCAN_RESULT_MAP[result.result] : null;
  return (
    <section className="fixed inset-0 z-overlay flex min-h-screen flex-col overflow-y-auto bg-bg text-body-lg text-fg">
      <h1 className="sr-only">{t("scan")}</h1>
      <video
        ref={video}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        playsInline
        aria-hidden="true"
      />
      <div className="relative z-sticky flex items-center justify-between gap-2 bg-surface-raised p-3">
        <Button size="xl" variant="secondary" asChild aria-label={root("common.close")}>
          <Link href="/conductor">
            <X className="size-6" aria-hidden="true" />
          </Link>
        </Button>
        <Button
          size="xl"
          variant="secondary"
          aria-pressed={muted}
          aria-label={muted ? t("unmute") : t("mute")}
          onClick={toggleScannerMuted}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Button>
        {hasTorch && (
          <Button
            size="xl"
            variant="secondary"
            aria-pressed={torch}
            aria-label={t("torch")}
            onClick={() =>
              void camera.current
                ?.toggleFlash()
                .then(() => setTorch(camera.current?.isFlashOn() ?? false))
                .catch(() => setHasTorch(false))
            }
          >
            <Flashlight aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-4 p-gutter">
        {!manual && cameraState === "active" && (
          <>
            <div
              className="aspect-square w-64 max-w-full rounded-lg border-4 border-qr-paper"
              aria-hidden="true"
            />
            <p className="rounded-md bg-scrim p-3 text-on-solid">{t("frame")}</p>
          </>
        )}
        {!manual && cameraState !== "active" && (
          <div className="flex max-w-md flex-col gap-4 rounded-lg bg-surface-raised p-6">
            <h2 className="text-h2">
              {t(
                cameraState === "prompt"
                  ? "cameraTitle"
                  : cameraState === "denied"
                    ? "cameraDenied"
                    : "noCamera",
              )}
            </h2>
            <p>
              {t(
                cameraState === "prompt"
                  ? "cameraWhy"
                  : cameraState === "denied"
                    ? "cameraHelp"
                    : "noCameraHelp",
              )}
            </p>
            {cameraState !== "missing" && (
              <Button size="xl" onClick={() => void startCamera()}>
                {t("enableCamera")}
              </Button>
            )}
          </div>
        )}
        {manual && (
          <form
            className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-surface-raised p-6"
            onSubmit={(event) => {
              event.preventDefault();
              unlockScannerAudio();
              void validate({
                ticketNumber: ticketNumber.trim().toUpperCase(),
                liveCode: liveCode.trim().toUpperCase(),
              });
            }}
          >
            <h2 className="text-h2">{t("manual")}</h2>
            <p>{t("manualHelp")}</p>
            <label htmlFor="ticket-number">{t("ticketNumber")}</label>
            <Input
              id="ticket-number"
              className="min-h-14"
              required
              value={ticketNumber}
              onChange={(e) => setTicketNumber(e.target.value.toUpperCase())}
              maxLength={13}
              autoCapitalize="characters"
              pattern="APT-[0-9A-HJKMNP-Z]{4}-[0-9A-HJKMNP-Z]{4}"
              autoComplete="off"
            />
            <label htmlFor="live-code">{t("liveCode")}</label>
            <Input
              id="live-code"
              className="min-h-14 font-mono"
              required
              value={liveCode}
              onChange={(e) => setLiveCode(e.target.value.toUpperCase())}
              minLength={8}
              maxLength={8}
              pattern="[A-Z2-7]{8}"
              autoComplete="off"
            />
            <Button size="xl" type="submit" disabled={pending}>
              {t("check")}
            </Button>
          </form>
        )}
        {failure !== null && (
          <div role="alert" className="rounded-lg bg-surface-raised p-4">
            <p>{root(errorKey(failure, (k) => root.has(k)))}</p>
            <Button size="xl" variant="secondary" onClick={resume}>
              {root("common.retry")}
            </Button>
          </div>
        )}
        <Button
          size="xl"
          variant="secondary"
          onClick={() => {
            const next = !manual;
            manualMode.current = next;
            setManual(next);
            unlockScannerAudio();
            if (next) {
              camera.current?.stop();
              setTorch(false);
            } else if (cameraState === "active") {
              void startCamera();
            }
          }}
        >
          {t(manual ? "useCamera" : "manual")}
        </Button>
      </div>
      {checking && (
        <div
          role="status"
          className="absolute inset-0 z-sheet flex items-center justify-center bg-surface-raised text-display"
        >
          {t("checking")}
        </div>
      )}
      {result && status && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={cn(
            "absolute inset-0 z-dialog flex min-h-screen flex-col items-center justify-center gap-4 overflow-y-auto p-gutter text-center text-on-solid",
            status.tone === "success" ? "bg-status-success-solid" : "bg-status-danger-solid",
          )}
        >
          {status.icon === "circle-check" ? (
            <CircleCheck className="size-24" aria-hidden="true" />
          ) : (
            <CircleX className="size-24" aria-hidden="true" />
          )}
          <p className="text-display">{root(status.i18nKey)}</p>
          <p className="text-h2">{t("reasons." + result.reason + ".line")}</p>
          {result.group && (
            <p className="text-h2 tabular-nums">{t("groupBoarded", { boarded: result.group.boarded, size: result.group.size })}</p>
          )}
          <p>{t("reasons." + result.reason + ".helper", helpers)}</p>
          {result.ticket && (
            <dl className="flex flex-col gap-3 text-h2">
              <div>
                <dt className="sr-only">{t("passenger")}</dt>
                <dd>{result.ticket.passengerName}</dd>
              </div>
              <div>
                <dt className="sr-only">{t("seatLabel")}</dt>
                <dd>
                  {result.ticket.seatNo
                    ? t("seat", { seat: result.ticket.seatNo })
                    : t("unreserved")}
                </dd>
              </div>
              <div>
                <dt className="sr-only">{t("route")}</dt>
                <dd>{result.ticket.routeName}</dd>
              </div>
              <div>
                <dt className="sr-only">{t("boarding")}</dt>
                <dd>{result.ticket.boarding}</dd>
              </div>
              <div>
                <dt className="sr-only">{t("dropping")}</dt>
                <dd>{result.ticket.dropping}</dd>
              </div>
            </dl>
          )}
          {process.env.NODE_ENV === "development" && elapsed !== null && (
            <p className="text-small">{t("timing", { ms: elapsed })}</p>
          )}
          <button
            type="button"
            className="absolute inset-0 min-h-14 min-w-14 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-on-solid"
            aria-label={t("continue")}
            onClick={resume}
          />
          <p className="text-small">{t("continue")}</p>
        </div>
      )}
    </section>
  );
}
