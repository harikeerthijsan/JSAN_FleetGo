export type Point = [number, number];
const rad = (v: number) => (v * Math.PI) / 180;
export function distance(a: Point, b: Point) {
  const lat = rad(b[0] - a[0]),
    lon = rad(b[1] - a[1]);
  const h =
    Math.sin(lat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function insidePolygon(p: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[0] > p[0] !== b[0] > p[0] &&
      p[1] < ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]) + a[1]
    )
      inside = !inside;
  }
  return inside;
}
export function polygonValid(ring: Point[]) {
  if (
    ring.length < 4 ||
    new Set(ring.slice(0, -1).map((p) => p.join(","))).size !== ring.length - 1
  )
    return false;
  const cross = (a: Point, b: Point, c: Point) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    for (let j = i + 2; j < ring.length - 1; j++) {
      if (i === 0 && j === ring.length - 2) continue;
      const a = ring[i],
        b = ring[i + 1],
        c = ring[j],
        d = ring[j + 1];
      if (
        cross(a, b, c) * cross(a, b, d) <= 0 &&
        cross(c, d, a) * cross(c, d, b) <= 0
      )
        return false;
    }
  }
  return Math.abs(area) > 1e-10;
}
/** Local projected point-to-segment distance, used only with a supplied approved polyline. */
export function routeDistance(p: Point, route: Point[]) {
  let best = Infinity;
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      b = route[i],
      scale = Math.cos(rad(p[0]));
    const ax = rad(wrap(a[1] - p[1])) * 6371000 * scale,
      ay = rad(a[0] - p[0]) * 6371000,
      bx = rad(wrap(b[1] - p[1])) * 6371000 * scale,
      by = rad(b[0] - p[0]) * 6371000;
    const dx = bx - ax,
      dy = by - ay;
    const t = Math.max(
      0,
      Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
    );
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
