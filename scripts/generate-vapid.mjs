import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const output = args.includes("--output") && option("--output");
const subject = args.includes("--subject") && option("--subject");
if (!output || !subject || !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject)) {
  console.error(
    "Usage: node scripts/generate-vapid.mjs --output .vapid.json --subject mailto:admin@example.com",
  );
  process.exit(1);
}
// Generate once per instance. Refuse to overwrite existing keys or print secrets.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString(
  "base64url",
);
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
await writeFile(
  resolve(output),
  JSON.stringify(
    { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject },
    null,
    2,
  ) + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created protected VAPID file. Store it securely and reuse it for this instance's upgrades.",
);
