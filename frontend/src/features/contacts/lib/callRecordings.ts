import * as Contacts from 'expo-contacts/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import {
  filenameMatchesName,
  filenameMatchesNumber,
  MIN_RELIABLE_PHONE_DIGITS,
  normalizePhone,
} from './phoneMatch';

export { normalizePhone } from './phoneMatch';

// One UI puts call recordings in an album named like this. Other manufacturers use
// different names/paths — matching only Samsung One UI is a known limitation.
const CALL_ALBUM_NAME_PATTERNS = [/^call$/i, /call.*record/i, /통화\s*녹음/];

// expo-media-library pages results; without a cap a device with a huge call-recording
// album would page forever. Callers get `truncated` so they can surface it instead of
// silently missing older recordings.
const MAX_ASSETS_SCANNED = 2000;
const ASSETS_PAGE_SIZE = 500;

export type CallRecordingMatch = {
  id: string;
  uri: string;
  filename: string;
  creationTime: number | null;
};

export type CallRecordingSearchResult = {
  matchedBy: 'name' | 'number' | null;
  contactName: string | null;
  matches: CallRecordingMatch[];
  permissionDenied: boolean;
  truncated: boolean;
};

// Finds the device contact name for a phone number, if the number is saved locally.
// Returns null on no permission / no match — callers fall back to number-based matching.
export async function findContactNameByPhone(phone: string): Promise<string | null> {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < MIN_RELIABLE_PHONE_DIGITS) return null;

  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const suffix = normalized.slice(-8);
  for (const contact of data) {
    // Typed as a minimal local shape rather than `Contacts.PhoneNumber` — this callback
    // only ever touches `.number`.
    const numbers: { number?: string | null }[] = contact.phoneNumbers ?? [];
    const hit = numbers.some((n) => normalizePhone(n.number).slice(-8) === suffix);
    if (hit) return contact.name ?? null;
  }
  return null;
}

async function findCallRecordingAlbum(): Promise<MediaLibrary.Album | null> {
  const albums: { title: string }[] = await MediaLibrary.getAlbumsAsync();
  return (
    (albums.find((a) => CALL_ALBUM_NAME_PATTERNS.some((pattern) => pattern.test(a.title))) as
      | MediaLibrary.Album
      | undefined) ?? null
  );
}

async function getCallRecordingAssets(): Promise<{ assets: MediaLibrary.Asset[]; truncated: boolean }> {
  const album = await findCallRecordingAlbum();
  if (!album) return { assets: [], truncated: false };

  const assets: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let hasNextPage = true;

  while (hasNextPage && assets.length < MAX_ASSETS_SCANNED) {
    const page = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: MediaLibrary.MediaType.audio,
      first: ASSETS_PAGE_SIZE,
      after,
      sortBy: [MediaLibrary.SortBy.creationTime],
    });
    assets.push(...page.assets);
    hasNextPage = page.hasNextPage;
    after = page.endCursor;
  }

  return { assets, truncated: hasNextPage };
}

/**
 * Finds call-recording FILES on the device matching a phone number — filename, uri, and
 * timestamp only, never the audio content. Callers hand the result off to the conversation
 * feature's transcribe/summarize flow rather than playing the raw file back in-app.
 */
export async function findCallRecordingsForPhone(phone: string): Promise<CallRecordingSearchResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { matchedBy: null, contactName: null, matches: [], permissionDenied: false, truncated: false };
  }

  const contactName = await findContactNameByPhone(normalized);

  const mediaPermission = await MediaLibrary.requestPermissionsAsync();
  if (mediaPermission.status !== 'granted') {
    return { matchedBy: null, contactName, matches: [], permissionDenied: true, truncated: false };
  }

  const { assets, truncated } = await getCallRecordingAssets();
  const matchedBy: 'name' | 'number' = contactName ? 'name' : 'number';
  const matches = assets
    .filter((asset) =>
      contactName ? filenameMatchesName(asset.filename, contactName) : filenameMatchesNumber(asset.filename, normalized)
    )
    .map((asset) => ({
      id: asset.id,
      uri: asset.uri,
      filename: asset.filename,
      creationTime: asset.creationTime ?? null,
    }));

  return { matchedBy, contactName, matches, permissionDenied: false, truncated };
}
