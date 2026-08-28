package com.cardn.calldetector

import android.content.Context
import org.json.JSONObject

/**
 * The phone-number -> contact snapshot the receiver reads when the phone rings.
 *
 * Written by JS while the app is open, read by [IncomingCallReceiver] with no JS runtime
 * and no network. That is the whole point: at ring time there may be no reachable
 * backend (it runs on a laptop) and no live app process.
 *
 * Stored in app-private SharedPreferences, which other apps cannot read on a
 * non-rooted device. It is still a plaintext copy of data the server holds encrypted —
 * see docs/call-alert-spec.md, "What the cache costs".
 */
object CallAlertStore {
  private const val PREFS = "cardn_call_alert"
  private const val KEY_PREFIX = "phone:"
  private const val KEY_CONSENT_PROMPT_SEEN = "consent_prompt_seen"
  private const val KEY_ALERTED_FOR = "alerted_for"

  data class Contact(val personId: Int, val name: String, val summary: String?)

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  /** Replaces the whole cache: contacts deleted on the server must disappear here too. */
  fun replaceAll(context: Context, contacts: Map<String, Contact>) {
    val editor = prefs(context).edit()
    prefs(context).all.keys.filter { it.startsWith(KEY_PREFIX) }.forEach { editor.remove(it) }
    contacts.forEach { (phone, contact) ->
      val normalized = PhoneNumbers.normalize(phone)
      if (normalized.isEmpty()) return@forEach
      val json = JSONObject()
        .put("personId", contact.personId)
        .put("name", contact.name)
        .put("summary", contact.summary ?: JSONObject.NULL)
      editor.putString(KEY_PREFIX + normalized, json.toString())
    }
    editor.apply()
  }

  /**
   * Drops everything the server owns, but deliberately not [KEY_CONSENT_PROMPT_SEEN]:
   * having already been asked is a fact about the user, not cached data, and wiping it
   * would put the consent screen back in front of them on the next launch.
   *
   * Written as "wipe, then restore the flag" rather than removing keys by name so it
   * stays correct as the receiver's own bookkeeping keys come and go.
   */
  fun clear(context: Context) {
    val promptSeen = consentPromptSeen(context)
    prefs(context).edit().clear().apply()
    if (promptSeen) markConsentPromptSeen(context)
  }

  /**
   * Whether the consent screen has already been answered, either way.
   *
   * Kept next to the cache because the app has no other persistence layer, and this is
   * the one thing that has to survive a cold start for the screen not to reappear on
   * every launch.
   */
  fun consentPromptSeen(context: Context): Boolean =
    prefs(context).getBoolean(KEY_CONSENT_PROMPT_SEEN, false)

  fun markConsentPromptSeen(context: Context) {
    prefs(context).edit().putBoolean(KEY_CONSENT_PROMPT_SEEN, true).apply()
  }

  fun size(context: Context): Int =
    prefs(context).all.keys.count { it.startsWith(KEY_PREFIX) }

  fun lookup(context: Context, rawNumber: String): Contact? {
    val normalized = PhoneNumbers.normalize(rawNumber)
    if (normalized.isEmpty()) return null

    val raw = prefs(context).getString(KEY_PREFIX + normalized, null) ?: return null
    return try {
      val json = JSONObject(raw)
      Contact(
        personId = json.getInt("personId"),
        name = json.getString("name"),
        summary = if (json.isNull("summary")) null else json.getString("summary"),
      )
    } catch (e: Exception) {
      null
    }
  }

  /**
   * One alert per ringing episode, tracked here because a manifest receiver is a fresh
   * instance on every broadcast and cannot hold this in a field.
   *
   * Keyed by the number rather than by call state on purpose. Android delivers RINGING
   * more than once per call and **only some of those deliveries carry
   * EXTRA_INCOMING_NUMBER** — on a Galaxy S25 the first RINGING arrives with a null
   * number and the real one follows 8ms later. De-duplicating on the state transition
   * instead let that first, useless broadcast consume the episode, so the delivery that
   * actually carried the number was discarded and no alert was ever posted.
   */
  fun alertedFor(context: Context): String? =
    prefs(context).getString(KEY_ALERTED_FOR, null)

  fun markAlerted(context: Context, rawNumber: String) {
    val normalized = PhoneNumbers.normalize(rawNumber)
    prefs(context).edit().putString(KEY_ALERTED_FOR, normalized).apply()
  }

  /** The call was answered or ended, so the next RINGING begins a fresh episode. */
  fun endRingEpisode(context: Context) {
    prefs(context).edit().remove(KEY_ALERTED_FOR).apply()
  }
}
