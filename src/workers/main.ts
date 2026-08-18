/**
 * Entry point do processo de worker — spec §3.2. O desligamento gracioso
 * (C-31) mora em `receipt-worker.ts`; este arquivo só inicializa.
 */

import "./receipt-worker";
import { logger } from "@/shared/logger";

logger.info("worker iniciado, aguardando jobs");
