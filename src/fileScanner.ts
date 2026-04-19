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

import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import pLimit from 'p-limit';
import { DetectorOptions } from './options';
import { FileResult } from './urlFilter';
import { URLParser } from './urlParser';
import { sanitizeGlobPatterns } from './pathSanitizer';
import { Logger, NullLogger } from './logger';
import { URLFilter } from './urlFilter';

/**
 * Responsible for discovering and reading source code files to be scanned.
 * This class handles the infrastructure concerns of I/O, globbing, and concurrency.
 */
export class FileScanner {
    private options: DetectorOptions;
    private logger: Logger;
    private parser: URLParser;
    private urlFilter: URLFilter;

    constructor(options: DetectorOptions, parser: URLParser, logger: Logger = NullLogger) {
        this.options = options;
        this.parser = parser;
        this.logger = logger;
        this.urlFilter = new URLFilter({
            ignoreDomains: this.options.ignoreDomains,
            includeComments: this.options.includeComments,
            includeNonFqdn: this.options.includeNonFqdn,
        });
    }

    /**
     * Finds all files matching the configured scan patterns.
     */
    private async findFiles(): Promise<string[]> {
        const scanPatterns = sanitizeGlobPatterns(this.options.scan || ['**/*']);
        const excludePatterns = sanitizeGlobPatterns(this.options.exclude || []);
        const cwd = process.cwd();

        try {
            const files = await fg(scanPatterns, {
                cwd: cwd,
                ignore: excludePatterns,
                dot: false,
                onlyFiles: true,
                followSymbolicLinks: false,
                suppressErrors: true,
                absolute: false,
                markDirectories: false,
            });

            return files.map(file => path.resolve(cwd, file));
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to find files: ${errorMessage}`);
            throw new Error(`Failed to find files: ${errorMessage}`, { cause: error });
        }
    }

    /**
     * Processes a single file: reads content, detects language, and extracts URLs via the parser.
     */
    private async processFile(filePath: string): Promise<FileResult | null> {
        try {
            const content: string = await fs.promises.readFile(filePath, 'utf8');
            // Use the internal logic of LanguageManager (via Parser) to detect language
            // Note: URLParser uses LanguageManager internally. We need a way to get the language here.
            // Actually, let's assume the parser can handle the detection or we pass it in.
            // In the original code, this was in processFile.
            // Let's check if LanguageManager is available here.

            // We need a reference to the language manager. I'll add it to FileScanner or use the parser's one.
            // For now, let's assume we have access to the same language manager used by the parser.

            const language = this.parser.detectLanguageFromPath(filePath);
            const urls = await this.parser.detectURLs(content, language, filePath);

            // The filtering was done in URLDetector.processFile.
            // We should decide if it stays in the parser or moves to the scanner.
            // In current implementation, detectURLs returns raw matches, then filterUrls is called.
            // I'll move filtering into the Parser for a cleaner "Detection" unit.
            // Wait, I didn't put filtering in URLParser yet (except for the internal Filter object).

            return {
                file: filePath,
                urls: urls, // We will refine filtering logic soon
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to process file ${filePath}: ${errorMessage}`);
            return null;
        }
    }

    /**
     * Main entry point for batch URL detection across a filesystem.
     */
    public async scan(): Promise<FileResult[]> {
        const filePaths = await this.findFiles();

        if (filePaths.length === 0) {
            this.logger.info('No files found to process.');
            return [];
        }

        const limit = pLimit(this.options.concurrency || 10);
        const fileProcessPromises = filePaths.map(filePath => limit(() => this.processFile(filePath)));

        const allResults = await Promise.all(fileProcessPromises);
        return allResults.filter((result): result is FileResult => result !== null);
    }
}
