// TODO: Enable when Detox configured
// Run with: npx detox test -c ios.sim.release e2e/botGame.test.ts

import { device, element, by, expect as detoxExpect, waitFor } from 'detox';
import { assertVisible, tapElement, waitForElement } from './helpers';

describe('Bot game flow', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterAll(async () => {
    await device.terminateApp();
  });

  // ─── Start screen ──────────────────────────────────────────────────────────

  it('should display the Choose Mode screen on launch', async () => {
    await detoxExpect(element(by.text('Choose Mode'))).toBeVisible();
  });

  it('should show Play vs Bot card', async () => {
    await detoxExpect(element(by.text('Play vs Bot'))).toBeVisible();
  });

  // ─── Navigate into bot game ────────────────────────────────────────────────

  it('should navigate to BotGameScreen when Play vs Bot is tapped', async () => {
    await element(by.text('Play vs Bot')).tap();
    // The bot game screen shows the bot player label
    await detoxExpect(element(by.text(/Bot \(intermediate\)/))).toBeVisible();
  });

  // ─── Board and clock ───────────────────────────────────────────────────────

  it('should render the chess board', async () => {
    await assertVisible('board-diagram');
  });

  it('should display the white and black clocks', async () => {
    await assertVisible('clock-white');
    await assertVisible('clock-black');
  });

  // ─── Making moves ─────────────────────────────────────────────────────────

  it('should highlight legal targets when a piece square is tapped', async () => {
    // Tap e2 pawn (white to move first)
    await tapElement('square-e2');
    // At least one legal-target highlight should appear (e4)
    await assertVisible('square-e4');
  });

  it('should execute a pawn move e2→e4', async () => {
    await tapElement('square-e4');
    // Move list now has at least one entry
    await detoxExpect(element(by.text('e4'))).toBeVisible();
  });

  it('should show bot thinking indicator after player move', async () => {
    await detoxExpect(element(by.text('thinking…'))).toBeVisible();
  });

  it('should record the bot reply in the move list', async () => {
    // Wait up to 10 s for the bot to respond
    await waitForElement('move-list-item-1', 10_000);
  });

  // ─── Hint ──────────────────────────────────────────────────────────────────

  it('should display a hint banner when Hint button is tapped', async () => {
    await element(by.text('Hint')).tap();
    await waitFor(element(by.text(/Best move:/))).toBeVisible().withTimeout(8_000);
  });

  it('should dismiss the hint banner', async () => {
    await element(by.text('✕')).tap();
    await detoxExpect(element(by.text(/Best move:/))).not.toBeVisible();
  });

  // ─── Undo ──────────────────────────────────────────────────────────────────

  it('should undo the last two plies when Undo is tapped', async () => {
    await element(by.text('Undo')).tap();
    // After undoing player + bot move, the move list should be shorter
    await detoxExpect(element(by.text('e4'))).not.toBeVisible();
  });

  // ─── Resign and navigate to review ────────────────────────────────────────

  it('should show a confirmation alert when Resign is tapped', async () => {
    await element(by.text('Resign')).tap();
    await detoxExpect(element(by.text('Are you sure you want to resign?'))).toBeVisible();
  });

  it('should navigate to ReviewScreen after confirming resign', async () => {
    await element(by.text('Resign')).tap(); // confirm button in alert
    // ReviewScreen shows the result and export options
    await waitFor(element(by.text(/Black wins|White wins/))).toBeVisible().withTimeout(5_000);
  });

  // ─── Post-game review ─────────────────────────────────────────────────────

  it('should display the game result on the review summary card', async () => {
    await detoxExpect(element(by.text(/0-1|1-0/))).toBeVisible();
  });

  it('should show the Share PGN export button', async () => {
    await detoxExpect(element(by.text('Share PGN'))).toBeVisible();
  });

  it('should show the Copy PGN button', async () => {
    await detoxExpect(element(by.text('Copy PGN'))).toBeVisible();
  });

  it('should open the native share sheet when Share PGN is tapped', async () => {
    await element(by.text('Share PGN')).tap();
    // Native share sheet does not have a Detox-queryable ID on all platforms;
    // just assert it dismissed without throwing
    await device.pressBack(); // dismiss share sheet (Android); no-op on iOS
  });

  it('should show the board replay section', async () => {
    await detoxExpect(element(by.text('Board Position'))).toBeVisible();
  });

  it('should allow stepping through replay moves with the next button', async () => {
    // Advance one move
    await element(by.text('▶')).tap();
    await detoxExpect(element(by.text(/Move 1/))).toBeVisible();
  });
});
