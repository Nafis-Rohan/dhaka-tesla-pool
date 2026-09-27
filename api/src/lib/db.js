import pg from "pg";
import { env } from "./env.js";

// Raw `pg` pool, used directly until Phase 4 adds Prisma models (Prisma
// refuses to generate a client with zero models). Phase 4 swaps this for
// `@prisma/client` for normal queries; `pg` stays for the hand-locked
// transactions (`SELECT ... FOR UPDATE`) that Prisma can't express (rules.md B1).
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
