/**
 * Shared Detox test helpers for BoardSight E2E suites.
 *
 * All helpers operate on elements located by testID.
 * Import these instead of calling element(by.id(...)) / expect(...) directly
 * so that wait-timeout defaults and error messages are consistent.
 */

import { element, by, expect as detoxExpect, waitFor } from 'detox';

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Wait until the element with the given testID is visible.
 * Throws if the element does not appear within `timeout` milliseconds.
 */
export async function waitForElement(testId: string, timeout = DEFAULT_TIMEOUT_MS): Promise<void> {
  await waitFor(element(by.id(testId)))
    .toBeVisible()
    .withTimeout(timeout);
}

/**
 * Tap the element identified by testID.
 * The element must already be visible; use `waitForElement` first if needed.
 */
export async function tapElement(testId: string): Promise<void> {
  await element(by.id(testId)).tap();
}

/**
 * Type text into a TextInput identified by testID.
 */
export async function typeText(testId: string, text: string): Promise<void> {
  await element(by.id(testId)).typeText(text);
}

/**
 * Assert that the element with the given testID is currently visible.
 */
export async function assertVisible(testId: string): Promise<void> {
  await detoxExpect(element(by.id(testId))).toBeVisible();
}

/**
 * Assert that the element with the given testID is NOT visible.
 */
export async function assertNotVisible(testId: string): Promise<void> {
  await detoxExpect(element(by.id(testId))).not.toBeVisible();
}
