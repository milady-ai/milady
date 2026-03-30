/**
 * QR Code generation utility using the `qrcode` library.
 * Generates real, scannable QR codes for wallet addresses.
 */
import QRCode from "qrcode";

/**
 * Generate a data URL for a QR code encoding the given text.
 * Returns a base64-encoded PNG data URL that can be used as an img src.
 */
export async function generateQrDataUrl(
  text: string,
  size = 200,
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
    errorCorrectionLevel: "M",
  });
}
