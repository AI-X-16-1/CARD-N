package com.cardn.calldetector

/**
 * Mirror of `frontend/src/features/call-alert/lib/normalizePhone.ts`.
 *
 * Both sides must agree: the TS copy normalizes the contact numbers that become cache
 * keys, and this copy normalizes the number the telephony API reports at ring time —
 * when no JS runtime is running to do it. Change them together; the TS copy carries the
 * unit tests.
 */
object PhoneNumbers {
  private val NON_DIGITS = Regex("\\D")

  // Every domestic Korean number starts with 0, so digits that begin with a country
  // code and continue with something else are unambiguous.
  private val COUNTRY_PREFIXES = listOf("0082", "82")

  /** "+82 10-1234-5678", "010-1234-5678" and "01012345678" all collapse to "01012345678". */
  fun normalize(raw: String?): String {
    if (raw.isNullOrBlank()) return ""

    val digits = NON_DIGITS.replace(raw, "")
    if (digits.isEmpty()) return ""
    if (digits.startsWith("0") && !digits.startsWith("0082")) return digits

    for (prefix in COUNTRY_PREFIXES) {
      if (!digits.startsWith(prefix)) continue
      val national = digits.substring(prefix.length)
      // Only a country code if a national number follows. If what remains already
      // starts with 0 it never was one, so leave the digits alone rather than guess.
      if (national.isNotEmpty() && !national.startsWith("0")) return "0$national"
      break
    }

    return digits
  }
}
