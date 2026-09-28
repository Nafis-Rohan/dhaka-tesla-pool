//Tell Prisma where my schema/migrations are and how to connect to my database.
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma commands run from api/, and the shared .env lives one level up in the repo root
config({ path: "../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
