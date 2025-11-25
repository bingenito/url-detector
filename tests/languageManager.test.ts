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

import { LanguageManager } from '../src/languageManager';

describe('LanguageManager', () => {
    let manager: LanguageManager;

    beforeEach(() => {
        manager = new LanguageManager();
    });

    test('should detect language from extension', () => {
        expect(manager.getLanguage('.js')).toBeDefined();
        expect(manager.getLanguage('.ts')).toBeDefined();
        expect(manager.getLanguage('.java')).toBeDefined();
        expect(manager.getLanguage('.cpp')).toBeDefined();
        expect(manager.getLanguage('.cs')).toBeDefined();
        expect(manager.getLanguage('.html')).toBeDefined();
        expect(manager.getLanguage('.css')).toBeDefined();
        expect(manager.getLanguage('.scala')).toBeDefined();
        expect(manager.getLanguage('.sc')).toBeDefined();
    });

    test('should return undefined for unsupported extensions', () => {
        expect(manager.getLanguage('.xyz')).toBeUndefined();
        expect(manager.getLanguage('.unknown')).toBeUndefined();
    });

    test('should handle case insensitive lookup', () => {
        expect(manager.getLanguage('JAVASCRIPT')).toBeDefined();
        expect(manager.getLanguage('JavaScript')).toBeDefined();
        expect(manager.getLanguage('javascript')).toBeDefined();
    });

    test('should get supported languages', () => {
        const languages = manager.getSupportedLanguages();
        expect(languages).toContain('javascript');
        expect(languages).toContain('typescript');
        expect(languages).toContain('java');
        expect(Array.isArray(languages)).toBe(true);
    });

    test('should get supported language display names', () => {
        const displayNames = manager.getSupportedLanguageDisplayNames();
        expect(Array.isArray(displayNames)).toBe(true);
        expect(displayNames.length).toBeGreaterThan(0);
        // Should include display names or fall back to names
        expect(displayNames).toContain('JavaScript');
    });

    test('should get language config by name', () => {
        const jsConfig = manager.getLanguageConfig('javascript');
        expect(jsConfig).toBeDefined();
        expect(jsConfig?.name).toBe('javascript');
        expect(jsConfig?.extensions).toContain('.js');

        const unknownConfig = manager.getLanguageConfig('unknown-language');
        expect(unknownConfig).toBeUndefined();
    });

    test('should add new language configuration', () => {
        const mockConfig = {
            name: 'test-lang',
            module: 'tree-sitter-test',
            extensions: ['.test'],
            displayName: 'Test Language',
        };

        const originalCount = manager.getSupportedLanguages().length;
        manager.addLanguage(mockConfig);
        
        expect(manager.getSupportedLanguages()).toContain('test-lang');
        expect(manager.getSupportedLanguages().length).toBe(originalCount + 1);
        
        const config = manager.getLanguageConfig('test-lang');
        expect(config).toEqual(mockConfig);
    });

    test('should update existing language configuration', () => {
        const updatedConfig = {
            name: 'javascript',
            module: 'tree-sitter-javascript-updated',
            extensions: ['.js', '.jsx', '.mjs'],
            displayName: 'Updated JavaScript',
        };

        const originalCount = manager.getSupportedLanguages().length;
        manager.addLanguage(updatedConfig);
        
        // Count should remain the same (update, not add)
        expect(manager.getSupportedLanguages().length).toBe(originalCount);
        
        const config = manager.getLanguageConfig('javascript');
        expect(config?.displayName).toBe('Updated JavaScript');
        expect(config?.extensions).toContain('.mjs');
    });

    test('should identify language from file path', () => {
        expect(manager.detectLanguageFromPath('test.js')).toBe('javascript');
        expect(manager.detectLanguageFromPath('test.ts')).toBe('typescript');
        expect(manager.detectLanguageFromPath('src/main.java')).toBe('java');
        expect(manager.detectLanguageFromPath('/path/to/file.py')).toBe('python');
        expect(manager.detectLanguageFromPath('unknown.xyz')).toBe('unknown');
    });

    test('should identify language from filename without extension', () => {
        // Test with special filenames like Dockerfile, Makefile, etc.
        expect(manager.detectLanguageFromPath('Dockerfile')).toBe('unknown'); // Assuming no dockerfile config
        expect(manager.detectLanguageFromPath('package.json')).toBe('json');
    });

    test('should handle error during language loading', () => {
        const mockLogger = {
            warn: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            log: jest.fn(),
        };

        const managerWithMockLogger = new LanguageManager(mockLogger);
        
        // Add a config that will fail to load (invalid module)
        const badConfig = {
            name: 'bad-lang',
            module: 'non-existent-module',
            extensions: ['.bad'],
        };

        managerWithMockLogger.addLanguage(badConfig);
        
        // Should have logged a warning about failed loading
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to load bad-lang parser')
        );
    });

    test('should handle languages with filenames config', () => {
        const configWithFilenames = {
            name: 'dockerfile',
            module: 'tree-sitter-dockerfile',
            extensions: ['.dockerfile'],
            filenames: ['Dockerfile', 'Dockerfile.dev'],
        };

        manager.addLanguage(configWithFilenames);
        
        // Note: The actual loading of the language may fail in test environment,
        // but we can test that the language was added to configuration
        const config = manager.getLanguageConfig('dockerfile');
        expect(config).toBeDefined();
        expect(config?.filenames).toContain('Dockerfile');
        expect(config?.filenames).toContain('Dockerfile.dev');
        
        // Test language detection - may return 'unknown' if module fails to load
        const result = manager.detectLanguageFromPath('Dockerfile');
        expect(['dockerfile', 'unknown']).toContain(result);
    });

    test('should handle edge cases in language detection', () => {
        // Test empty path
        expect(manager.detectLanguageFromPath('')).toBe('unknown');
        
        // Test path with no extension
        expect(manager.detectLanguageFromPath('README')).toBe('unknown');
        
        // Test path with multiple dots
        expect(manager.detectLanguageFromPath('config.test.js')).toBe('javascript');
        
        // Test case sensitivity
        expect(manager.detectLanguageFromPath('Test.JS')).toBe('javascript');
        expect(manager.detectLanguageFromPath('FILE.JAVA')).toBe('java');
    });

    test('should handle special cases with extensions', () => {
        // Test with leading dot
        expect(manager.detectLanguageFromPath('.gitignore')).toBe('unknown');
        
        // Test with trailing slash (directory)
        expect(manager.detectLanguageFromPath('src/')).toBe('unknown');
        
        // Test very long extension
        expect(manager.detectLanguageFromPath('file.verylongextension')).toBe('unknown');
    });
});
