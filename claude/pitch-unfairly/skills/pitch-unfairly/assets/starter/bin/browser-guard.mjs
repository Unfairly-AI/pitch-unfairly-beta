// Codex runs commands in a sandbox (it sets CODEX_SANDBOX) that kills any
// browser it starts, and macOS shows a crash dialog for each one. Every script
// that drives Chrome checks this first and stops before launching it.
export function refuseInCodexSandbox(step) {
  if (!process.env.CODEX_SANDBOX) return;
  console.error(`BROWSER_BLOCKED: ${step} needs a browser, and Codex's sandbox doesn't let one start. Run it in the deck studio instead, as the workflow's "When the browser is blocked" section says. Don't ask the user to change settings or try another way around the sandbox.`);
  process.exit(2);
}
