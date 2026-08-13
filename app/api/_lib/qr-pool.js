// Shared QR Ph lane pool.
// Configure in .env.local:
//   Single lane:  PAYMONGO_STATIC_QR_ID=qr_xxxx
//   Multiple:     PAYMONGO_STATIC_QR_IDS=qr_aaa,qr_bbb,qr_ccc
//                 PAYMONGO_STATIC_QR_IMAGES=/qrph-1.png,/qrph-2.png,/qrph-3.png
// ids and images are matched by position. Images live in /public.

export function getQrPool() {
  const rawIds =
    process.env.PAYMONGO_STATIC_QR_IDS ||
    process.env.PAYMONGO_STATIC_QR_ID ||
    '';
  const rawImages =
    process.env.PAYMONGO_STATIC_QR_IMAGES ||
    '/qrph-static.png';

  const ids = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return [];

  const images = rawImages.split(',').map((s) => s.trim()).filter(Boolean);
  const fallbackImage = images[0] || '/qrph-static.png';

  return ids.map((id, i) => ({
    id,
    image: images[i] || fallbackImage,
  }));
}
