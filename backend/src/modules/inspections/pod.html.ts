/**
 * Renders a Proof of Delivery as a self-contained, printable HTML document.
 *
 * The browser's "Save as PDF" / print produces the downloadable PDF — this
 * avoids bundling a heavy server-side PDF engine while still delivering a
 * print-ready POD. Photographic evidence is referenced by authorized download
 * paths (never inlined), and image differences are never presented as damage.
 */

interface PodRecord {
  reference: string;
  generatedAt: Date | string;
  summary: unknown;
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: unknown): string {
  return `<tr><th>${esc(label)}</th><td>${esc(value ?? "—")}</td></tr>`;
}

export function renderPodHtml(pod: PodRecord): string {
  const s = pod.summary as Record<string, any>;
  const v = s.vehicle ?? {};
  const parties = s.handoverParties ?? {};
  const insp = s.inspectionSummary ?? {};
  const discrepancies: any[] = Array.isArray(s.discrepancies) ? s.discrepancies : [];
  const photo = s.photoEvidence ?? { preDispatch: [], receiving: [] };

  const discRows = discrepancies.length
    ? discrepancies
        .map(
          (d) =>
            `<tr><td>${esc(d.reference)}</td><td>${esc(d.category)}</td><td>${esc(
              d.severity,
            )}</td><td>${esc(d.status)}</td><td>${esc(d.description)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No discrepancies recorded.</td></tr>`;

  const partyBlock = (title: string, p: any) =>
    p
      ? `<div class="party"><h4>${esc(title)} — ${esc(p.reference)}</h4>
          <p><strong>Handed over by:</strong> ${esc(p.handedOverBy ?? "—")}</p>
          <p><strong>Received by:</strong> ${esc(p.receivedBy ?? "—")}</p>
          <p><strong>Acknowledgements:</strong> ${
            (p.acknowledgements ?? [])
              .map(
                (x: any) =>
                  `${esc(x.party)}: ${esc(x.name)} (${x.acknowledged ? "acknowledged" : "declined"})`,
              )
              .join("; ") || "None recorded"
          }</p></div>`
      : `<div class="party"><h4>${esc(title)}</h4><p>No handover recorded.</p></div>`;

  const photoList = (items: any[]) =>
    items.length
      ? `<ul>${items
          .map((p) => `<li>${esc(p.category)} — <code>${esc(p.downloadPath)}</code></li>`)
          .join("")}</ul>`
      : "<p>No photographs referenced.</p>";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Proof of Delivery ${esc(pod.reference)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 2px solid #0b5; padding-bottom: 4px; }
  h4 { margin: 8px 0 4px; font-size: 13px; }
  .meta { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }
  th { background: #f4f7f5; width: 32%; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .party { background: #fafafa; border: 1px solid #eee; padding: 8px 12px; border-radius: 6px; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 11px; }
  .banner { background: #fff8e1; border: 1px solid #f0d27a; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin: 12px 0; }
  @media print { body { padding: 0; } button { display: none; } }
</style></head>
<body>
  <button onclick="window.print()" style="float:right;padding:8px 16px;">Print / Save as PDF</button>
  <h1>FleetGo — Proof of Delivery</h1>
  <p class="meta">${esc(pod.reference)} · Generated ${esc(
    new Date(pod.generatedAt).toLocaleString(),
  )}</p>
  <div class="banner">This POD summarizes validated operational records. Photographic evidence is retrievable only via authorized FleetGo download endpoints. Image differences are not automatically treated as damage; discrepancies require authorized inspector confirmation.</div>

  <h2>Vehicle</h2>
  <table>
    ${row("Vehicle code", v.vehicleCode)}
    ${row("Registration number", v.registrationNumber)}
    ${row("VIN / chassis", v.vin)}
  </table>

  <h2>References</h2>
  <table>
    ${row("Ticket", s.ticketReference)}
    ${row("Dispatch", s.dispatchReference)}
    ${row("Trip", s.tripReference)}
    ${row("Source depot", s.source?.name)}
    ${row("Destination depot", s.destination?.name)}
    ${row("Destination address", s.destinationAddress)}
    ${row("Dispatched at", s.dispatchedAt ? new Date(s.dispatchedAt).toLocaleString() : "—")}
    ${row("Received at", s.receivedAt ? new Date(s.receivedAt).toLocaleString() : "—")}
  </table>

  <h2>Handover parties</h2>
  <div class="grid">
    ${partyBlock("Dispatch handover", parties.dispatch)}
    ${partyBlock("Receiving handover", parties.receiving)}
  </div>

  <h2>Inspection summary</h2>
  <table>
    ${row(
      "Pre-dispatch inspection",
      insp.preDispatch
        ? `${insp.preDispatch.reference} · ${insp.preDispatch.status} · ${insp.preDispatch.photoCount} photo(s)`
        : "Not recorded",
    )}
    ${row(
      "Receiving inspection",
      insp.receiving
        ? `${insp.receiving.reference} · ${insp.receiving.status} · outcome ${insp.receiving.outcome ?? "—"} · ${insp.receiving.photoCount} photo(s)`
        : "Not recorded",
    )}
  </table>

  <h2>Photographic evidence references</h2>
  <div class="grid">
    <div><h4>Pre-dispatch</h4>${photoList(photo.preDispatch ?? [])}</div>
    <div><h4>Receiving</h4>${photoList(photo.receiving ?? [])}</div>
  </div>

  <h2>Discrepancies ${
    s.unresolvedDiscrepancies
      ? `<span style="color:#b00">(${esc(s.unresolvedDiscrepancies)} unresolved)</span>`
      : ""
  }</h2>
  <table>
    <tr><th>Reference</th><th>Category</th><th>Severity</th><th>Status</th><th>Description</th></tr>
    ${discRows}
  </table>

  <p class="meta" style="margin-top:32px">This document does not by itself confirm custody transfer or operational delivery; those remain governed by the authorized FleetGo operational workflow.</p>
</body></html>`;
}
