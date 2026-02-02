import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Check if we're on the patient portal (don't redirect for patient routes)
function isPatientPortalRoute(): boolean {
  return window.location.pathname.startsWith("/p/");
}

// Handle session expiration by redirecting to login
function handleSessionExpired() {
  // Don't redirect if on patient portal
  if (isPatientPortalRoute()) return;
  
  // Don't redirect if already on login page
  if (window.location.pathname === "/login") return;
  
  // Redirect to login
  window.location.href = "/login";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Handle session expiration (401) globally
    if (res.status === 401) {
      handleSessionExpired();
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
