export function isValidWhatsAppNumber(value) {
  return typeof value === "string" && /^\d{10,15}$/.test(value);
}

export function formatReportMessage({ name, message, timestamp }) {
  return `📢 LAPORAN BARU\n• Nama : ${name}\n• Pesan : ${message}\n• Waktu : ${timestamp}`;
}

export function createWhatsAppUrl(number, message) {
  if (!isValidWhatsAppNumber(number)) throw new Error("Nomor WhatsApp belum diisi dengan benar.");
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function createSuggestionText({ title, message, name = "" }) {
  return `Saran kelas: ${title}\nDari: ${name || "Tanpa nama"}\n\n${message}`;
}
