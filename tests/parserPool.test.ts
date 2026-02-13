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

import { ParserPool, LanguageManager } from '../src/index';
import Parser from 'tree-sitter';

describe('ParserPool', () => {
    let pool: ParserPool;
    let languageManager: LanguageManager;

    beforeEach(() => {
        pool = new ParserPool(3); // Small pool size for testing
        languageManager = new LanguageManager();
    });

    afterEach(() => {
        pool.clear();
    });

    describe('Parser Acquisition and Release', () => {
        test('should create and return a new parser on first acquire', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const parser = pool.acquire('javascript', jsGrammar);

            expect(parser).toBeInstanceOf(Parser);
            expect(pool.getPoolSize('javascript')).toBe(1);
            expect(pool.getAvailableCount('javascript')).toBe(0);
        });

        test('should reuse parser after release', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const parser1 = pool.acquire('javascript', jsGrammar);
            pool.release('javascript', parser1);

            expect(pool.getAvailableCount('javascript')).toBe(1);

            const parser2 = pool.acquire('javascript', jsGrammar);
            expect(parser2).toBe(parser1); // Same instance
            expect(pool.getPoolSize('javascript')).toBe(1); // Still only one parser
        });

        test('should create multiple parsers up to pool size', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;

            const parser1 = pool.acquire('javascript', jsGrammar);
            const parser2 = pool.acquire('javascript', jsGrammar);
            const parser3 = pool.acquire('javascript', jsGrammar);

            expect(parser1).not.toBe(parser2);
            expect(parser2).not.toBe(parser3);
            expect(parser1).not.toBe(parser3);
            expect(pool.getPoolSize('javascript')).toBe(3);
            expect(pool.getAvailableCount('javascript')).toBe(0);

            // Clean up
            pool.release('javascript', parser1);
            pool.release('javascript', parser2);
            pool.release('javascript', parser3);
        });

        test('should handle pool exhaustion gracefully', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;

            // Fill the pool
            pool.acquire('javascript', jsGrammar);
            pool.acquire('javascript', jsGrammar);
            pool.acquire('javascript', jsGrammar);

            // Try to acquire when pool is full
            const parser4 = pool.acquire('javascript', jsGrammar);

            // Should still return a parser (reuses first one)
            expect(parser4).toBeInstanceOf(Parser);
            expect(pool.getPoolSize('javascript')).toBe(3); // Still at max size
        });

        test('should maintain separate pools per language', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const pyGrammar = languageManager.getLanguage('python') as Parser.Language;

            const jsParser = pool.acquire('javascript', jsGrammar);
            const pyParser = pool.acquire('python', pyGrammar);

            expect(pool.getPoolSize('javascript')).toBe(1);
            expect(pool.getPoolSize('python')).toBe(1);
            expect(jsParser).not.toBe(pyParser);
        });
    });

    describe('Parser Usage', () => {
        test('should successfully parse code with acquired parser', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const parser = pool.acquire('javascript', jsGrammar);

            const sourceCode = 'const url = "https://example.com";';
            const tree = parser.parse(sourceCode);

            expect(tree).toBeDefined();
            expect(tree.rootNode).toBeDefined();

            pool.release('javascript', parser);
        });

        test('should allow parser reuse for different code', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const parser1 = pool.acquire('javascript', jsGrammar);

            const code1 = 'const a = "https://first.com";';
            const tree1 = parser1.parse(code1);
            expect(tree1.rootNode).toBeDefined();

            pool.release('javascript', parser1);

            const parser2 = pool.acquire('javascript', jsGrammar);
            expect(parser2).toBe(parser1); // Same parser instance

            const code2 = 'const b = "https://second.com";';
            const tree2 = parser2.parse(code2);
            expect(tree2.rootNode).toBeDefined();
            expect(tree2).not.toBe(tree1); // Different parse tree

            pool.release('javascript', parser2);
        });
    });

    describe('Pool Management', () => {
        test('should clear all pools', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const pyGrammar = languageManager.getLanguage('python') as Parser.Language;

            pool.acquire('javascript', jsGrammar);
            pool.acquire('python', pyGrammar);

            expect(pool.getPoolSize('javascript')).toBe(1);
            expect(pool.getPoolSize('python')).toBe(1);

            pool.clear();

            expect(pool.getPoolSize('javascript')).toBe(0);
            expect(pool.getPoolSize('python')).toBe(0);
        });

        test('should return 0 for non-existent language pool', () => {
            expect(pool.getPoolSize('nonexistent')).toBe(0);
            expect(pool.getAvailableCount('nonexistent')).toBe(0);
        });

        test('should track available count correctly', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;

            const parser1 = pool.acquire('javascript', jsGrammar);
            expect(pool.getAvailableCount('javascript')).toBe(0);

            const parser2 = pool.acquire('javascript', jsGrammar);
            expect(pool.getAvailableCount('javascript')).toBe(0);

            pool.release('javascript', parser1);
            expect(pool.getAvailableCount('javascript')).toBe(1);

            pool.release('javascript', parser2);
            expect(pool.getAvailableCount('javascript')).toBe(2);
        });
    });

    describe('Concurrent Usage Simulation', () => {
        test('should handle concurrent acquire/release', () => {
            const jsGrammar = languageManager.getLanguage('javascript') as Parser.Language;
            const parsers: Parser[] = [];

            // Acquire multiple parsers
            for (let i = 0; i < 5; i++) {
                parsers.push(pool.acquire('javascript', jsGrammar));
            }

            // Pool size should be at most 3 (the pool size limit)
            expect(pool.getPoolSize('javascript')).toBeLessThanOrEqual(3);

            // Release all parsers
            parsers.forEach(parser => pool.release('javascript', parser));

            // All should now be available
            expect(pool.getAvailableCount('javascript')).toBe(pool.getPoolSize('javascript'));
        });
    });
});

describe('LanguageManager with Parser Pool Integration', () => {
    let manager: LanguageManager;

    beforeEach(() => {
        manager = new LanguageManager(undefined, undefined, 5);
    });

    test('should provide access to parser pool', () => {
        const pool = manager.getParserPool();
        expect(pool).toBeInstanceOf(ParserPool);
    });

    test('should use parser pool with custom pool size', () => {
        const pool = manager.getParserPool();
        const jsGrammar = manager.getLanguage('javascript') as Parser.Language;

        // Acquire 5 parsers (our custom pool size)
        const parsers: Parser[] = [];
        for (let i = 0; i < 5; i++) {
            parsers.push(pool.acquire('javascript', jsGrammar));
        }

        expect(pool.getPoolSize('javascript')).toBe(5);

        // Clean up
        parsers.forEach(parser => pool.release('javascript', parser));
    });

    test('should work with multiple languages', () => {
        const pool = manager.getParserPool();

        const jsGrammar = manager.getLanguage('javascript') as Parser.Language;
        const tsGrammar = manager.getLanguage('typescript') as Parser.Language;
        const pyGrammar = manager.getLanguage('python') as Parser.Language;

        const jsParser = pool.acquire('javascript', jsGrammar);
        const tsParser = pool.acquire('typescript', tsGrammar);
        const pyParser = pool.acquire('python', pyGrammar);

        expect(pool.getPoolSize('javascript')).toBe(1);
        expect(pool.getPoolSize('typescript')).toBe(1);
        expect(pool.getPoolSize('python')).toBe(1);

        pool.release('javascript', jsParser);
        pool.release('typescript', tsParser);
        pool.release('python', pyParser);
    });
});
