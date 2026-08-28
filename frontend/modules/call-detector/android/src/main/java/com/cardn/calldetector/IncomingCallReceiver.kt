package com.cardn.calldetector

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Posts the "who is calling, and what you last talked about" notification.
 *
 * Declared in the manifest rather than registered at runtime so it still fires when the
 * app's process is gone — which is the normal case when a call arrives.
 * ACTION_PHONE_STATE_CHANGED is on Android's implicit-broadcast exemption list, so a
 * manifest receiver is still delivered on API 26+.
 *
 * Everything here is deliberately local: cache lookup, then notify. No JS runtime is
 * started and no network call is made, because at ring time neither can be relied on.
 */
class IncomingCallReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE)
    if (state != TelephonyManager.EXTRA_STATE_RINGING) {
      // Answered or ended: the next ring is a new call and deserves its own alert.
      CallAlertStore.endRingEpisode(context)
      return
    }

    // Blank for withheld/unknown callers, and blank if READ_CALL_LOG was refused. Android
    // sends RINGING several times and only some deliveries carry the number, so a blank
    // one must fall through silently rather than end the episode.
    val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
    if (number.isNullOrBlank()) return

    // Collapse the remaining repeats into a single alert per caller per ring.
    if (CallAlertStore.alertedFor(context) == PhoneNumbers.normalize(number)) return

    // An unknown number is not ours to talk about: no notification, nothing logged.
    val contact = CallAlertStore.lookup(context, number) ?: return

    if (!canPostNotifications(context)) return

    CallAlertStore.markAlerted(context, number)
    notify(context, contact)
  }

  private fun notify(context: Context, contact: CallAlertStore.Contact) {
    ensureChannel(context)

    val deepLink = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("cardn://person/${contact.personId}"),
    ).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pendingIntent = PendingIntent.getActivity(
      context,
      contact.personId,
      deepLink,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val body = contact.summary ?: NO_HISTORY
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle(context.getString(R.string.call_alert_title, contact.name))
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .build()

    // One id per contact: a second call from the same person replaces the old alert
    // instead of stacking.
    NotificationManagerCompat.from(context).notify(contact.personId, notification)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return

    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        context.getString(R.string.call_alert_channel_name),
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = context.getString(R.string.call_alert_channel_description)
      },
    )
  }

  private fun canPostNotifications(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
    return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
  }

  private companion object {
    const val CHANNEL_ID = "cardn-call-alert"
    const val NO_HISTORY = "아직 대화 기록이 없어요"
  }
}
