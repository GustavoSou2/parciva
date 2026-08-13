# tenant

Onboarding self-service (`createTenant`) e máquina de estados do
ciclo de vida do tenant (spec §4.3): `trial → active → past_due →
suspended → cancelled → purged`. `lifecycle.ts` decide transições
válidas; `slug.ts` gera/valida o slug público do tenant.

**Invariantes locais:** `suspended` é o único estado que ainda
permite leitura (`isReadOnly`); só `trial`/`active` são operacionais
(`isOperational`) — o resto bloqueia ingestão. `createTenant` não
desfaz o tenant se o e-mail de boas-vindas falhar (best-effort).

**Não faz:** não cobra, não migra plano, não executa a purga em si —
só decide se uma transição é permitida e cria o registro inicial.
