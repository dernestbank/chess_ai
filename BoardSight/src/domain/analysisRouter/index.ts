import { submitAnalysisJob } from '../../api/analysis';

export type AnalysisMode = 'cloud' | 'device' | 'auto';

export interface AnalysisConfig {
  cloudEndpointUrl?: string;
  apiKey?: string;
  enableLLM: boolean;
  mode: AnalysisMode;
}

async function isNetworkAvailable(): Promise<boolean> {
  // Simplified check — in production use @react-native-community/netinfo
  try {
    const res = await fetch('https://clients3.google.com/generate_204', {
      method: 'HEAD',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signal: (AbortSignal as any).timeout?.(3000),
    });
    return res.status === 204;
  } catch {
    return false;
  }
}

/**
 * Route an analysis request to cloud or device, returning a jobId.
 * Device analysis is stubbed — it returns a local ID for now.
 */
export async function routeAnalysis(
  pgn: string,
  config: AnalysisConfig,
): Promise<string> {
  const useCloud =
    config.mode === 'cloud' ||
    (config.mode === 'auto' &&
      !!config.cloudEndpointUrl &&
      !!(await isNetworkAvailable()));

  if (useCloud && config.cloudEndpointUrl && config.apiKey) {
    // initApiClient must have been called before this (done in _triggerAnalysis)
    return submitAnalysisJob(pgn);
  }

  // On-device stub — returns a local job ID
  // TODO: Integrate on-device Stockfish WASM for real analysis
  const localJobId = 'local_' + Math.random().toString(36).slice(2);
  return localJobId;
}
