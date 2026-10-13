import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const subscription = process.env.AZURE_SUBSCRIPTION_ID;
if (!subscription) throw new Error("Set AZURE_SUBSCRIPTION_ID to the subscription hosting the existing app.");
const root = fileURLToPath(new URL("../", import.meta.url));
const app = "swa-rokach-timetable";
const group = "rg-rokach-timetable";
const lookup = spawnSync("az", [
  "staticwebapp", "show", "--name", app, "--resource-group", group, "--subscription", subscription,
  "--query", "{sku:sku.name,hostname:defaultHostname}", "-o", "json"
], {cwd: root, encoding: "utf8"});
if (lookup.error) throw lookup.error;
if (lookup.status !== 0) throw new Error(`Existing app lookup failed: ${lookup.stderr.trim()}`);
const target = JSON.parse(lookup.stdout);
if (target.sku !== "Free" || target.hostname !== "ashy-ground-097745f0f.5.azurestaticapps.net") {
  throw new Error("Refusing deployment: the existing app does not match the approved target.");
}
const secrets = spawnSync("az", [
  "staticwebapp", "secrets", "list", "--name", app, "--resource-group", group,
  "--subscription", subscription, "--query", "properties.apiKey", "-o", "tsv"
], {cwd: root, encoding: "utf8"});
if (secrets.error) throw secrets.error;
if (secrets.status !== 0 || !secrets.stdout.trim()) {
  throw new Error("Unable to retrieve the existing app deployment token. Check Azure CLI access.");
}
const result = spawnSync(process.env.SWA_CLI_PATH || "swa", [
  "deploy", "site", "--api-location", "api", "--api-language", "node", "--api-version", "22",
  "--env", "production"
], {
  cwd: root, stdio: "inherit",
  env: {...process.env, SWA_CLI_DEPLOYMENT_TOKEN: secrets.stdout.trim(), SWA_CLI_SKIP_LOGIN: "true"}
});
secrets.stdout = "";
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`SWA deployment failed with exit code ${result.status}`);
