import { createTRPCRouter } from "../../trpc";
import { valuesRouter } from "./values";
import { goalsRouter as goalsCoreRouter } from "./goals";
import { syncRouter } from "./sync";
import { peopleRouter } from "./people";
import { selfRouter } from "./self";
import { backupRouter } from "./backup";

// The public `goals` router is the merge of the per-feature routers below.
// Each file owns one cohesive slice of the API surface; this index just
// flattens them so `api.goals.<sub>.<proc>` keeps working as before.
export const goalsRouter = createTRPCRouter({
  ...valuesRouter._def.record,
  ...goalsCoreRouter._def.record,
  ...syncRouter._def.record,
  ...peopleRouter._def.record,
  ...selfRouter._def.record,
  ...backupRouter._def.record,
});
