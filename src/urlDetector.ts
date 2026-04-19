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

import { DetectorOptions, DetectorOptionsConfig } from './options';
import { LanguageManager } from './languageManager';
import { URLParser } from './urlParser';
import { FileScanner } from './fileScanner';
import { URLFilter, URLMatch } from './urlFilter';
import { Logger, NullLogger } from './logger';

export interface FileResult {
    file: string;
    urls: URLMatch[];
}

/**
 * Facade for the URL detection system.
 * Coordinates between the FileScanner and URLParser to provide a unified API.
 */
export class URLDetector {
    private options: DetectorOptions;
    private logger: Logger;
    private languageManager: LanguageManager;
    private parser: URLParser;
    private scanner: FileScanner;

    constructor(optionsConfig: DetectorOptionsConfig = {}, logger: Logger = NullLogger) {
        this.options = new DetectorOptions(optionsConfig);
        this.logger = logger;
        this.languageManager = new LanguageManager(this.logger);
        this.parser = new URLParser(this.options, this.languageManager, this.logger);
        this.scanner = new FileScanner(this.options, this.parser, this.logger);
    }

    public get getOptions(): DetectorOptions {
        return this.options;
    }

    public get getUrlFilter(): URLFilter {
        // Return the internal filter from the parser to maintain backward compatibility
        return this.parser.urlFilter;
    }

    /**
     * Detects URLs in source code. Delegated to URLParser.
     */
    public async detectURLs(sourceCode: string, language: string, filePath: string = '<unknown>'): Promise<URLMatch[]> {
        return this.parser.detectURLs(sourceCode, language, filePath);
    }

    /**
     * Scans the filesystem for URLs. Delegated to FileScanner.
     */
    public async process(): Promise<FileResult[]> {
        return this.scanner.scan();
    }
}
