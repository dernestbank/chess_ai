// TODO: Enable when Detox configured
// Run with: npx detox test -c ios.sim.debug e2e/otbFlow.test.ts
//
// Prerequisites:
//   - A physical or simulated board must be present in camera view, OR
//     the CV module mock must be enabled via DETOX_CV_MOCK=1 launch arg.

import { device, element, by, expect } from 'detox';

describe('OTB flow: launch → scan → calibrate → confirm → live game → export PGN', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      // Enable the CV mock so board detection completes without real hardware
      launchArgs: { DETOX_CV_MOCK: '1' },
    });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  // ─── Launch ───────────────────────────────────────────────────────────────

  it('should display the Choose Mode screen on launch', async () => {
    await expect(element(by.text('Choose Mode'))).toBeVisible();
  });

  it('should show the Over the Board mode card', async () => {
    await expect(element(by.text('Over the Board'))).toBeVisible();
  });

  // ─── Time-control picker ──────────────────────────────────────────────────

  it('should open the time control bottom sheet when Over the Board is tapped', async () => {
    await element(by.text('Over the Board')).tap();
    await expect(element(by.text('Set Up OTB Game'))).toBeVisible();
  });

  it('should display time control options in the picker', async () => {
    // The TimeControlPicker renders preset labels such as "Blitz 5+0"
    await expect(element(by.text('Blitz 5+0'))).toBeVisible();
  });

  it('should navigate to ScanScreen when Scan Board is tapped', async () => {
    await element(by.text('Scan Board →')).tap();
    await expect(element(by.text('Scanning for board…'))).toBeVisible();
  });

  // ─── Scan phase ───────────────────────────────────────────────────────────

  it('should show the camera view on the scan screen', async () => {
    // Camera view area is rendered; in simulator the placeholder is shown
    await expect(
      element(by.text('Waiting for camera…').withAncestor(by.id('scan-screen'))),
    ).toBeVisible();
  });

  it('should show a confidence progress indicator', async () => {
    await expect(element(by.id('confidence-bar'))).toBeVisible();
  });

  // ─── Calibration phase (mock fires board-detected event) ──────────────────

  it('should advance to the calibrating phase when the board is detected', async () => {
    // In mock mode the CV module emits a high-confidence BoardObservation after a short delay
    await waitFor(element(by.text('Board detected ✓'))).toBeVisible().withTimeout(8_000);
  });

  it('should show a locking-grid activity indicator', async () => {
    await expect(element(by.text('Hold still — locking grid…'))).toBeVisible();
  });

  // ─── Confirm phase ────────────────────────────────────────────────────────

  it('should advance to the confirm phase when calibration reaches high confidence', async () => {
    await waitFor(element(by.text('Confirm position'))).toBeVisible().withTimeout(8_000);
  });

  it('should display a board diagram preview in the confirm phase', async () => {
    await expect(element(by.id('board-diagram'))).toBeVisible();
  });

  it('should toggle board orientation with the Flip board button', async () => {
    await expect(element(by.text(/White at bottom/))).toBeVisible();
    await element(by.text(/Flip board/)).tap();
    await expect(element(by.text(/Black at bottom/))).toBeVisible();
    // Flip back to white-at-bottom for game start
    await element(by.text(/Flip board/)).tap();
  });

  // ─── Live game ────────────────────────────────────────────────────────────

  it('should navigate to LiveGameScreen when Start Game is tapped', async () => {
    await element(by.text('Start Game →')).tap();
    // LiveGameScreen shows clock components
    await waitFor(element(by.id('clock-white'))).toBeVisible().withTimeout(5_000);
  });

  it('should display the chess clock for both sides', async () => {
    await expect(element(by.id('clock-white'))).toBeVisible();
    await expect(element(by.id('clock-black'))).toBeVisible();
  });

  it('should render the board in the live game view', async () => {
    await expect(element(by.id('board-diagram'))).toBeVisible();
  });

  it('should show the Pause, Takeback, and Resign controls', async () => {
    await expect(element(by.text('Pause'))).toBeVisible();
    await expect(element(by.text('Takeback'))).toBeVisible();
    await expect(element(by.text('Resign'))).toBeVisible();
  });

  it('should pause CV tracking when Pause is tapped', async () => {
    await element(by.text('Pause')).tap();
    await expect(element(by.text('Paused'))).toBeVisible();
  });

  it('should resume tracking when Resume is tapped', async () => {
    await element(by.text('Resume')).tap();
    await expect(element(by.text('Paused'))).not.toBeVisible();
  });

  // Simulate the CV mock emitting a move candidate
  it('should append a move to the move list when the CV module detects a move', async () => {
    // The mock automatically fires a MoveCandidate (e2→e4, confidence 0.95) after resume
    await waitFor(element(by.id('move-list-item-0'))).toBeVisible().withTimeout(6_000);
  });

  it('should show a low-confidence confirmation sheet when CV confidence is below threshold', async () => {
    // Mock fires a second candidate with confidence 0.60
    await waitFor(element(by.id('confirm-move-sheet'))).toBeVisible().withTimeout(6_000);
  });

  it('should accept the suggested move when Confirm is tapped on the sheet', async () => {
    await element(by.text('Confirm')).tap();
    await expect(element(by.id('confirm-move-sheet'))).not.toBeVisible();
  });

  // ─── End game → review ────────────────────────────────────────────────────

  it('should show a confirmation alert when Resign is tapped in live game', async () => {
    await element(by.text('Resign')).tap();
    await expect(element(by.text('Are you sure?'))).toBeVisible();
  });

  it('should navigate to ReviewScreen after confirming resign', async () => {
    await element(by.text('Resign')).tap(); // confirm button in alert
    await waitFor(element(by.text(/Black wins|White wins/))).toBeVisible().withTimeout(5_000);
  });

  // ─── Review screen: export PGN ────────────────────────────────────────────

  it('should display the game result summary card', async () => {
    await expect(element(by.text(/0-1|1-0/))).toBeVisible();
  });

  it('should show the move list in the review', async () => {
    await expect(element(by.text('Moves'))).toBeVisible();
  });

  it('should display the board replay section', async () => {
    await expect(element(by.text('Board Position'))).toBeVisible();
  });

  it('should navigate forward through replay positions', async () => {
    await element(by.text('▶')).tap();
    await expect(element(by.text(/Move 1/))).toBeVisible();
  });

  it('should navigate back to the start position', async () => {
    await element(by.text('⏮')).tap();
    await expect(element(by.text('Start'))).toBeVisible();
  });

  it('should show the Share PGN button', async () => {
    await expect(element(by.text('Share PGN'))).toBeVisible();
  });

  it('should open the native share sheet when Share PGN is tapped', async () => {
    await element(by.text('Share PGN')).tap();
    // Dismiss share sheet
    await device.pressBack();
  });

  it('should copy PGN to clipboard when Copy PGN is tapped', async () => {
    await element(by.text('Copy PGN')).tap();
    // App shows a "Copied" confirmation alert
    await expect(element(by.text('Copied'))).toBeVisible();
    await element(by.text('OK')).tap();
  });
});
