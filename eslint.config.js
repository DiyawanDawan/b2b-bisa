import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import airbnbBase from 'eslint-config-airbnb-base';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      import: importPlugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...airbnbBase.rules,
      // Dimatikan: proyek menggunakan path aliases (#config/*, #services/*, dll)
      // yang tidak bisa di-resolve oleh eslint-plugin-import → false positive.
      // TypeScript compiler sudah menjamin resolusi modul via tsconfig.json paths.
      'import/extensions': 'off',
      'no-console': 'off',
      'import/no-unresolved': 'off',
      'no-underscore-dangle': 'off',
      'class-methods-use-this': 'off',
      'import/prefer-default-export': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    // Disable typed linting for JS files (like this config file)
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: ['node_modules/', 'dist/', 'generated/', '.env', '*.md'],
  },
  prettierPlugin,
);
