// `output: "standalone"` leaves .next/static and public/ out of the standalone
// folder; Azure Static Web Apps deploys that folder, so copy them in after build.
// Node (not `cp`) so `npm run build` works on Windows and on the Linux CI runner.
import { cpSync, existsSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
