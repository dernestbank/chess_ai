const Camera = 'Camera';
const useCameraDevice = jest.fn(() => ({ id: 'back', hasFlash: false }));
const useCameraPermission = jest.fn(() => ({
  hasPermission: true,
  requestPermission: jest.fn().mockResolvedValue(true),
}));

module.exports = { Camera, useCameraDevice, useCameraPermission };
