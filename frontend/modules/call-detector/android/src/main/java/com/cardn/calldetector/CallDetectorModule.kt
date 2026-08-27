package com.cardn.calldetector

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class CachedContact : Record {
  @Field var phone: String = ""
  @Field var personId: Int = 0
  @Field var name: String = ""
  @Field var summary: String? = null
}

/**
 * The JS side of the call alert. It only fills the cache and handles permissions —
 * detection and notification happen entirely in [IncomingCallReceiver], with no JS
 * involved, because the app's process is usually gone by the time a call arrives.
 */
class CallDetectorModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallDetector")

    Function("getPermissionStatus") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      mapOf(
        "phone" to context.isGranted(Manifest.permission.READ_PHONE_STATE),
        "callLog" to context.isGranted(Manifest.permission.READ_CALL_LOG),
        "notifications" to (
          Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            context.isGranted(Manifest.permission.POST_NOTIFICATIONS)
          ),
      )
    }

    AsyncFunction("requestPermissions") { promise: expo.modules.kotlin.Promise ->
      val activity = appContext.activityProvider?.currentActivity
        ?: throw Exceptions.MissingActivity()

      val needed = buildList {
        add(Manifest.permission.READ_PHONE_STATE)
        add(Manifest.permission.READ_CALL_LOG)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          add(Manifest.permission.POST_NOTIFICATIONS)
        }
      }.toTypedArray()

      // The result comes back to the Activity; the JS side re-reads
      // getPermissionStatus() when the app returns to the foreground rather than
      // threading a callback through here.
      activity.requestPermissions(needed, PERMISSION_REQUEST_CODE)
      promise.resolve(null)
    }

    /** Replaces the cached snapshot wholesale. Called whenever the app opens. */
    Function("setContacts") { contacts: List<CachedContact> ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CallAlertStore.replaceAll(
        context,
        contacts.associate {
          it.phone to CallAlertStore.Contact(it.personId, it.name, it.summary)
        },
      )
      CallAlertStore.size(context)
    }

    Function("getCachedCount") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CallAlertStore.size(context)
    }

    /** Used when the user withdraws consent — the local copy must not outlive it. */
    Function("clearCache") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      CallAlertStore.clear(context)
    }
  }

  private fun android.content.Context.isGranted(permission: String) =
    checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private companion object {
    const val PERMISSION_REQUEST_CODE = 4821
  }
}
