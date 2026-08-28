import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors, radius, typography } from '@/shared/theme';

export type AddressSearchResult = {
  address: string;
  postalCode: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (result: AddressSearchResult) => void;
};

// Daum(카카오) 우편번호 서비스 — API 키/호출 제한 없이 무료로 쓸 수 있는 주소 검색 위젯.
// 원래 웹용 팝업이라 WebView로 감싸서 인라인 임베드(embed)로 띄운다. 결과는
// window.ReactNativeWebView.postMessage로 돌려받는다.
const POSTCODE_HTML = `
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
          JSON.stringify({ address: address, zonecode: data.zonecode })
        );
      },
      width: '100%',
      height: '100%',
    }).embed(document.getElementById('wrap'));
  </script>
</body>
</html>
`;

export function AddressSearchModal({ visible, onClose, onSelect }: Props) {
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { address: string; zonecode: string };
      onSelect({ address: data.address, postalCode: data.zonecode });
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
            source={{ html: POSTCODE_HTML }}
            onMessage={handleMessage}
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
