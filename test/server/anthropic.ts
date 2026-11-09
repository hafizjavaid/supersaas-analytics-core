// The test server asks this stand-in instead of Anthropic's API, started in global-setup.ts.
export const FAKE_ANTHROPIC_PORT = 3104;
export const FAKE_ANTHROPIC_URL = `http://127.0.0.1:${FAKE_ANTHROPIC_PORT}`;
export const TEST_ANTHROPIC_KEY = "sk-ant-test-key";
