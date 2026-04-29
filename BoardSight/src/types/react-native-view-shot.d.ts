declare module 'react-native-view-shot' {
  import { Component } from 'react';
  import { ViewStyle } from 'react-native';
  interface CaptureOptions { format?: string; quality?: number; result?: string; }
  export function captureRef(ref: any, options?: CaptureOptions): Promise<string>;
  export default class ViewShot extends Component<{ style?: ViewStyle; options?: CaptureOptions; children?: any }> {}
}
