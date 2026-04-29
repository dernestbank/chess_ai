/**
 * GameService Zustand store tests.
 * Tests the core game flow: create → applyMove → undo → endGame.
 */

jest.mock('../../src/data/db', () => ({
  initDb: jest.fn().mockResolvedValue(undefined),
  getDb: jest.fn(),
}));

jest.mock('../../src/data/repositories', () => ({
  createGame: jest.fn().mockReturnValue({ id: 'test-game-1' }),
  saveMove: jest.fn(),
  updateGame: jest.fn(),
  deleteLastMove: jest.fn(),
  getGame: jest.fn(),
  getActiveGame: jest.fn().mockReturnValue(null),
  getMovesForGame: jest.fn().mockReturnValue([]),
  getAnalysis: jest.fn().mockReturnValue(null),
  saveAnalysis: jest.fn(),
  updateAnalysis: jest.fn(),
}));

jest.mock('../../src/api/client', () => ({
  initApiClient: jest.fn(),
}));

jest.mock('../../src/domain/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({
    enableRefereeMode: false,
    enableLLMExplanations: false,
    cloudEndpointUrl: '',
    apiKey: '',
    analysisModeDefault: 'device',
    darkMode: false,
  }),
}));

import { useGameService } from '../../src/domain/gameService';

const SESSION_CONFIG = {
  id: 'test-session',
  mode: 'bot' as const,
  boardOrientation: 'white-bottom' as const,
  assistLevel: 'off' as const,
};

beforeEach(() => {
  useGameService.setState({
    core: null,
    gameState: null,
    gameId: null,
    isLoading: false,
    error: null,
  });
});

describe('useGameService', () => {
  describe('startNewGame', () => {
    it('creates a game and sets core + gameState', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      const state = useGameService.getState();
      expect(state.core).not.toBeNull();
      expect(state.gameState).not.toBeNull();
      expect(state.gameId).toBe('test-game-1');
      expect(state.gameState?.fen).toContain('rnbqkbnr'); // starting position
    });
  });

  describe('applyMove', () => {
    it('applies a legal move and updates FEN', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      const { applyMove } = useGameService.getState();
      const ok = applyMove('e2', 'e4');
      expect(ok).toBe(true);

      const { gameState } = useGameService.getState();
      expect(gameState?.fen).toContain('4P3'); // e4 pawn moved
    });

    it('rejects an illegal move', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      const { applyMove } = useGameService.getState();
      const ok = applyMove('e2', 'e5'); // 3-square jump — illegal
      expect(ok).toBe(false);
    });

    it('returns false when no game is loaded', () => {
      const { applyMove } = useGameService.getState();
      expect(applyMove('e2', 'e4')).toBe(false);
    });
  });

  describe('undoMove', () => {
    it('reverts the last move', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      const startFen = useGameService.getState().gameState?.fen;
      useGameService.getState().applyMove('e2', 'e4');
      useGameService.getState().undoMove();

      const { gameState } = useGameService.getState();
      expect(gameState?.fen).toBe(startFen);
    });

    it('is a no-op when no moves have been made', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      const startFen = useGameService.getState().gameState?.fen;
      useGameService.getState().undoMove(); // should not throw
      expect(useGameService.getState().gameState?.fen).toBe(startFen);
    });
  });

  describe('endGame', () => {
    it('stamps the result on gameState', async () => {
      const { startNewGame } = useGameService.getState();
      await startNewGame(SESSION_CONFIG);

      useGameService.getState().endGame('1-0');
      expect(useGameService.getState().gameState?.result).toBe('1-0');
    });
  });

  describe('checkForActiveGame', () => {
    it('returns null when no active game in DB', async () => {
      const { checkForActiveGame } = useGameService.getState();
      const id = await checkForActiveGame();
      expect(id).toBeNull();
    });
  });
});
