import AVFoundation
import CoreImage
import Foundation
import React

/// CVModule — native iOS board-detection and move-detection module.
///
/// Architecture (MVP — Option A: grid + frame diff):
///   1. AVCaptureSession delivers CMSampleBuffers at ~15fps.
///   2. BoardDetector finds the 4 board corners via Canny + Hough lines,
///      emits BoardObservation when confidence > threshold.
///   3. After calibration, OccupancyTracker hashes each of 64 squares per frame
///      and emits MoveCandidate when a diff is stable across N frames.
///
/// TODO post-MVP: replace OccupancyTracker with a CoreML piece classifier.

@objc(CVModuleNative)
class CVModuleNative: RCTEventEmitter {

  // MARK: - Session state

  private var captureSession: AVCaptureSession?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var sessionQueue = DispatchQueue(label: "com.boardsight.cv.session")
  private var processingQueue = DispatchQueue(label: "com.boardsight.cv.processing",
                                               qos: .userInitiated)

  // MARK: - Config

  private var confidenceThreshold: Double = 0.85
  private var targetFps: Int = 15
  private var enablePositionObs: Bool = false

  // MARK: - Detection state

  private var isTracking: Bool = false
  private var calibrationData: NSDictionary?

  /// Consecutive frame buffer for temporal smoothing (move detection)
  private var frameDiffHistory: [[String: String]] = []
  private let smoothingFrames = 3 // require N identical diffs

  // MARK: - RCTEventEmitter overrides

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    ["onBoardObservation", "onMoveCandidate", "onPositionObservation"]
  }

  // MARK: - JS-exposed commands

  @objc func startSession(_ config: NSDictionary) {
    confidenceThreshold = (config["confidenceThreshold"] as? Double) ?? 0.85
    targetFps = (config["targetFps"] as? Int) ?? 15
    enablePositionObs = (config["enablePositionObs"] as? Bool) ?? false

    sessionQueue.async { [weak self] in
      self?.setupCaptureSession()
    }
  }

  @objc func stopSession() {
    sessionQueue.async { [weak self] in
      self?.captureSession?.stopRunning()
      self?.captureSession = nil
      self?.videoOutput = nil
      self?.isTracking = false
    }
  }

  @objc func pauseTracking(_ paused: Bool) {
    isTracking = !paused
  }

  @objc func setCalibration(_ calib: NSDictionary) {
    calibrationData = calib
    isTracking = true
    frameDiffHistory.removeAll()
  }

  @objc func requestKeyFrame() {
    // Debug only — saves annotated frame to Photos
    guard _isDebugAssertConfiguration() else { return }
    // TODO: capture next frame and save to PHPhotoLibrary
  }

  // MARK: - AVCaptureSession setup

  private func setupCaptureSession() {
    let session = AVCaptureSession()
    session.sessionPreset = .hd1280x720

    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                           for: .video,
                                           position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      session.canAddInput(input)
    else {
      NSLog("[CVModule] Failed to set up capture device")
      return
    }

    // Configure target frame rate
    try? device.lockForConfiguration()
    let desiredFps = CMTimeMake(value: 1, timescale: Int32(targetFps))
    device.activeVideoMinFrameDuration = desiredFps
    device.activeVideoMaxFrameDuration = desiredFps
    device.unlockForConfiguration()

    session.addInput(input)

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String:
                              kCVPixelFormatType_32BGRA]
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: processingQueue)

    guard session.canAddOutput(output) else { return }
    session.addOutput(output)

    captureSession = session
    videoOutput = output
    session.startRunning()
    NSLog("[CVModule] Capture session started at %dfps", targetFps)
  }

  // MARK: - Board detection helpers (stubs — implement with Vision / OpenCV)

  /// Returns confidence 0–1 that a chessboard is visible, plus approximate corners.
  /// TODO: Use Vision framework's VNDetectRectanglesRequest + Hough line refinement.
  private func detectBoard(in pixelBuffer: CVPixelBuffer) -> (confidence: Double,
                                                               corners: [[String: Double]],
                                                               lightingWarning: Bool) {
    // STUB — replace with real CV
    return (confidence: 0.0, corners: [], lightingWarning: false)
  }

  /// Returns a per-square occupancy hash map [square → hash].
  /// TODO: After calibration, warp each square region and hash pixel values.
  private func hashOccupancy(in pixelBuffer: CVPixelBuffer) -> [String: String] {
    // STUB — replace with real CV
    return [:]
  }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension CVModuleNative: AVCaptureVideoDataOutputSampleBufferDelegate {

  func captureOutput(_ output: AVCaptureOutput,
                     didOutput sampleBuffer: CMSampleBuffer,
                     from connection: AVCaptureConnection) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let timestamp = Int64(Date().timeIntervalSince1970 * 1000)

    if calibrationData == nil {
      // Phase 1 — looking for board
      let (confidence, corners, lightingWarning) = detectBoard(in: pixelBuffer)
      guard confidence > 0 else { return }

      let event: NSDictionary = [
        "corners": corners,
        "confidence": confidence,
        "lightingWarning": lightingWarning,
        "timestamp": timestamp,
      ]
      sendEvent("onBoardObservation", body: event)

    } else if isTracking {
      // Phase 2 — tracking moves
      let occupancy = hashOccupancy(in: pixelBuffer)
      guard !occupancy.isEmpty else { return }

      // Temporal smoothing: accumulate frame diffs
      frameDiffHistory.append(occupancy)
      if frameDiffHistory.count > smoothingFrames {
        frameDiffHistory.removeFirst()
      }

      // TODO: Compare consecutive frames, detect stable 2-square diff → MoveCandidate
      // For now the detection is stubbed — real implementation in M1 CV work
    }
  }
}
