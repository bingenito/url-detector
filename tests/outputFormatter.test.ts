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

import { OutputFormatter, OutputFormatterOptions } from '../src/outputFormatter';
import { FileResult } from '../src/urlDetector';
import { NullLogger, ConsoleLogger } from '../src/logger';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs
jest.mock('fs', () => ({
    promises: {
        writeFile: jest.fn(),
    },
}));

describe('OutputFormatter', () => {
    let mockLogger: any;
    let testResults: FileResult[];

    beforeEach(() => {
        mockLogger = {
            log: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        };

        testResults = [
            {
                file: '/path/to/test.js',
                urls: [
                    {
                        url: 'https://api.example.com/v1',
                        line: 5,
                        column: 10,
                        start: 15,
                        end: 40,
                        context: ['const url = "https://api.example.com/v1";'],
                        sourceType: 'string',
                    },
                    {
                        url: 'https://docs.example.com',
                        line: 8,
                        column: 5,
                        start: 50,
                        end: 75,
                        context: ['// See https://docs.example.com'],
                        sourceType: 'comment',
                    },
                ],
            },
            {
                file: '/path/to/another.py',
                urls: [
                    {
                        url: 'http://localhost:3000',
                        line: 2,
                        column: 15,
                        start: 20,
                        end: 40,
                        context: ['url = "http://localhost:3000"'],
                        sourceType: 'string',
                    },
                ],
            },
        ];
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        test('should use provided logger', () => {
            const formatter = new OutputFormatter({}, mockLogger);
            expect(formatter).toBeDefined();
        });

        test('should use NullLogger by default', () => {
            const formatter = new OutputFormatter({});
            expect(formatter).toBeDefined();
        });
    });

    describe('formatAndOutput', () => {
        test('should output to console when no output file specified', async () => {
            const formatter = new OutputFormatter({ format: 'json' }, mockLogger);
            await formatter.formatAndOutput(testResults);

            expect(mockLogger.log).toHaveBeenCalledWith(expect.stringContaining('"summary"'));
            expect(fs.promises.writeFile).not.toHaveBeenCalled();
        });

        test('should write to file when output file specified', async () => {
            const outputFile = '/tmp/output.json';
            const formatter = new OutputFormatter({ format: 'json', outputFile }, mockLogger);
            await formatter.formatAndOutput(testResults);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(outputFile, expect.stringContaining('"summary"'), 'utf8');
            expect(mockLogger.info).toHaveBeenCalledWith(`Output written to ${outputFile}`);
        });

        test('should use onlyUrls format when specified', async () => {
            const formatter = new OutputFormatter({ onlyUrls: true }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toBe(
                'https://api.example.com/v1\nhttps://docs.example.com\nhttp://localhost:3000'
            );
        });

        test('should default to table format', async () => {
            const formatter = new OutputFormatter({}, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('FilePath');
            expect(output).toContain('FileName');
            expect(output).toContain('Line:Col');
            expect(output).toContain('URL');
        });

        test('should throw error for unknown format', async () => {
            const formatter = new OutputFormatter({ format: 'unknown' as any }, mockLogger);
            await expect(formatter.formatAndOutput(testResults)).rejects.toThrow('Unknown output format: unknown');
        });
    });

    describe('formatUrlsOnly', () => {
        test('should return only URLs separated by newlines', async () => {
            const formatter = new OutputFormatter({ onlyUrls: true }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            const lines = output.split('\n');
            expect(lines).toEqual([
                'https://api.example.com/v1',
                'https://docs.example.com',
                'http://localhost:3000',
            ]);
        });

        test('should handle empty results', async () => {
            const formatter = new OutputFormatter({ onlyUrls: true }, mockLogger);
            await formatter.formatAndOutput([]);

            expect(mockLogger.log).toHaveBeenCalledWith('');
        });
    });

    describe('formatJson', () => {
        test('should create proper JSON structure', async () => {
            const formatter = new OutputFormatter({ format: 'json' }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            const json = JSON.parse(output);

            expect(json.summary).toEqual({
                totalFiles: 2,
                totalUrls: 3,
                uniqueUrls: 3,
            });

            expect(json.files).toHaveLength(2);
            expect(json.files[0].file).toBe('/path/to/test.js');
            expect(json.files[0].urlCount).toBe(2);
            expect(json.files[0].urls).toHaveLength(2);
        });

        test('should include line numbers by default', async () => {
            const formatter = new OutputFormatter({ format: 'json', withLineNumbers: true }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            const json = JSON.parse(output);

            expect(json.files[0].urls[0].line).toBe(5);
            expect(json.files[0].urls[0].column).toBe(10);
        });

        test('should exclude line numbers when withLineNumbers is false', async () => {
            const formatter = new OutputFormatter({ format: 'json', withLineNumbers: false }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            const json = JSON.parse(output);

            expect(json.files[0].urls[0].line).toBeUndefined();
            expect(json.files[0].urls[0].column).toBeUndefined();
        });
    });

    describe('formatCsv', () => {
        test('should create proper CSV format', async () => {
            const formatter = new OutputFormatter({ format: 'csv' }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            const lines = output.split('\n');

            expect(lines[0]).toBe('FilePath,FileName,LineNumber,ColumnPosition,URL');
            expect(lines[1]).toBe('/path/to/test.js,test.js,5,10,https://api.example.com/v1');
            expect(lines[2]).toBe('/path/to/test.js,test.js,8,5,https://docs.example.com');
            expect(lines[3]).toBe('/path/to/another.py,another.py,2,15,http://localhost:3000');
        });

        test('should escape CSV values with commas', async () => {
            const resultsWithCommas: FileResult[] = [
                {
                    file: '/path/with,comma/test.js',
                    urls: [
                        {
                            url: 'https://example.com/path,with,commas',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            const formatter = new OutputFormatter({ format: 'csv' }, mockLogger);
            await formatter.formatAndOutput(resultsWithCommas);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('"/path/with,comma/test.js"');
            expect(output).toContain('"https://example.com/path,with,commas"');
        });

        test('should escape CSV values with quotes', async () => {
            const resultsWithQuotes: FileResult[] = [
                {
                    file: '/path/with"quote/test.js',
                    urls: [
                        {
                            url: 'https://example.com/path"with"quotes',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            const formatter = new OutputFormatter({ format: 'csv' }, mockLogger);
            await formatter.formatAndOutput(resultsWithQuotes);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('"/path/with""quote/test.js"');
            expect(output).toContain('"https://example.com/path""with""quotes"');
        });
    });

    describe('formatTable', () => {
        test('should create table output', async () => {
            const formatter = new OutputFormatter({ format: 'table' }, mockLogger);
            await formatter.formatAndOutput(testResults);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('FilePath');
            expect(output).toContain('FileName');
            expect(output).toContain('Line:Col');
            expect(output).toContain('URL');
            expect(output).toContain('test.js');
            expect(output).toContain('5:10');
            expect(output).toContain('https://api.example.com/v1');
        });

        test('should handle empty results', async () => {
            const formatter = new OutputFormatter({ format: 'table' }, mockLogger);
            await formatter.formatAndOutput([]);

            expect(mockLogger.log).toHaveBeenCalledWith('No URLs found.');
        });

        test('should truncate long values', async () => {
            const longResults: FileResult[] = [
                {
                    file: '/very/long/path/to/a/file/that/exceeds/the/normal/length/limits/test.js',
                    urls: [
                        {
                            url: 'https://very-long-url.example.com/with/many/path/segments/that/exceed/normal/limits',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            const formatter = new OutputFormatter({ format: 'table' }, mockLogger);
            await formatter.formatAndOutput(longResults);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('...');
        });
    });

    describe('private methods', () => {
        test('should get unique URLs', async () => {
            const duplicateResults: FileResult[] = [
                {
                    file: '/path/to/test1.js',
                    urls: [
                        {
                            url: 'https://example.com',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                        {
                            url: 'https://example.com',
                            line: 2,
                            column: 1,
                            start: 20,
                            end: 30,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
                {
                    file: '/path/to/test2.js',
                    urls: [
                        {
                            url: 'https://other.com',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            const formatter = new OutputFormatter({ format: 'json' }, mockLogger);
            await formatter.formatAndOutput(duplicateResults);

            const output = mockLogger.log.mock.calls[0][0];
            const json = JSON.parse(output);

            expect(json.summary.totalUrls).toBe(3);
            expect(json.summary.uniqueUrls).toBe(2);
        });

        test('should escape CSV values correctly', async () => {
            const csvTestResults: FileResult[] = [
                {
                    file: 'normal.js',
                    urls: [
                        {
                            url: 'https://normal.com',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            const formatter = new OutputFormatter({ format: 'csv' }, mockLogger);
            await formatter.formatAndOutput(csvTestResults);

            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('normal.js');
            expect(output).toContain('https://normal.com');
        });

        test('should truncate strings correctly', async () => {
            const formatter = new OutputFormatter({ format: 'table' }, mockLogger);
            
            // Use a short filename to test truncation logic
            const shortResults: FileResult[] = [
                {
                    file: 'short.js',
                    urls: [
                        {
                            url: 'https://short.com',
                            line: 1,
                            column: 1,
                            start: 0,
                            end: 10,
                            context: [],
                            sourceType: 'string',
                        },
                    ],
                },
            ];

            await formatter.formatAndOutput(shortResults);
            const output = mockLogger.log.mock.calls[0][0];
            expect(output).toContain('short.js');
        });
    });

    describe('error handling', () => {
        test('should handle file write errors', async () => {
            const writeError = new Error('Permission denied');
            (fs.promises.writeFile as jest.Mock).mockRejectedValueOnce(writeError);

            const formatter = new OutputFormatter({ format: 'json', outputFile: '/tmp/test.json' }, mockLogger);
            
            await expect(formatter.formatAndOutput(testResults)).rejects.toThrow('Permission denied');
        });
    });
});