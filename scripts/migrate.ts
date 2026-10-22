// Applies db/schema.sql. Safe to rerun: the schema uses IF NOT EXISTS.
import { readFileSync } from "node:fs";
import pg from "pg";
import { config, envFile } from "../src/config.js";
import { connectionConfig } from "../src/lib/db.js";

if (!config.DATABASE_URL) {
  console.error(`Set DATABASE_URL in ${envFile} first.`);
  process.exit(1);
}
const client = new pg.Client(connectionConfig());
await client.connect();
if (config.DB_SCHEMA) await client.query(`CREATE SCHEMA IF NOT EXISTS ${config.DB_SCHEMA}`);
await client.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await client.end();
console.log(`Schema applied${config.DB_SCHEMA ? ` in schema "${config.DB_SCHEMA}"` : ""}.`);
