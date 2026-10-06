"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { api } from "./api";
import { useAuth } from "../components/auth-provider";

export function useAdminQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  query: Record<string, string | number | undefined> = {},
) {
  const auth = useAuth();
  return useQuery({
    enabled: auth.status === "authenticated",
    queryKey: ["admin", path, query],
    queryFn: ({ signal }) => api(path, { schema, query, signal }),
  });
}

export function useAdminMutation<TResponse, TBody = unknown>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  schema?: z.ZodType<TResponse>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: TBody }) =>
      api(path, { schema, method, body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}
