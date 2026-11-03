import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.storage'] },
  js.configs.recommended, ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }], 'no-console': ['error', { allow: ['warn', 'error'] }], 'no-restricted-syntax': ['error', { selector: "CallExpression[callee.object.name='console'][callee.property.name='log']", message: 'Use o logger (pino).' }] } },
  { files: ['scripts/**', 'tests/**', 'tools/**'], rules: { 'no-console': 'off', 'no-restricted-syntax': 'off' } },
);
