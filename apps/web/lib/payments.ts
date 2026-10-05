"use client";

import { BookingDto, PassDto, PaymentOrderDto, VerifyPaymentResult } from "@aptransit/shared";
import { z } from "zod";
import { useCallback, useRef, useState } from "react";
import { api, isApiError } from "./api";

// Razorpay test checkout (docs/03 Book and pay). Day 7 prompt: one script load, no double press,
// dismiss keeps the hold, failure can retry, and a lost connection after paying falls back to
// polling the booking (the webhook confirms it on the server).

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const POLL_EVERY_MS = 3_000;
const POLL_FOR_MS = 30_000;

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", handler: (response: unknown) => void): void;
}

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

let checkoutScript: Promise<RazorpayConstructor> | null = null;

/** Loads checkout.js once per page. Rejects (and allows a later retry) when it is blocked. */
function loadCheckout(): Promise<RazorpayConstructor> {
  const existing = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  if (!checkoutScript) {
    checkoutScript = new Promise<RazorpayConstructor>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_SRC;
      script.async = true;
      script.onload = () => {
        const ctor = (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
        if (ctor) resolve(ctor);
        else reject(new Error("checkout.js loaded without Razorpay"));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("checkout.js blocked"));
      };
      document.head.appendChild(script);
    }).catch((err: unknown) => {
      checkoutScript = null;
      throw err;
    });
  }
  return checkoutScript;
}

export type PaymentPhase = "idle" | "working" | "dismissed" | "failed" | "blocked" | "checking";

export interface PaymentState {
  phase: PaymentPhase;
  /** i18n key of the error, for phase "failed" */
  errorKey?: string;
}

/** What is being paid for: a booking (tickets) or a pass (Day 9). */
export type PayTarget = { bookingId: string; passId?: undefined } | { passId: string; bookingId?: undefined };

export type PayInput = PayTarget & {
  /** Checkout name and description, already translated. */
  name: string;
  description: string;
  /** Called once the server confirmed it (tickets exist, or the pass is READY), with the booking or pass id. */
  onConfirmed: (id: string) => void;
};

const isFake = () => process.env.NEXT_PUBLIC_PAYMENTS_FAKE === "1";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PassList = z.array(PassDto);

/** "paid", "pending" or "gone" for the booking or pass, from the server. */
async function confirmationState(target: PayTarget): Promise<"paid" | "pending" | "gone"> {
  if (target.passId) {
    const pass = (await api("/passes", { schema: PassList })).find((p) => p.id === target.passId);
    if (!pass) return "gone";
    return pass.status === "PENDING_PAYMENT" ? "pending" : pass.status === "READY" || pass.status === "ACTIVE" ? "paid" : "gone";
  }
  const booking = await api(`/bookings/${target.bookingId}`, { schema: BookingDto });
  return booking.status === "CONFIRMED" ? "paid" : booking.status === "PENDING_PAYMENT" ? "pending" : "gone";
}

/** Polls for up to 30 s. True when the server confirmed the booking or pass. */
async function waitForConfirmation(target: PayTarget): Promise<boolean> {
  const until = Date.now() + POLL_FOR_MS;
  while (Date.now() < until) {
    try {
      const state = await confirmationState(target);
      if (state === "paid") return true;
      if (state === "gone") return false;
    } catch {
      // Still offline: keep trying until the time is up
    }
    await wait(POLL_EVERY_MS);
  }
  return false;
}

function primaryColour(): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return value || undefined;
}

export function usePayment() {
  const [state, setState] = useState<PaymentState>({ phase: "idle" });
  const busy = useRef(false);

  const pay = useCallback(async (input: PayInput) => {
    const { name, description, onConfirmed } = input;
    const target: PayTarget = input.passId ? { passId: input.passId } : { bookingId: input.bookingId! };
    const targetId = target.passId ?? target.bookingId!;
    if (busy.current) return; // The Pay button cannot be pressed twice
    busy.current = true;
    setState({ phase: "working" });

    const fail = (err: unknown) => {
      const code = isApiError(err) ? err.code : "INTERNAL";
      setState({ phase: "failed", errorKey: code === "NETWORK" || code === "INTERNAL" ? "book.review.payFailed" : `errors.${code}` });
      busy.current = false;
    };

    let order: PaymentOrderDto;
    try {
      order = await api("/payments/orders", { method: "POST", body: target, schema: PaymentOrderDto });
    } catch (err) {
      fail(err);
      return;
    }

    // Dev and CI only: no popup, the API simulates a captured payment
    if (isFake()) {
      try {
        await api("/payments/test/complete", { method: "POST", body: { orderId: order.orderId }, schema: VerifyPaymentResult });
        onConfirmed(targetId);
      } catch (err) {
        fail(err);
      }
      return;
    }

    let Razorpay: RazorpayConstructor;
    try {
      Razorpay = await loadCheckout();
    } catch {
      setState({ phase: "blocked" });
      busy.current = false;
      return;
    }

    const verify = async (response: RazorpaySuccess) => {
      setState({ phase: "working" });
      // One key per successful checkout: a retried verify cannot double confirm
      const idempotencyKey = crypto.randomUUID();
      try {
        await api("/payments/verify", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: {
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          },
          schema: VerifyPaymentResult,
        });
        onConfirmed(targetId);
      } catch (err) {
        // Paid, but the answer was lost: the webhook may still confirm it
        if (isApiError(err) && (err.code === "NETWORK" || err.status >= 500)) {
          setState({ phase: "checking" });
          if (await waitForConfirmation(target)) onConfirmed(targetId);
          else busy.current = false;
          return;
        }
        fail(err);
      }
    };

    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name,
      description,
      prefill: {
        name: order.prefill.name ?? undefined,
        email: order.prefill.email ?? undefined,
        contact: order.prefill.contact ?? undefined,
      },
      theme: { color: primaryColour() },
      handler: (response: RazorpaySuccess) => void verify(response),
      modal: {
        // Closed without paying: stay on review, the hold timer keeps running
        ondismiss: () => {
          setState({ phase: "dismissed" });
          busy.current = false;
        },
      },
    });
    checkout.on("payment.failed", () => {
      setState({ phase: "failed", errorKey: "book.review.payFailed" });
      busy.current = false;
    });
    checkout.open();
  }, []);

  return { state, pay };
}
