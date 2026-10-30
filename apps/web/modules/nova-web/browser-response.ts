export async function readBrowserResponse(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase()
  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    if (response.status === 404) throw new Error("The browser endpoint is unavailable. Restart the web server after updating the browser backend.")
    if (response.status === 401 || response.redirected) throw new Error("Your session may have expired. Sign in again and reconnect.")
    throw new Error(`The browser service returned an unexpected response (${response.status}). Try reconnecting.`)
  }
  let data: unknown
  try { data = await response.json() }
  catch { throw new Error("The browser service returned an invalid response. Try reconnecting.") }
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data ? data.error : null
    throw new Error(typeof error === "string" ? error : "Browser request failed")
  }
  return data
}
