/**
 * Normalizes the API Gateway base URL for seed/reset scripts.
 * Collapses accidental double schemes (e.g. https://https://host…) which
 * otherwise make `new URL()` treat "https" as the hostname and DNS fails
 * with getaddrinfo EAI_AGAIN https.
 */
export function normalizeApiBase(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "");

  // Copy-paste typo: "https://https//host" (second scheme missing ":")
  t = t.replace(/^https:\/\/https\/\//i, "https://");

  while (/^https?:\/\/https?:\/\//i.test(t)) {
    t = t.replace(/^https?:\/\//i, "");
  }

  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`;
  }

  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error(`Invalid API URL: ${JSON.stringify(raw)}`);
  }

  if (!u.hostname || u.hostname === "https" || u.hostname === "http") {
    throw new Error(
      `Invalid API URL (hostname is "${u.hostname}"). Use the execute-api host only once, e.g. https://xxxxx.execute-api.us-west-2.amazonaws.com — raw: ${JSON.stringify(raw)}`
    );
  }

  return `${u.protocol}//${u.host}`;
}
