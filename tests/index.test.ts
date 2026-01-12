/*
 * Morgan Stanley makes this available to you under the Apache License,
 * Version 2.0 (the "License"). You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0.
 *
 * See the NOTICE file distributed with this work for additional information
 * regarding copyright ownership. Unless required by applicable law or agreed
 * to in writing, software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 */

describe('index.ts exports', () => {
    test('should export URLDetector', async () => {
        const { URLDetector } = await import('../src/index');
        expect(URLDetector).toBeDefined();
        expect(typeof URLDetector).toBe('function');
    });

    test('should export DetectorOptions', async () => {
        const { DetectorOptions } = await import('../src/index');
        expect(DetectorOptions).toBeDefined();
        expect(typeof DetectorOptions).toBe('function');
    });

    test('should export LanguageManager', async () => {
        const { LanguageManager } = await import('../src/index');
        expect(LanguageManager).toBeDefined();
        expect(typeof LanguageManager).toBe('function');
    });

    test('should export URLFilter', async () => {
        const { URLFilter } = await import('../src/index');
        expect(URLFilter).toBeDefined();
        expect(typeof URLFilter).toBe('function');
    });

    test('should export OutputFormatter', async () => {
        const { OutputFormatter } = await import('../src/index');
        expect(OutputFormatter).toBeDefined();
        expect(typeof OutputFormatter).toBe('function');
    });

    test('should export Logger types', async () => {
        const { NullLogger, ConsoleLogger, ResultsOnlyLogger } = await import('../src/index');
        expect(NullLogger).toBeDefined();
        expect(ConsoleLogger).toBeDefined();
        expect(ResultsOnlyLogger).toBeDefined();
    });

    test('should export URLDetector as default export', async () => {
        const URLDetectorDefault = (await import('../src/index')).default;
        expect(URLDetectorDefault).toBeDefined();
        expect(typeof URLDetectorDefault).toBe('function');
    });

    test('should be able to create URLDetector instance from export', async () => {
        const { URLDetector } = await import('../src/index');
        const detector = new URLDetector();
        expect(detector).toBeInstanceOf(URLDetector);
    });

    test('should be able to create URLDetector instance from default export', async () => {
        const URLDetectorDefault = (await import('../src/index')).default;
        const detector = new URLDetectorDefault();
        expect(detector).toBeInstanceOf(URLDetectorDefault);
    });
});