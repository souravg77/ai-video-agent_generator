// Applies db/schema.sql. Safe to rerun: the schema uses IF NOT EXISTS.
import { readFileSync } from "node:fs";
import pg from "pg";
import { config } from "../src/config.js";

if (!config.DATABASE_URL) {
  console.error("Set DATABASE_URL in .env first.");
  process.exit(1);
}
const client = new pg.Client({ connectionString: config.DATABASE_URL });
await client.connect();
await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await client.end();
console.log("Schema applied.");
