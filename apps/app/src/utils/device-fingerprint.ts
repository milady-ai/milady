/**
 * Device fingerprinting utility for stable browser identification
 * Used for automatic device-based authentication without manual API key entry
 */

/**
 * Generate a stable device fingerprint based on browser characteristics
 * This creates a consistent ID across sessions for the same browser/device
 */
export async function getDeviceFingerprint(): Promise<string> {
  const components: string[] = [];

  // User agent (browser + OS)
  components.push(navigator.userAgent);

  // Screen resolution
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // Timezone offset
  components.push(new Date().getTimezoneOffset().toString());

  // Language
  components.push(navigator.language);

  // Platform
  components.push(navigator.platform);

  // Hardware concurrency (CPU cores)
  if (navigator.hardwareConcurrency) {
    components.push(navigator.hardwareConcurrency.toString());
  }

  // Device memory (if available)
  if ((navigator as any).deviceMemory) {
    components.push((navigator as any).deviceMemory.toString());
  }

  // Canvas fingerprint
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      canvas.width = 200;
      canvas.height = 50;
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("milady.ai", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("device fingerprint", 4, 17);
      components.push(canvas.toDataURL());
    }
  } catch (e) {
    // Canvas fingerprinting might be blocked, continue without it
  }

  // WebGL fingerprint
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl && gl instanceof WebGLRenderingContext) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
      }
    }
  } catch (e) {
    // WebGL might not be available
  }

  // Combine all components and hash
  const fingerprintString = components.join("|||");
  
  // Use SubtleCrypto for SHA-256 hashing
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprintString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  
  return hashHex;
}

/**
 * Check if a device fingerprint is stored in localStorage
 * If not, generate and store it for future use
 */
export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const stored = localStorage.getItem("device_fingerprint");
  if (stored) {
    return stored;
  }
  
  const fingerprint = await getDeviceFingerprint();
  localStorage.setItem("device_fingerprint", fingerprint);
  return fingerprint;
}
