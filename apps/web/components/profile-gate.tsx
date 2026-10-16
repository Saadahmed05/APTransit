"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { needsProfile, welcomeHref } from "../lib/profile";
import { useMe } from "./auth-provider";

/**
 * D-048: sends a signed in citizen with an incomplete profile (name, verified email, phone) to
 * /welcome. Guests and staff are never touched. Renders nothing.
 */
export function ProfileGate() {
  const me = useMe();
  const router = useRouter();
  const incomplete = needsProfile(me.data);

  useEffect(() => {
    if (!incomplete) return;
    router.replace(welcomeHref(`${window.location.pathname}${window.location.search}`));
  }, [incomplete, router]);

  return null;
}
