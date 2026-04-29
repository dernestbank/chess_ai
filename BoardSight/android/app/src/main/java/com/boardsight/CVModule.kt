package com.boardsight

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * CVModule — Android native CV module for board detection and move tracking.
 *
 * Architecture (MVP — Option A: grid + frame diff):
 *   1. Camera2 API delivers frames at ~15fps via ImageReader.
 *   2. BoardDetector finds board corners (Canny + Hough lines via OpenCV JNI — TODO).
 *   3. OccupancyTracker hashes 64 squares per frame; stable diff → MoveCandidate.
 *
 * TODO post-MVP: replace OccupancyTracker with TFLite piece classifier.
 */
class CVModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "CVModule"
        private const val TARGET_WIDTH = 1280
        private const val TARGET_HEIGHT = 720
        private const val DEFAULT_FPS = 15
        private const val SMOOTHING_FRAMES = 3
    }

    // Camera2 handles
    private var cameraManager: CameraManager? = null
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    // Config
    private var confidenceThreshold: Double = 0.85
    private var targetFps: Int = DEFAULT_FPS
    private var enablePositionObs: Boolean = false

    // Detection state
    private var isTracking: Boolean = false
    private var calibrationData: ReadableMap? = null
    private val frameDiffHistory = mutableListOf<Map<String, String>>()

    override fun getName() = "CVModuleNative"

    // -------------------------------------------------------------------------
    // JS-exposed methods
    // -------------------------------------------------------------------------

    @ReactMethod
    fun startSession(config: ReadableMap) {
        confidenceThreshold = if (config.hasKey("confidenceThreshold"))
            config.getDouble("confidenceThreshold") else 0.85
        targetFps = if (config.hasKey("targetFps")) config.getInt("targetFps") else DEFAULT_FPS
        enablePositionObs = config.hasKey("enablePositionObs") && config.getBoolean("enablePositionObs")

        startBackgroundThread()
        openCamera()
    }

    @ReactMethod
    fun stopSession() {
        captureSession?.close()
        cameraDevice?.close()
        imageReader?.close()
        stopBackgroundThread()
        captureSession = null
        cameraDevice = null
        imageReader = null
        isTracking = false
    }

    @ReactMethod
    fun pauseTracking(paused: Boolean) {
        isTracking = !paused
    }

    @ReactMethod
    fun setCalibration(calib: ReadableMap) {
        calibrationData = calib
        isTracking = true
        frameDiffHistory.clear()
    }

    @ReactMethod
    fun requestKeyFrame() {
        // Debug only — saves annotated frame
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "requestKeyFrame — TODO: save annotated frame to gallery")
        }
    }

    // -------------------------------------------------------------------------
    // Camera2 setup
    // -------------------------------------------------------------------------

    private fun openCamera() {
        val ctx = reactApplicationContext
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED) {
            Log.e(TAG, "Camera permission not granted")
            return
        }

        val manager = ctx.getSystemService(CameraManager::class.java)
        cameraManager = manager

        // Find back-facing camera
        val cameraId = manager.cameraIdList.firstOrNull { id ->
            manager.getCameraCharacteristics(id)
                .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: return

        val reader = ImageReader.newInstance(TARGET_WIDTH, TARGET_HEIGHT,
            ImageFormat.YUV_420_888, 2)
        reader.setOnImageAvailableListener({ r ->
            val image = r.acquireLatestImage() ?: return@setOnImageAvailableListener
            try {
                processFrame(image)
            } finally {
                image.close()
            }
        }, backgroundHandler)
        imageReader = reader

        manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                cameraDevice = camera
                createCaptureSession(camera, reader)
            }
            override fun onDisconnected(camera: CameraDevice) { camera.close() }
            override fun onError(camera: CameraDevice, error: Int) {
                Log.e(TAG, "Camera error: $error")
                camera.close()
            }
        }, backgroundHandler)
    }

    private fun createCaptureSession(camera: CameraDevice, reader: ImageReader) {
        val surfaces = listOf(reader.surface)
        camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
            override fun onConfigured(session: CameraCaptureSession) {
                captureSession = session
                val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                    addTarget(reader.surface)
                    set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                        android.util.Range(targetFps, targetFps))
                }.build()
                session.setRepeatingRequest(request, null, backgroundHandler)
                Log.d(TAG, "Capture session started at ${targetFps}fps")
            }
            override fun onConfigureFailed(session: CameraCaptureSession) {
                Log.e(TAG, "Capture session configuration failed")
            }
        }, backgroundHandler)
    }

    // -------------------------------------------------------------------------
    // Frame processing (stubs — real CV in M1)
    // -------------------------------------------------------------------------

    private fun processFrame(image: android.media.Image) {
        val timestamp = System.currentTimeMillis()

        if (calibrationData == null) {
            // Phase 1: board detection stub
            // TODO: Convert YUV → grayscale, run Canny + Hough, detect 9x9 grid
            val confidence = 0.0 // placeholder
            if (confidence > confidenceThreshold) {
                val event = Arguments.createMap().apply {
                    putArray("corners", Arguments.createArray())
                    putDouble("confidence", confidence)
                    putBoolean("lightingWarning", false)
                    putDouble("timestamp", timestamp.toDouble())
                }
                sendEvent("onBoardObservation", event)
            }
        } else if (isTracking) {
            // Phase 2: occupancy hashing stub
            // TODO: Warp each of 64 squares via homography, hash pixel values
            // TODO: Compare consecutive hashes, emit MoveCandidate on stable diff
        }
    }

    // -------------------------------------------------------------------------
    // Event emission
    // -------------------------------------------------------------------------

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // -------------------------------------------------------------------------
    // Background thread
    // -------------------------------------------------------------------------

    private fun startBackgroundThread() {
        backgroundThread = HandlerThread("CVBackgroundThread").also {
            it.start()
            backgroundHandler = Handler(it.looper)
        }
    }

    private fun stopBackgroundThread() {
        backgroundThread?.quitSafely()
        backgroundThread?.join()
        backgroundThread = null
        backgroundHandler = null
    }
}
