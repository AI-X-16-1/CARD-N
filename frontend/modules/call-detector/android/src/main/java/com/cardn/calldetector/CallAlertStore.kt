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
  private const val KEY_LAST_STATE = "last_call_state"

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

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
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
   * Android re-broadcasts PHONE_STATE several times per call, and a manifest receiver is
   * a fresh instance each time, so the previous state has to live here rather than in a
   * field.
   */
  fun consumeStateTransition(context: Context, state: String?): Boolean {
    val store = prefs(context)
    val previous = store.getString(KEY_LAST_STATE, null)
    store.edit().putString(KEY_LAST_STATE, state).apply()
    return previous != state
  }
}
