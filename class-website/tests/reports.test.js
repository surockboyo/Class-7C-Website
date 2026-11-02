import test from "node:test";
import assert from "node:assert/strict";
import { isValidWhatsAppNumber, createWhatsAppUrl, formatReportMessage } from "../assets/js/reports.js";

test("validates an international digits-only WhatsApp number", () => {
  assert.equal(isValidWhatsAppNumber("6281234567890"), true);
  for (const number of ["", "+6281234567890", "62 81234567890", "123", "1234567890123456"]) {
    assert.equal(isValidWhatsAppNumber(number), false);
  }
});

test("creates exact report text and safely encodes message content in the URL", () => {
  const message = formatReportMessage({ name: "Rani & teman", message: "Tolong cek 📚\nA&B", timestamp: "Senin, 2 November 2026 08.00" });
  assert.equal(message, "📢 LAPORAN BARU\n• Nama : Rani & teman\n• Pesan : Tolong cek 📚\nA&B\n• Waktu : Senin, 2 November 2026 08.00");
  const url = createWhatsAppUrl("6281234567890", message);
  assert.equal(url, `https://wa.me/6281234567890?text=${encodeURIComponent(message)}`);
});
