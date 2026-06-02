/**
 * Earliest startup side-effects — imported FIRST by main/index.ts, before any
 * other ClawX module, so the environment is settled before module-level
 * `.openclaw` path constants are evaluated at import time.
 *
 * 1. Apply CLAWX_USER_DATA_DIR (isolated profiles: dev sandbox, parallel
 *    installed instances, E2E) so app.getPath('userData') — and the
 *    single-instance lock that keys on it — point at the isolated dir.
 * 2. Default OPENCLAW_HOME to the (now isolated) userData dir so the bundled
 *    gateway and ClawX both resolve OpenClaw config to <userData>/.openclaw,
 *    fully isolated from a standalone official OpenClaw at ~/.openclaw.
 *    OPENCLAW_HOME overrides HOME/USERPROFILE in OpenClaw's resolveRawHomeDir;
 *    an explicit value (dev profiles, power users) is preserved.
 */
import { app } from 'electron';

const requestedUserDataDir = process.env.CLAWX_USER_DATA_DIR?.trim();
if (requestedUserDataDir) {
  app.setPath('userData', requestedUserDataDir);
}

if (!process.env.OPENCLAW_HOME?.trim()) {
  process.env.OPENCLAW_HOME = app.getPath('userData');
}
