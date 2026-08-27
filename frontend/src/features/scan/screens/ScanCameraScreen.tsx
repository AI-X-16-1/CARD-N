import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';

import { colors, radius, typography } from '@/shared/theme';
import { extractErrorMessage, useOcrScan } from '@/features/scan/hooks/useOcrScan';
import { ScanResultPanel } from '@/features/scan/components/ScanResultPanel';
import { ManualInputForm } from '@/features/scan/components/ManualInputForm';
import { CardRevealPanel } from '@/features/scan/components/CardRevealPanel';
import { createPerson, parseOcrFields } from '@/features/scan/api';
import type { CreatedPerson, ParsedPerson } from '@/features/scan/types';

type CaptureMode = 'single' | 'batch';
type Step = 'camera' | 'manual' | 'reveal';

const GUIDE_ASPECT_RATIO = 1.7;

export default function ScanCameraScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CaptureMode>('single');
  const [step, setStep] = useState<Step>('camera');
  const [saving, setSaving] = useState(false);
  const [createdPerson, setCreatedPerson] = useState<CreatedPerson | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const scanLineY = useRef(new Animated.Value(0)).current;
  const { state, isScanning, scan, reset } = useOcrScan();

  // ScanCameraScreen is the only screen in ScanStack, presented as a fullScreenModal on
  // top of the tab navigator (see RootNavigator's "Scan" route) — this stack has nothing
  // to pop back to, so closing means dismissing that modal via the parent navigator.
  const handleClose = () => {
    const parent = navigation.getParent();
    (parent ?? navigation).goBack();
  };

  const handleDone = () => {
    reset();
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
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (photo?.uri) {
        await scan(photo.uri);
      }
    } catch {
      Alert.alert('오류', '사진을 촬영하지 못했어요. 다시 시도해주세요.');
    }
  };

  const handleGalleryPress = () => {
    Alert.alert('준비 중', '갤러리에서 불러오기는 아직 지원하지 않아요.');
  };

  const handleManualInputPress = () => setStep('manual');

  const handleSaveFromResult = async (values: Record<string, string>, context: string) => {
    if (state.status !== 'done') return;
    // ScanResultPanel always shows a "Name" input, synthesizing one when OCR didn't
    // find it (see its comment) — mirror that here so a name the user typed into that
    // synthetic field actually makes it into the request, instead of being dropped
    // because state.result.fields never had a "Name" entry for values.Name to attach to.
    const baseFields = state.result.fields.some((f) => f.label === 'Name')
      ? state.result.fields
      : [{ label: 'Name', value: '', confidence: 0 }, ...state.result.fields];
    const updatedFields = baseFields.map((field) => ({
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
      const person = await createPerson(parsed);
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

  if (step === 'reveal' && createdPerson) {
    return (
      <SafeAreaView style={styles.container}>
        <CardRevealPanel person={createdPerson} onDone={handleDone} />
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
      </SafeAreaView>
    );
  }

  if (state.status === 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <ScanResultPanel
          fields={state.result.fields}
          onRetake={reset}
          onClose={handleClose}
          onSave={handleSaveFromResult}
          saving={saving}
        />
      </SafeAreaView>
    );
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.resultHeader}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.permissionBox}>
          <Text style={styles.hint}>명함을 스캔하려면 카메라 접근 권한이 필요해요</Text>
          <Pressable style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonLabel}>권한 허용하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={handleClose} hitSlop={8} style={styles.closeButtonWrap} disabled={isScanning}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
        <Text style={styles.title}>명함 스캔</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleOption, mode === 'single' && styles.toggleOptionActive]}
            onPress={() => setMode('single')}
            disabled={isScanning}
          >
            <Text style={[styles.toggleLabel, mode === 'single' && styles.toggleLabelActive]}>
              단일
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleOption, mode === 'batch' && styles.toggleOptionActive]}
            onPress={() => setMode('batch')}
            disabled={isScanning}
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
        {isScanning && (
          <View style={styles.scanningOverlay}>
            <Text style={styles.scanningText}>인식 중…</Text>
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
        <Pressable style={styles.sideButton} onPress={handleGalleryPress} disabled={isScanning}>
          <Text style={styles.sideButtonLabel}>갤러리</Text>
        </Pressable>
        <Pressable style={styles.shutter} onPress={handleShutterPress} disabled={isScanning} />
        <Pressable style={styles.sideButton} onPress={handleManualInputPress} disabled={isScanning}>
          <Text style={styles.manualInputLabel}>직접 입력</Text>
        </Pressable>
      </View>
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
