import { isIP } from "node:net";

export type ActivityLogLocation = {
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
};

type CachedLocation = {
  expiresAt: number;
  value: ActivityLogLocation | null;
};

const LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_LOCATION_CACHE_ENTRIES = 5000;
const MAX_PENDING_LOOKUPS = 40;
const LOOKUP_MIN_INTERVAL_MS = 1250;
const LOOKUP_TIMEOUT_MS = 2500;

const locationCache = new Map<string, CachedLocation>();
const inFlightLookups = new Map<string, Promise<ActivityLogLocation | null>>();
let lookupQueue: Promise<void> = Promise.resolve();
let lastLookupStartedAt = 0;

function parseIpv6Words(address: string): number[] | null {
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4Part = normalized.slice(lastColon + 1);
    if (isIP(ipv4Part) !== 4) return null;
    const octets = ipv4Part.split(".").map(Number);
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missingWords = 8 - left.length - right.length;
  if ((halves.length === 1 && missingWords !== 0) || (halves.length === 2 && missingWords < 1)) {
    return null;
  }
  const words = [
    ...left,
    ...Array(halves.length === 2 ? missingWords : 0).fill("0"),
    ...right,
  ];
  if (words.length !== 8 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) {
    return null;
  }
  return words.map((word) => parseInt(word, 16));
}

function mappedIpv4FromIpv6(address: string): string | null {
  const words = parseIpv6Words(address);
  if (!words || words.slice(0, 5).some((word) => word !== 0) || words[5] !== 0xffff) {
    return null;
  }
  return [
    words[6] >> 8,
    words[6] & 255,
    words[7] >> 8,
    words[7] & 255,
  ].join(".");
}

export function normalizeClientIp(rawAddress: string | null | undefined): string | null {
  const address = rawAddress?.trim().replace(/^\[|\]$/g, "");
  if (!address || isIP(address) === 0) return null;
  if (isIP(address) === 6) {
    return mappedIpv4FromIpv6(address) ?? address.toLowerCase();
  }
  return address;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c <= 2)
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113)
  );
}

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) return isPublicIpv4(address);
  if (isIP(address) !== 6) return false;

  const mappedIpv4 = mappedIpv4FromIpv6(address);
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  const words = parseIpv6Words(address);
  if (!words) return false;
  const first = words[0];
  if (first < 0x2000 || first > 0x3fff) return false;
  if (
    (first === 0x2001 && words[1] === 0x0db8)
    || (first === 0x2001 && words[1] === 0)
    || first === 0x2002
    || (first === 0x3fff && (words[1] & 0xf000) === 0)
  ) {
    return false;
  }
  return true;
}

function providerText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
  return normalized || null;
}

async function fetchLocationFromProvider(ip: string): Promise<ActivityLogLocation | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://free.freeipapi.com/api/v1/json/${encodeURIComponent(ip)}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const data = await response.json() as Record<string, unknown>;
    const location: ActivityLogLocation = {
      location_city: providerText(data.cityName),
      location_region: providerText(data.regionName),
      location_country: providerText(data.countryName),
    };
    return Object.values(location).some(Boolean) ? location : null;
  } finally {
    clearTimeout(timeout);
  }
}

function enqueueLocationLookup(ip: string): Promise<ActivityLogLocation | null> {
  const lookup = lookupQueue.then(async () => {
    const waitMs = Math.max(0, lastLookupStartedAt + LOOKUP_MIN_INTERVAL_MS - Date.now());
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    lastLookupStartedAt = Date.now();
    return fetchLocationFromProvider(ip);
  });
  lookupQueue = lookup.then(() => undefined, () => undefined);
  return lookup;
}

function cacheResult(ip: string, value: ActivityLogLocation | null, ttlMs: number): void {
  if (locationCache.size >= MAX_LOCATION_CACHE_ENTRIES && !locationCache.has(ip)) {
    const oldestKey = locationCache.keys().next().value;
    if (oldestKey) locationCache.delete(oldestKey);
  }
  locationCache.delete(ip);
  locationCache.set(ip, { expiresAt: Date.now() + ttlMs, value });
}

export async function lookupActivityLogLocation(
  rawAddress: string | null | undefined,
): Promise<ActivityLogLocation | null> {
  const ip = normalizeClientIp(rawAddress);
  if (!ip || !isPublicIp(ip)) return null;

  const cached = locationCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    locationCache.delete(ip);
    locationCache.set(ip, cached);
    return cached.value;
  }
  if (cached) locationCache.delete(ip);

  const inFlight = inFlightLookups.get(ip);
  if (inFlight) return inFlight;

  if (inFlightLookups.size >= MAX_PENDING_LOOKUPS) {
    cacheResult(ip, null, FAILED_LOOKUP_CACHE_TTL_MS);
    return null;
  }

  const lookup = enqueueLocationLookup(ip)
    .then((location) => {
      cacheResult(
        ip,
        location,
        location ? LOCATION_CACHE_TTL_MS : FAILED_LOOKUP_CACHE_TTL_MS,
      );
      return location;
    })
    .catch(() => {
      cacheResult(ip, null, FAILED_LOOKUP_CACHE_TTL_MS);
      return null;
    });

  inFlightLookups.set(ip, lookup);
  try {
    return await lookup;
  } finally {
    inFlightLookups.delete(ip);
  }
}