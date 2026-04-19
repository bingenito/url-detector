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
import { LanguageManager } from './languageManager';
import { DetectorOptions } from './options';
import { URLFilter, URLMatch } from './urlFilter';
import { Logger, NullLogger } from './logger';

/**
 * Internal interface for Tree-sitter nodes to avoid 'any' and provide type safety.
 */
interface TSNode {
    type: string;
    startIndex: number;
    endIndex: number;
    childCount: number;
    parent: TSNode | null;
    children: TSNode[] | undefined;
    text?: string;
    child(i: number): TSNode | null;
}

/**
 * Internal interface for Tree-sitter trees.
 */
interface TSTree {
    rootNode: TSNode;
}

/**
 * Core URL detection engine responsible for parsing source code and extracting URLs.
 * This class is decoupled from the filesystem and focuses purely on AST traversal and regex matching.
 */
export class URLParser {
    private parser: Parser;

    /**
     * Detects the programming language from a file path using the internal language manager.
     */
    public detectLanguageFromPath(filePath: string): string {
        return this.languageManager.detectLanguageFromPath(filePath);
    }

    private languageManager: LanguageManager;
    private urlPattern: RegExp;
    private commonSchemaPatterns: RegExp[];
    public urlFilter: URLFilter;
    private options: DetectorOptions;
    private logger: Logger;

    constructor(options: DetectorOptions, languageManager: LanguageManager, logger: Logger = NullLogger) {
        this.options = options;
        this.logger = logger;
        this.parser = new Parser();
        this.languageManager = languageManager;
        this.urlPattern = /(?:https?:\/\/|\/\/(?=[a-zA-Z0-9.-]+[a-zA-Z]))[^\s<>"'`${}]+/g;
        this.commonSchemaPatterns = [
            /^\/\/W3C\/\/DTD/i,
            /^\/\/EN$/i,
            /^\/\/IETF\/\/DTD/i,
            /^\/\/OASIS\/\/DTD/i,
            /^\/\/ISO\/\/DTD/i,
            /^\/\/XML-DEV\/\/DTD/i,
            /^\/\/Apache\/\/DTD/i,
            /^\/\/Sun\/\/DTD/i,
            /^\/\/Dublin Core\/\/DTD/i,
        ];
        this.urlFilter = new URLFilter({
            ignoreDomains: this.options.ignoreDomains,
            includeComments: this.options.includeComments,
            includeNonFqdn: this.options.includeNonFqdn,
        });
    }

    /**
     * Detects URLs in the provided source code using tree-sitter parsing.
     */
    public async detectURLs(sourceCode: string, language: string, filePath: string = '<unknown>'): Promise<URLMatch[]> {
        try {
            const languageGrammar = this.languageManager.getLanguage(language);

            if (!languageGrammar && !this.options.fallbackRegex) {
                return [];
            }

            if (!languageGrammar) {
                this.logger.warn(
                    `No parser available for language ${language} for file ${filePath}, using fallback regex`,
                );
                return this.fallbackDetection(sourceCode);
            }

            const parser = new Parser();
            parser.setLanguage(languageGrammar as Parser.Language);
            const tree = parser.parse(sourceCode);

            return this.extractURLsFromTree(tree, sourceCode);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (this.options.fallbackRegex) {
                this.logger.warn(
                    `Failed to parse ${filePath} with tree-sitter, falling back to regex: ${errorMessage}`,
                );
                return this.fallbackDetection(sourceCode);
            } else {
                this.logger.warn(`Failed to parse ${filePath}: ${errorMessage}`);
                return [];
            }
        }
    }

    private extractURLsFromTree(tree: TSTree, sourceCode: string): URLMatch[] {
        const urls: URLMatch[] = [];
        const sourceLines = sourceCode.split('\n');

        const traverseNode = (node: TSNode): void => {
            const text = sourceCode.slice(node.startIndex, node.endIndex);

            if (this.isStringNode(node)) {
                if (node.type === 'raw_text' && this.isScriptContent(node)) {
                    const scriptUrls = this.parseScriptContent(text, node.startIndex, sourceCode, sourceLines);
                    urls.push(...scriptUrls);
                } else {
                    const foundUrls = this.extractURLsFromString(
                        text,
                        node.startIndex,
                        'string',
                        sourceCode,
                        sourceLines,
                    );
                    urls.push(...foundUrls);
                }
            }

            if (this.isCommentNode(node)) {
                const foundUrls = this.extractURLsFromString(text, node.startIndex, 'comment', sourceCode, sourceLines);
                urls.push(...foundUrls);
            }

            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                    traverseNode(child);
                }
            }
        };

        traverseNode(tree.rootNode);
        return this.deduplicateByExactPosition(urls);
    }

    private deduplicateByExactPosition(urls: URLMatch[]): URLMatch[] {
        const seen = new Map<string, URLMatch>();
        for (const url of urls) {
            const key = `${url.start}:${url.end}`;
            if (!seen.has(key)) {
                seen.set(key, url);
            }
        }
        return Array.from(seen.values());
    }

    private isStringNode(node: TSNode): boolean {
        const stringTypes = [
            'string',
            'string_literal',
            'string_content',
            'string_fragment',
            'template_string',
            'interpreted_string_literal',
            'raw_string_literal',
            'character_literal',
            'attribute_value',
            'raw_text',
            'line_string_literal',
            'line_str_text',
            'raw_str_end_part',
            'CharData',
            'CData',
            'AttValue',
            'double_quote_scalar',
            'single_quote_scalar',
            'plain_scalar',
        ];
        return stringTypes.includes(node.type);
    }

    private isCommentNode(node: TSNode): boolean {
        const commentTypes = ['comment', 'line_comment', 'block_comment', 'documentation_comment', 'Comment'];
        return commentTypes.includes(node.type);
    }

    private isScriptContent(node: TSNode): boolean {
        let parent = node.parent;
        while (parent) {
            if (parent.type === 'script_element' || parent.type === 'element') {
                const startTag = parent.children && parent.children[0];
                if (startTag && startTag.type === 'start_tag') {
                    const tagName =
                        startTag.children && startTag.children.find((child: TSNode) => child.type === 'tag_name');
                    if (tagName) {
                        const tagText = tagName.text || '';
                        return tagText.toLowerCase() === 'script';
                    }
                }
            }
            parent = parent.parent;
        }
        return false;
    }

    private parseScriptContent(
        scriptText: string,
        startIndex: number,
        fullSourceCode: string,
        sourceLines: string[],
    ): URLMatch[] {
        try {
            const jsLanguage = this.languageManager.getLanguage('javascript');
            if (!jsLanguage) {
                return this.extractURLsFromString(scriptText, startIndex, 'string', fullSourceCode, sourceLines);
            }

            const jsParser = new Parser();
            jsParser.setLanguage(jsLanguage as Parser.Language);
            const jsTree = jsParser.parse(scriptText);

            const urls: URLMatch[] = [];
            const traverseJSNode = (node: TSNode): void => {
                const text = scriptText.slice(node.startIndex, node.endIndex);
                if (this.isStringNode(node)) {
                    const foundUrls = this.extractURLsFromString(
                        text,
                        startIndex + node.startIndex,
                        'string',
                        fullSourceCode,
                        sourceLines,
                    );
                    urls.push(...foundUrls);
                }
                if (this.isCommentNode(node)) {
                    const foundUrls = this.extractURLsFromString(
                        text,
                        startIndex + node.startIndex,
                        'comment',
                        fullSourceCode,
                        sourceLines,
                    );
                    urls.push(...foundUrls);
                }
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    if (child) {
                        traverseJSNode(child);
                    }
                }
            };

            traverseJSNode(jsTree.rootNode);
            return urls;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Failed to parse script content as JavaScript, falling back to regex: ${errorMessage}`);
            return this.extractURLsFromString(scriptText, startIndex, 'string', fullSourceCode, sourceLines);
        }
    }

    private extractURLsFromString(
        text: string,
        startIndex: number,
        sourceType: 'string' | 'comment' | 'unknown' = 'unknown',
        fullSourceCode: string = '',
        sourceLines: string[] = [],
    ): URLMatch[] {
        const urls: URLMatch[] = [];
        let match: RegExpExecArray | null;

        while ((match = this.urlPattern.exec(text)) !== null) {
            if (this.isCommonSchemaPattern(match[0])) {
                continue;
            }

            const globalStart = startIndex + match.index;
            const globalEnd = startIndex + match.index + match[0].length;
            const line = this.getLineNumber(fullSourceCode, globalStart);
            const column = this.getColumnNumber(fullSourceCode, globalStart);

            const urlObj: URLMatch = {
                url: match[0],
                start: globalStart,
                end: globalEnd,
                line: line,
                column: column,
                sourceType: sourceType,
            };

            if (this.options.context && this.options.context > 0) {
                urlObj.context = this.getContext(sourceLines, line - 1, this.options.context);
            }

            urls.push(urlObj);
        }

        this.urlPattern.lastIndex = 0;
        return urls;
    }

    private isCommonSchemaPattern(url: string): boolean {
        return this.commonSchemaPatterns.some(pattern => pattern.test(url));
    }

    private fallbackDetection(sourceCode: string): URLMatch[] {
        const urls: URLMatch[] = [];
        const sourceLines = sourceCode.split('\n');
        let match: RegExpExecArray | null;

        while ((match = this.urlPattern.exec(sourceCode)) !== null) {
            if (this.isCommonSchemaPattern(match[0])) {
                continue;
            }

            const globalStart = match.index;
            const globalEnd = match.index + match[0].length;
            const line = this.getLineNumber(sourceCode, globalStart);
            const column = this.getColumnNumber(sourceCode, globalStart);

            const urlObj: URLMatch = {
                url: match[0],
                start: globalStart,
                end: globalEnd,
                line: line,
                column: column,
                sourceType: 'unknown',
            };

            if (this.options.context && this.options.context > 0) {
                urlObj.context = this.getContext(sourceLines, line - 1, this.options.context);
            }

            urls.push(urlObj);
        }

        this.urlPattern.lastIndex = 0;
        return urls;
    }

    private getLineNumber(text: string, position: number): number {
        const beforePosition = text.substring(0, position);
        return beforePosition.split('\n').length;
    }

    private getColumnNumber(text: string, position: number): number {
        const beforePosition = text.substring(0, position);
        const lines = beforePosition.split('\n');
        return lines[lines.length - 1].length + 1;
    }

    private getContext(lines: string[], lineIndex: number, contextSize: number): string[] {
        const start = Math.max(0, lineIndex - contextSize);
        const end = Math.min(lines.length, lineIndex + contextSize + 1);
        return lines.slice(start, end);
    }
}
