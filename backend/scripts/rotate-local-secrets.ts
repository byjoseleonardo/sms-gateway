import { randomBytes } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const rotateAll = args.has("--all");
const rotateOperator =
  rotateAll || args.has("--operator");
const rotateEnrollment =
  rotateAll || args.has("--enrollment");

if (!rotateOperator && !rotateEnrollment) {
  console.error(
    "Uso: npm run secrets:rotate -- --operator | --enrollment | --all"
  );
  process.exit(2);
}

const envPath = resolve(
  process.env.SMS_GATEWAY_ENV_FILE ?? ".env"
);

let lines = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean)
  : [];

function rotate(name: string) {
  const value = randomBytes(32).toString("base64url");
  const prefix = `${name}=`;
  lines = lines.filter(
    line => !line.startsWith(prefix)
  );
  lines.push(`${prefix}${value}`);
}

if (rotateOperator) {
  rotate("OPERATOR_API_KEY");
}

if (rotateEnrollment) {
  rotate("GATEWAY_ENROLLMENT_KEY");
}

writeFileSync(
  envPath,
  `${lines.join("\n")}\n`,
  {
    encoding: "utf8",
    mode: 0o600
  }
);

const rotated = [
  rotateOperator ? "OPERATOR_API_KEY" : null,
  rotateEnrollment ? "GATEWAY_ENROLLMENT_KEY" : null
].filter(Boolean);

console.log(
  `Credenciales rotadas en ${envPath}: ${rotated.join(", ")}`
);
console.log(
  "Los valores no se muestran. Recrea el backend para aplicarlos."
);
