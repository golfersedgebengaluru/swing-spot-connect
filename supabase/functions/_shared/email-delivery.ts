/** One provider attempt. Failures are recorded, but an accepted email is never retried here. */
export async function submitEmailAttempt(
  send: () => Promise<Response>,
  persist: (status: "sent" | "failed", details: string) => Promise<void>,
): Promise<string> {
  let id: string;
  try {
    const response = await send();
    const payload = await response.json();
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
    if (typeof payload?.id !== "string" || !payload.id) throw new Error("Email provider returned no receipt");
    id = payload.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email submission failed";
    try { await persist("failed", message); }
    catch { console.error("Unable to persist failed email attempt"); }
    throw error;
  }
  // Submission succeeded: a logging outage must not invite duplicate resubmission.
  try { await persist("sent", id); }
  catch { console.error("Unable to persist accepted email attempt"); }
  return id;
}