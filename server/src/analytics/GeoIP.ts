interface GeoResult {
  country: string;
  city: string;
}

const cache = new Map<string, GeoResult>();
const UNKNOWN: GeoResult = { country: "Unknown", city: "Unknown" };

export async function lookupIP(ip: string): Promise<GeoResult> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return { country: "Local", city: "Local" };
  }

  const cached = cache.get(ip);
  if (cached) return cached;

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city`);
    const data = await res.json();
    if (data.status === "success") {
      const result: GeoResult = { country: data.country || "Unknown", city: data.city || "Unknown" };
      cache.set(ip, result);
      return result;
    }
  } catch { /* network error, use fallback */ }

  cache.set(ip, UNKNOWN);
  return UNKNOWN;
}
