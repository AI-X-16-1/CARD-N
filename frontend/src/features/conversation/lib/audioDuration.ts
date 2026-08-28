import { createAudioPlayer } from 'expo-audio';

/**
 * How long a local audio file runs for, or null if it cannot be worked out.
 *
 * Only used to estimate how much of the transcription is left. The recorder already
 * knows its own duration and passes it along; this exists for the file picker, which
 * reports a name and a size but never a length.
 *
 * Loading is asynchronous with no completion event on this API, so the duration is
 * polled for. It gives up rather than holding the flow: a missing estimate costs the
 * user a progress bar, and waiting on one would cost them the transcription.
 */
const PROBE_TIMEOUT_MS = 2000;
const PROBE_INTERVAL_MS = 50;

export async function readAudioDuration(uri: string): Promise<number | null> {
  let player: ReturnType<typeof createAudioPlayer> | null = null;
  try {
    player = createAudioPlayer(uri);

    const deadline = Date.now() + PROBE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      // Duration reads as 0 until the file is open, and as NaN on some web codecs.
      if (player.isLoaded && Number.isFinite(player.duration) && player.duration > 0) {
        return player.duration;
      }
      await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS));
    }
    return null;
  } catch {
    // An unreadable URI or an unsupported codec — the caller treats it as "unknown".
    return null;
  } finally {
    player?.remove();
  }
}
