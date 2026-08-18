/**
 * Entry point do processo de worker — spec §3.2. Desligamento gracioso
 * (C-31) centralizado aqui, não em cada worker — dois handlers de
 * SIGTERM independentes correm o risco de um `process.exit(0)` matar o
 * processo antes do outro fechar sua conexão (achado ao adicionar o
 * worker de renovação de assinatura, decisão [25]).
 */

import { receiptWorker } from "./receipt-worker";
import { billingRenewalWorker } from "./billing-renewal-worker";
import { scheduleBillingRenewalJob } from "./queues";
import { logger } from "@/shared/logger";

async function shutdown(signal: string): Promise<void> {
  logger.info("recebido sinal, encerrando workers graciosamente", { signal });
  await Promise.all([receiptWorker.close(), billingRenewalWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

scheduleBillingRenewalJob()
  .then(() => logger.info("cron de renovação de assinatura agendado (diário, 03:00 UTC)"))
  .catch((error) => logger.error("falha ao agendar cron de renovação de assinatura", { error }));

logger.info("worker iniciado, aguardando jobs");
