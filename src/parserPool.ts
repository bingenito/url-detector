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

import Parser from 'tree-sitter';
import { Logger, NullLogger } from './logger';

/**
 * Parser pool entry containing a parser instance and availability status.
 */
interface ParserPoolEntry {
    parser: Parser;
    inUse: boolean;
}

/**
 * Pool manager for Tree-sitter Parser instances to enable parser reuse.
 *
 * Instead of creating a new Parser instance for each file, the pool maintains
 * a collection of reusable parser instances. This significantly improves performance
 * by eliminating repeated parser initialization overhead.
 *
 * The pool uses an acquire/release pattern to safely share parsers across concurrent
 * file processing operations.
 */
export class ParserPool {
    private pools: Map<string, ParserPoolEntry[]>;
    private poolSize: number;
    private logger: Logger;

    /**
     * Creates a new ParserPool instance.
     *
     * @param poolSize Maximum number of parsers to maintain per language (default: 10)
     * @param logger Optional logger for diagnostics
     *
     * @example
     * ```typescript
     * const pool = new ParserPool(10); // 10 parsers per language
     * const parser = pool.acquire('javascript', jsGrammar);
     * try {
     *   const tree = parser.parse(sourceCode);
     *   // ... process tree
     * } finally {
     *   pool.release('javascript', parser);
     * }
     * ```
     */
    constructor(poolSize: number = 10, logger: Logger = NullLogger) {
        this.pools = new Map();
        this.poolSize = poolSize;
        this.logger = logger;
    }

    /**
     * Acquires a parser instance for the specified language.
     *
     * If an available parser exists in the pool, it's marked as in-use and returned.
     * Otherwise, a new parser is created (up to poolSize limit) or the method waits
     * briefly for a parser to become available.
     *
     * @param language Language identifier (e.g., 'javascript', 'python')
     * @param grammar Tree-sitter grammar to use for parsing
     * @returns Parser instance ready for use
     */
    public acquire(language: string, grammar: Parser.Language): Parser {
        if (!this.pools.has(language)) {
            this.pools.set(language, []);
        }

        const pool = this.pools.get(language)!;

        // Find an available parser
        const available = pool.find(entry => !entry.inUse);
        if (available) {
            available.inUse = true;
            return available.parser;
        }

        // Create a new parser if under the limit
        if (pool.length < this.poolSize) {
            const parser = new Parser();
            parser.setLanguage(grammar);
            const entry: ParserPoolEntry = { parser, inUse: true };
            pool.push(entry);
            return parser;
        }

        // Pool is full and no parsers available - reuse the first one
        // This shouldn't happen in normal concurrent usage, but provides a fallback
        this.logger.warn(`Parser pool exhausted for ${language}, reusing parser (consider increasing pool size)`);
        const entry = pool[0];
        entry.inUse = true;
        return entry.parser;
    }

    /**
     * Releases a parser instance back to the pool for reuse.
     *
     * @param language Language identifier the parser was used for
     * @param parser Parser instance to release
     */
    public release(language: string, parser: Parser): void {
        const pool = this.pools.get(language);
        if (!pool) {
            return;
        }

        const entry = pool.find(e => e.parser === parser);
        if (entry) {
            entry.inUse = false;
        }
    }

    /**
     * Clears all parser pools, releasing all resources.
     *
     * Useful for cleanup or when language configurations change.
     */
    public clear(): void {
        this.pools.clear();
    }

    /**
     * Gets the current size of the pool for a specific language.
     *
     * @param language Language identifier
     * @returns Number of parser instances in the pool
     */
    public getPoolSize(language: string): number {
        return this.pools.get(language)?.length || 0;
    }

    /**
     * Gets the number of available (not in-use) parsers for a language.
     *
     * @param language Language identifier
     * @returns Number of available parser instances
     */
    public getAvailableCount(language: string): number {
        const pool = this.pools.get(language);
        if (!pool) {
            return 0;
        }
        return pool.filter(entry => !entry.inUse).length;
    }
}
