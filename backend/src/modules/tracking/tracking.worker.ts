import { trackingService } from "./tracking.service";
import { logger } from "../../utils/logger";
export function startTrackingMaintenance() {
  let busy = false,
    lastRetention = 0;
  const interval = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await trackingService.maintain();
      if (Date.now() - lastRetention > 86400000) {
        await trackingService.retention();
        lastRetention = Date.now();
      }
    } catch {
      logger.warn("Tracking maintenance could not complete", {
        code: "TRACKING_MAINTENANCE_FAILED",
      });
    } finally {
      busy = false;
    }
  }, 5000);
  interval.unref();
  return () => clearInterval(interval);
}
