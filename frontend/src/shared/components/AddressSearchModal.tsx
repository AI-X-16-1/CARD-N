import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors, radius, typography } from '@/shared/theme';

export type AddressSearchResult = {
  address: string;
  postalCode: string;
  // The building's name (data.buildingName), when the selected address has one — Daum
  // only returns this, never floor/unit (it has no way to know that), so callers still
  // need a manual "상세 주소" input for the rest. Empty string when there's no building
  // name to offer, e.g. a plain single-family-home address.
  buildingName: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: AddressSearchResult) => void;
  // The address already on screen (OCR's guess or whatever's typed) — passed through as
  // the widget's initial search term via embed()'s `q` option, so re-searching a mostly-
  // right OCR read doesn't mean retyping it from scratch.
  initialQuery?: string;
};

// Daum(카카오) 우편번호 서비스 — API 키/호출 제한 없이 무료로 쓸 수 있는 주소 검색 위젯.
// 원래 웹용 팝업이라 WebView로 감싸서 인라인 임베드(embed)로 띄운다. 결과는
// window.ReactNativeWebView.postMessage로 돌려받는다.
//
// Lives in shared/ (not a single feature) because both features/scan and
// features/contacts need the exact same widget — scan/CLAUDE.md's feature-folder
// boundary rule blocks importing one feature's component from another, and this started
// as a features/scan-local copy before contacts needed the same thing too.
function buildPostcodeHtml(initialQuery: string): string {
  // JSON.stringify both escapes the string for safe embedding inside the inline <script>
  // (quotes, backslashes, </script> sequences, etc.) and produces a valid JS string
  // literal — initialQuery is arbitrary user/OCR text, never trusted as-is.
  const embedOptions = initialQuery ? `{ q: ${JSON.stringify(initialQuery)} }` : '{}';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; }
    #wrap { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="wrap"></div>
  <script>
    new daum.Postcode({
      oncomplete: function (data) {
        var address = data.roadAddress || data.jibunAddress;
        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            address: address,
            zonecode: data.zonecode,
            buildingName: data.buildingName || '',
          })
        );
      },
      width: '100%',
      height: '100%',
    }).embed(document.getElementById('wrap'), ${embedOptions});
  </script>
</body>
</html>
`;
}

export function AddressSearchModal({ visible, onClose, onSelect, initialQuery = '' }: Props) {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as {
        address: string;
        zonecode: string;
        buildingName: string;
      };
      onSelect({ address: data.address, postalCode: data.zonecode, buildingName: data.buildingName });
    } catch {
      // Malformed postMessage payload — nothing to recover, just let the user retry.
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>주소 검색</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>
        {Platform.OS === 'web' ? (
          // react-native-webview has no web implementation ("does not support this
          // platform") — this app is Android-first, so the search widget is native-only
          // for now rather than reimplementing it as an iframe just for the web preview.
          <View style={styles.webUnsupported}>
            <Text style={styles.webUnsupportedText}>
              주소 검색은 안드로이드 앱에서만 지원돼요. 웹에서는 위 입력란에 직접 입력해주세요.
            </Text>
          </View>
        ) : (
          <WebView
            // baseUrl matters here, not just cosmetically: an inline `html` source with
            // no baseUrl loads with a file://-ish null origin on Android, and the
            // postcode widget's internal iframe->parent postMessage on selection
            // completion gets silently rejected as an origin mismatch — search still
            // works (that part doesn't need it), but oncomplete never fires and the
            // widget never hands control back (see daumPostcode/QnA#642). Any https
            // origin works; the script's own host keeps it obviously consistent.
            source={{ html: buildPostcodeHtml(initialQuery), baseUrl: 'https://t1.daumcdn.net' }}
            onMessage={handleMessage}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            style={styles.webview}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
  },
  closeButton: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  webview: {
    flex: 1,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
  },
  webUnsupported: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  webUnsupportedText: {
    color: colors.textTertiary,
    fontSize: typography.body.fontSize,
    textAlign: 'center',
  },
});
