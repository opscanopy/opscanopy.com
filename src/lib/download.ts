/**
 * downloadTextFile — trigger a client-side "save file" for a text payload via
 * a Blob and a temporary <a download>. Works in every modern browser (the
 * File System Access API was rejected as Chromium-only). Returns false
 * instead of throwing so callers can show an honest fallback message.
 */
export function downloadTextFile(filename: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on a delay — immediate revocation cancels the download in some
    // WebKit builds.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
