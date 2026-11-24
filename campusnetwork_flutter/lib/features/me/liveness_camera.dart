import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/motion/liquid_motion.dart';
import '../../core/theme/app_theme.dart';

const _kPrompts = [
  'Look directly into the camera',
  'Blink both eyes slowly twice',
  'Nod your head gently up and down',
  'Hold still — finishing scan...',
];

/// Reliable Flutter Front-Camera Liveness Verification Widget
/// Uses `camera` plugin with clean controller lifecycle & sibling overlay (never crashes!).
class FlutterLivenessCamera extends StatefulWidget {
  const FlutterLivenessCamera({super.key, required this.onCaptured, this.capturedPath});
  final ValueChanged<String?> onCaptured;
  final String? capturedPath;

  @override
  State<FlutterLivenessCamera> createState() => _FlutterLivenessCameraState();
}

class _FlutterLivenessCameraState extends State<FlutterLivenessCamera> {
  CameraController? _ctrl;
  bool _initializing = true;
  bool _recording = false;
  bool _denied = false;
  int _secsLeft = 5;
  int _promptIdx = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.capturedPath == null) _initCamera();
  }

  Future<void> _initCamera() async {
    setState(() {
      _initializing = true;
      _denied = false;
    });
    final perm = await Permission.camera.request();
    if (!perm.isGranted) {
      if (mounted) setState(() { _denied = true; _initializing = false; });
      return;
    }
    try {
      final cams = await availableCameras();
      final front = cams.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.front,
        orElse: () => cams.first,
      );
      final ctrl = CameraController(front, ResolutionPreset.medium, enableAudio: false);
      await ctrl.initialize();
      if (!mounted) {
        await ctrl.dispose();
        return;
      }
      setState(() {
        _ctrl = ctrl;
        _initializing = false;
      });
    } catch (_) {
      if (mounted) setState(() => _initializing = false);
    }
  }

  Future<void> _startScan() async {
    if (_ctrl == null || !_ctrl!.value.isInitialized || _recording) return;
    setState(() {
      _recording = true;
      _secsLeft = 5;
      _promptIdx = 0;
    });
    try {
      await _ctrl!.startVideoRecording();
      int tick = 0;
      _timer = Timer.periodic(const Duration(seconds: 1), (t) async {
        tick++;
        if (mounted) {
          setState(() {
            _secsLeft = (5 - tick).clamp(0, 5);
            _promptIdx = ((tick / 5) * _kPrompts.length).floor().clamp(0, _kPrompts.length - 1);
          });
        }
        if (tick >= 5) {
          t.cancel();
          final file = await _ctrl!.stopVideoRecording();
          if (mounted) {
            setState(() => _recording = false);
            widget.onCaptured(file.path);
          }
        }
      });
    } catch (_) {
      _timer?.cancel();
      try {
        final pic = await _ctrl!.takePicture();
        if (mounted) {
          setState(() => _recording = false);
          widget.onCaptured(pic.path);
        }
      } catch (_) {
        if (mounted) setState(() => _recording = false);
      }
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.capturedPath != null) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(16)),
        child: Column(
          children: [
            const Icon(Icons.check_circle_rounded, color: CNColors.success, size: 42),
            const SizedBox(height: 8),
            const Text('Live Camera Verification Captured', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 10),
            TextButton.icon(
              onPressed: () {
                widget.onCaptured(null);
                _initCamera();
              },
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Record Again'),
            ),
          ],
        ),
      );
    }

    if (_denied) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: CNColors.surfaceRecessed, borderRadius: BorderRadius.circular(16)),
        child: Column(
          children: [
            const Icon(Icons.videocam_off_outlined, color: CNColors.accentLight, size: 38),
            const SizedBox(height: 8),
            const Text('Camera Access Required', style: TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            ElevatedButton(onPressed: openAppSettings, child: const Text('Open App Settings')),
          ],
        ),
      );
    }

    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: SizedBox(
            height: 270,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (_initializing || _ctrl == null)
                  const ColoredBox(color: Colors.black, child: Center(child: CircularProgressIndicator()))
                else
                  CameraPreview(_ctrl!),
                IgnorePointer(
                  child: Container(
                    color: Colors.black26,
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                          decoration: BoxDecoration(color: const Color(0xCC0B1220), borderRadius: BorderRadius.circular(99)),
                          child: Text(
                            _recording ? '${_kPrompts[_promptIdx]} (${_secsLeft}s)' : 'Position your face inside the oval',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
                          ),
                        ),
                        Container(
                          width: 150,
                          height: 190,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: _recording ? CNColors.success : Colors.white70, width: 3),
                          ),
                        ),
                        const SizedBox(height: 6),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        LiquidTap(
          onTap: _recording ? null : _startScan,
          child: Container(
            width: double.infinity,
            height: 46,
            decoration: BoxDecoration(color: CNColors.accent, borderRadius: BorderRadius.circular(14)),
            alignment: Alignment.center,
            child: Text(
              _recording ? 'Recording Scan (${_secsLeft}s)...' : 'Start 5-Second Blink & Nod Scan',
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
            ),
          ),
        ),
      ],
    );
  }
}
