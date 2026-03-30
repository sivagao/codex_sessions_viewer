import {
  buildBridgeBaseUrls,
  type BridgeHealthPayload
} from "@csv/core";

type LocalNetworkRequestInit = RequestInit & {
  targetAddressSpace?: "local";
};

export async function probeBridge(): Promise<BridgeHealthPayload | null> {
  for (const baseUrl of buildBridgeBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}/bridge/health`, {
        targetAddressSpace: "local"
      } as LocalNetworkRequestInit);
      if (!response.ok) {
        continue;
      }

      return (await response.json()) as BridgeHealthPayload;
    } catch {
      continue;
    }
  }

  return null;
}

export async function bridgeFetch<T>(
  bridgeBaseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${bridgeBaseUrl}${path}`, {
    ...init,
    targetAddressSpace: "local"
  } as LocalNetworkRequestInit);
  if (!response.ok) {
    throw new Error(`Bridge request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
