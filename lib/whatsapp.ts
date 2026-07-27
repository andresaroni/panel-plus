export function buildWhatsAppUrl(phone: string): string | null {
  const normalized = phone.trim();
  if (!normalized || !/^[+\d\s().-]+$/.test(normalized)) return null;
  let digits = normalized.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `593${digits.slice(1)}`;
  if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
  const text = encodeURIComponent(
    "Hola, te escribimos de FrankoPlus para ayudarte con tu solicitud de servicio.",
  );
  return `https://wa.me/${digits}?text=${text}`;
}
