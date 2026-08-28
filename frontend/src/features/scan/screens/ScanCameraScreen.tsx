import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useNavigation } from '@react-navigation/native';

import { colors, radius, typography } from '@/shared/theme';
import { extractErrorMessage, useOcrScan } from '@/features/scan/hooks/useOcrScan';
import { ScanResultPanel } from '@/features/scan/components/ScanResultPanel';
import { ManualInputForm } from '@/features/scan/components/ManualInputForm';
import { CardRevealPanel } from '@/features/scan/components/CardRevealPanel';
import { CloseConfirmModal } from '@/features/scan/components/CloseConfirmModal';
import { createPerson, parseOcrFields } from '@/features/scan/api';
import type { CreatedPerson, ParsedPerson } from '@/features/scan/types';

type CaptureMode = 'single' | 'batch';
type Step = 'camera' | 'manual' | 'reveal';

const GUIDE_ASPECT_RATIO = 1.7;
// guideFrame (the dashed card outline) is 86% of the viewfinder's width, centered — see
// its style below. CameraView fills the same viewfinder edge-to-edge, so the photo's own
// pixels are treated as sharing that rendered frame, and the same fraction/aspect crops
// it down to just what the guide outlined instead of sending the whole background too.
const GUIDE_WIDTH_FRACTION = 0.86;

// Matches backend/app/features/scan/ocr/pipeline.py's MAX_SIDE — the server downscales
// anything wider than this before OCR anyway, so a phone photo (often 3000px+ even after
// cropping to the guide frame) uploads a lot of pixels the server immediately throws
// away. Capping it client-side here cuts upload time with no accuracy cost, since the
// server would've produced the same downscaled image either way.
const MAX_UPLOAD_WIDTH = 1800;

// Camera-only: a gallery pick was never framed against guideFrame, so cropping it the
// same way would cut an arbitrary photo to a rect the user never aligned anything to.
async function cropToGuideFrame(photo: { uri: string; width: number; height: number }): Promise<string> {
  // Some Android devices report takePictureAsync's width/height as the raw sensor
  // orientation (landscape) and rely on an EXIF rotation tag to display it upright —
  // ImageManipulator's crop operates on the raw, un-rotated pixel buffer and ignores that
  // tag, so cropping straight against photo.width/height can crop the wrong axis entirely
  // (this is what showed up as the output image's width/height being swapped). A no-op
  // manipulation first bakes the EXIF rotation into the actual pixels — crop against its
  // (possibly swapped) width/height instead of the original photo's.
  const normalized = await ImageManipulator.manipulateAsync(photo.uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const cropWidth = Math.round(normalized.width * GUIDE_WIDTH_FRACTION);
  const cropHeight = Math.min(Math.round(cropWidth / GUIDE_ASPECT_RATIO), normalized.height);
  const originX = Math.round((normalized.width - cropWidth) / 2);
  const originY = Math.round((normalized.height - cropHeight) / 2);
  const result = await ImageManipulator.manipulateAsync(
    normalized.uri,
    [
      { crop: { originX, originY, width: cropWidth, height: cropHeight } },
      ...(cropWidth > MAX_UPLOAD_WIDTH ? [{ resize: { width: MAX_UPLOAD_WIDTH } }] : []),
    ],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  return result.uri;
}

export default function ScanCameraScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CaptureMode>('single');
  const [step, setStep] = useState<Step>('camera');
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [createdPerson, setCreatedPerson] = useState<CreatedPerson | null>(null);
  // The just-taken photo behind the current OCR result, kept purely client-side (never
  // round-tripped through the backend) so ScanResultPanel can show it next to the fields
  // for comparison while correcting a misread.
  const [singlePhotoUri, setSinglePhotoUri] = useState<string | null>(null);
  const [confirmCloseVisible, setConfirmCloseVisible] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const scanLineY = useRef(new Animated.Value(0)).current;
  const { state, isScanning, scan, reset } = useOcrScan();

  const resetScan = () => {
    reset();
    setSinglePhotoUri(null);
  };

  // ScanCameraScreen is the only screen in ScanStack, presented as a fullScreenModal on
  // top of the tab navigator (see RootNavigator's "Scan" route) — this stack has nothing
  // to pop back to, so closing means dismissing that modal via the parent navigator.
  const handleClose = () => {
    const parent = navigation.getParent();
    (parent ?? navigation).goBack();
  };

  // Any explicit "leave the scan" action (✕, hardware back) goes through this instead
  // of handleClose directly, so an in-progress scan/entry can't be lost to an accidental
  // tap or back-press. handleDone (after a successful save) bypasses it — there's
  // nothing left to lose at that point. Renders as CloseConfirmModal (below) rather than
  // Alert.alert, since react-native-web's Alert.alert is a no-op and would silently do
  // nothing on web instead of confirming.
  const confirmClose = () => setConfirmCloseVisible(true);
  const cancelClose = () => setConfirmCloseVisible(false);
  const proceedClose = () => {
    setConfirmCloseVisible(false);
    handleClose();
  };

  const handleDone = () => {
    resetScan();
    setStep('camera');
    setCreatedPerson(null);
    handleClose();
  };

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Blocks the two ways out of this modal that don't go through the ✕ button: the
  // Android hardware/gesture back action, and swiping the modal down (iOS) or edge-back
  // (Android gesture nav) on the parent stack. Both would otherwise drop whatever's been
  // scanned/entered with no confirmation.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmClose();
      return true;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ gestureEnabled: false });
    return () => {
      parent?.setOptions({ gestureEnabled: true });
    };
  }, [navigation]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineY, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineY, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanLineY]);

  const handleShutterPress = async () => {
    // takePictureAsync itself takes a moment, and isScanning (from useOcrScan) doesn't
    // flip true until after it resolves and scan() starts — a fast double-tap on the
    // shutter during that window isn't caught by the buttons' `disabled={isScanning}`
    // below, and would fire two captures/scans at once. Guard the capture phase too.
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!photo?.uri) return;
      const croppedUri = await cropToGuideFrame(photo);
      setSinglePhotoUri(croppedUri);
      await scan(croppedUri);
    } catch {
      Alert.alert('오류', '사진을 촬영하지 못했어요. 다시 시도해주세요.');
    } finally {
      setCapturing(false);
    }
  };

  const handleGalleryPress = () => {
    Alert.alert('준비 중', '갤러리에서 불러오기는 아직 지원하지 않아요.');
  };

  const handleManualInputPress = () => setStep('manual');

  const handleSaveFromResult = async (
    values: Record<string, string>,
    context: string,
    addressDetail: string,
  ) => {
    if (state.status !== 'done') return;
    // The backend always sends a "Name" entry now (see scan/service.py's
    // _to_field_responses), even when OCR found nothing for it, so there's always a
    // field here for a user-typed value to attach to.
    const updatedFields = state.result.fields.map((field) => ({
      ...field,
      value: values[field.label] ?? field.value,
    }));

    // CreatePersonRequest requires name server-side — catch an empty one here and
    // point at the fix instead of a raw validation error round-tripping as a 422.
    if (!updatedFields.find((f) => f.label === 'Name')?.value.trim()) {
      Alert.alert('이름을 입력해주세요', '이름을 인식하지 못했어요. 위 "Name" 항목에 직접 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const parsed = await parseOcrFields(updatedFields, context);
      const person = await createPerson({
        ...parsed,
        address_detail: addressDetail || undefined,
        image_token: state.result.image_token,
      });
      setCreatedPerson(person);
      setStep('reveal');
    } catch (error) {
      Alert.alert('오류', extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFromManual = async (person: ParsedPerson) => {
    setSaving(true);
    try {
      const created = await createPerson(person);
      setCreatedPerson(created);
      setStep('reveal');
    } catch (error) {
      Alert.alert('오류', extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const closeConfirmModal = (
    <CloseConfirmModal visible={confirmCloseVisible} onCancel={cancelClose} onConfirm={proceedClose} />
  );

  if (step === 'reveal' && createdPerson) {
    return (
      <SafeAreaView style={styles.container}>
        <CardRevealPanel person={createdPerson} onDone={handleDone} />
        {closeConfirmModal}
      </SafeAreaView>
    );
  }

  if (step === 'manual') {
    return (
      <SafeAreaView style={styles.container}>
        <ManualInputForm
          onBack={() => setStep('camera')}
          onSave={handleSaveFromManual}
          saving={saving}
        />
        {closeConfirmModal}
      </SafeAreaView>
    );
  }

  if (state.status === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <ScanResultPanel
          fields={state.result.fields}
          photoUri={singlePhotoUri}
          onRetake={resetScan}
          onClose={confirmClose}
          onSave={handleSaveFromResult}
          saving={saving}
        />
        {closeConfirmModal}
      </SafeAreaView>
    );
  }

  // OCR recognition itself doesn't need the camera anymore (the photo's already taken) —
  // unmount CameraView (releases the hardware) and hide the capture controls entirely
  // instead of just disabling them on top of a still-live viewfinder.
  if (isScanning) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={confirmClose} hitSlop={8} style={styles.closeButtonWrap}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
          <Text style={styles.title}>명함 스캔</Text>
          <View style={styles.closeButtonWrap} />
        </View>
        <View style={styles.recognizingBox}>
          <Text style={styles.recognizingText}>인식 중…</Text>
        </View>
        {closeConfirmModal}
      </SafeAreaView>
    );
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultHeader}>
          <Pressable onPress={confirmClose} hitSlop={8}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.permissionBox}>
          <Text style={styles.hint}>명함을 스캔하려면 카메라 접근 권한이 필요해요</Text>
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonLabel}>권한 허용하기</Text>
          </Pressable>
        </View>
        {closeConfirmModal}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={confirmClose}
          hitSlop={8}
          style={styles.closeButtonWrap}
          disabled={capturing}
        >
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
        <Text style={styles.title}>명함 스캔</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleOption, mode === 'single' && styles.toggleOptionActive]}
            onPress={() => setMode('single')}
            disabled={capturing}
          >
            <Text style={[styles.toggleLabel, mode === 'single' && styles.toggleLabelActive]}>
              단일
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleOption, mode === 'batch' && styles.toggleOptionActive]}
            onPress={() => setMode('batch')}
            disabled={capturing}
          >
            <Text style={[styles.toggleLabel, mode === 'batch' && styles.toggleLabelActive]}>
              연속
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.viewfinder}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.guideFrame} pointerEvents="none">
          <Animated.View
            style={[
              styles.scanLine,
              {
                transform: [
                  {
                    translateY: scanLineY.interpolate({ inputRange: [0, 1], outputRange: [0, 130] }),
                  },
                ],
              },
            ]}
          />
        </View>
        {capturing && (
          <View style={styles.scanningOverlay}>
            <Text style={styles.scanningText}>촬영 중…</Text>
          </View>
        )}
        {state.status === 'error' && (
          <View style={styles.scanningOverlay}>
            <Text style={styles.scanningText}>{state.message}</Text>
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        {mode === 'single' ? '명함을 프레임에 맞춰주세요' : '연속으로 촬영하세요'}
      </Text>

      <View style={styles.bottomBar}>
        <Pressable style={styles.sideButton} onPress={handleGalleryPress} disabled={capturing}>
          <Text style={styles.sideButtonLabel}>갤러리</Text>
        </Pressable>
        <Pressable style={styles.shutter} onPress={handleShutterPress} disabled={capturing} />
        <Pressable
          style={styles.sideButton}
          onPress={handleManualInputPress}
          disabled={capturing}
        >
          <Text style={styles.manualInputLabel}>직접 입력</Text>
        </Pressable>
      </View>
      {closeConfirmModal}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.screenTitle.fontSize,
    fontWeight: typography.screenTitle.fontWeight,
    marginLeft: 12,
  },
  closeButtonWrap: {
    width: 28,
    alignItems: 'flex-start',
  },
  closeButton: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface1,
    borderRadius: radius.pill,
    padding: 3,
  },
  toggleOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  toggleOptionActive: {
    backgroundColor: colors.primary,
  },
  toggleLabel: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
  },
  toggleLabelActive: {
    color: colors.textPrimary,
  },
  viewfinder: {
    flex: 1,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recognizingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recognizingText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  guideFrame: {
    width: '86%',
    aspectRatio: GUIDE_ASPECT_RATIO,
    borderWidth: 2,
    borderColor: colors.secondary,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  scanLine: {
    height: 2,
    backgroundColor: colors.secondary,
  },
  scanningOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanningText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  hint: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
    textAlign: 'center',
    marginVertical: 14,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  sideButton: {
    width: 66,
    alignItems: 'center',
  },
  sideButtonLabel: {
    color: colors.textTertiary,
    fontSize: typography.meta.fontSize,
  },
  manualInputLabel: {
    color: colors.textSecondary,
    fontSize: typography.meta.fontSize,
    textDecorationLine: 'underline',
  },
  shutter: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.primary,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
