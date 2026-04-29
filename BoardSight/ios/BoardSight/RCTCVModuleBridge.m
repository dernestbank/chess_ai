#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(CVModuleNative, RCTEventEmitter)

RCT_EXTERN_METHOD(startSession:(NSDictionary *)config)
RCT_EXTERN_METHOD(stopSession)
RCT_EXTERN_METHOD(pauseTracking:(BOOL)paused)
RCT_EXTERN_METHOD(setCalibration:(NSDictionary *)calib)
RCT_EXTERN_METHOD(requestKeyFrame)

@end
