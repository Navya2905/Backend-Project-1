// Runs before each e2e test file is loaded, so ConfigModule only ever sees test settings.
import { applyTestEnv } from './test-env';

applyTestEnv();
