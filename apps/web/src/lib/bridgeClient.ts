import {
  buildBridgeBaseUrls,
  type BridgeHealthPayload
} from "@csv/core";

export async function probeBridge(): Promise<BridgeHealthPayload | null> {
  for (const baseUrl of buildBridgeBaseUrls()) {
    try {
      const response = await fetch(`${baseUrl}/bridge/health`);
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
  const response = await fetch(`${bridgeBaseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Bridge request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
