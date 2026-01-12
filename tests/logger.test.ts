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

import { Logger, NullLogger, ConsoleLogger, ResultsOnlyLogger } from '../src/logger';

describe('Logger', () => {
    describe('NullLogger', () => {
        test('should implement Logger interface', () => {
            expect(typeof NullLogger.log).toBe('function');
            expect(typeof NullLogger.info).toBe('function');
            expect(typeof NullLogger.warn).toBe('function');
            expect(typeof NullLogger.error).toBe('function');
            expect(typeof NullLogger.debug).toBe('function');
        });

        test('should not produce any output', () => {
            // These should not throw or produce output
            NullLogger.log('test message');
            NullLogger.info('info message');
            NullLogger.warn('warning message');
            NullLogger.error('error message');
            NullLogger.debug('debug message');
        });

        test('should handle multiple arguments', () => {
            NullLogger.log('message', 'arg1', 2, { key: 'value' });
            NullLogger.info('info', true, null);
            NullLogger.warn('warn', undefined, [1, 2, 3]);
            NullLogger.error('error', new Error('test'));
            NullLogger.debug('debug', Symbol('test'));
        });
    });

    describe('ConsoleLogger', () => {
        test('should implement Logger interface', () => {
            expect(typeof ConsoleLogger.log).toBe('function');
            expect(typeof ConsoleLogger.info).toBe('function');
            expect(typeof ConsoleLogger.warn).toBe('function');
            expect(typeof ConsoleLogger.error).toBe('function');
            expect(typeof ConsoleLogger.debug).toBe('function');
        });

        test('should be references to console methods', () => {
            expect(ConsoleLogger.log).toBe(console.log);
            expect(ConsoleLogger.info).toBe(console.info);
            expect(ConsoleLogger.warn).toBe(console.warn);
            expect(ConsoleLogger.error).toBe(console.error);
            expect(ConsoleLogger.debug).toBe(console.debug);
        });

        test('should not throw when called with various arguments', () => {
            // These should not throw errors
            expect(() => ConsoleLogger.log('test')).not.toThrow();
            expect(() => ConsoleLogger.info('info', 'with', 'args')).not.toThrow();
            expect(() => ConsoleLogger.warn('warning')).not.toThrow();
            expect(() => ConsoleLogger.error('error', new Error('test'))).not.toThrow();
            expect(() => ConsoleLogger.debug('debug', { obj: true })).not.toThrow();
        });
    });

    describe('ResultsOnlyLogger', () => {
        test('should implement Logger interface', () => {
            expect(typeof ResultsOnlyLogger.log).toBe('function');
            expect(typeof ResultsOnlyLogger.info).toBe('function');
            expect(typeof ResultsOnlyLogger.warn).toBe('function');
            expect(typeof ResultsOnlyLogger.error).toBe('function');
            expect(typeof ResultsOnlyLogger.debug).toBe('function');
        });

        test('should call console.log for results', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation();
            ResultsOnlyLogger.log('result message');
            expect(spy).toHaveBeenCalledWith('result message');
            spy.mockRestore();
        });

        test('should NOT call console for info messages', () => {
            // info method should be a no-op function
            expect(() => ResultsOnlyLogger.info('info message')).not.toThrow();
        });

        test('should NOT call console for warn messages', () => {
            // warn method should be a no-op function
            expect(() => ResultsOnlyLogger.warn('warning message')).not.toThrow();
        });

        test('should call console.error for error messages', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation();
            ResultsOnlyLogger.error('error message');
            expect(spy).toHaveBeenCalledWith('error message');
            spy.mockRestore();
        });

        test('should NOT call console for debug messages', () => {
            // debug method should be a no-op function
            expect(() => ResultsOnlyLogger.debug('debug message')).not.toThrow();
        });

        test('should pass multiple arguments to log and error', () => {
            const logSpy = jest.spyOn(console, 'log').mockImplementation();
            const errorSpy = jest.spyOn(console, 'error').mockImplementation();
            
            ResultsOnlyLogger.log('result', 'arg1', 2);
            expect(logSpy).toHaveBeenCalledWith('result', 'arg1', 2);

            ResultsOnlyLogger.error('error', 'arg1', { key: 'value' });
            expect(errorSpy).toHaveBeenCalledWith('error', 'arg1', { key: 'value' });
            
            logSpy.mockRestore();
            errorSpy.mockRestore();
        });

        test('should be silent for info, warn, and debug even with multiple args', () => {
            // These should not throw and should be no-ops
            expect(() => ResultsOnlyLogger.info('info', 'multiple', 'args')).not.toThrow();
            expect(() => ResultsOnlyLogger.warn('warn', 'multiple', 'args')).not.toThrow();
            expect(() => ResultsOnlyLogger.debug('debug', 'multiple', 'args')).not.toThrow();
        });
    });
});