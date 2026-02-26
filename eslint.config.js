import js from '@eslint/js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            'simple-import-sort': simpleImportSort,
        },
        rules: {
            curly: 'error',
            'simple-import-sort/imports': [
                'error',
                {
                    groups: [
                        // React и экосистема:
                        //   import React from 'react'
                        //   import ReactDOM from 'react-dom'
                        //   import { createStore } from 'redux'
                        //   import { configureStore } from '@reduxjs/toolkit'
                        ['^react', '^react-', '^redux', '^redux-', '^@reduxjs/'],

                        // Внешние пакеты (npm-модули):
                        //   import lodash from 'lodash'
                        //   import axios from 'axios'
                        //   import Button from '@mui/Button'
                        ['^@?\\w'],

                        // Внутренние алиасы и абсолютные пути:
                        //   import { utils } from '@/utils'
                        //   import Header from 'components/Header'
                        ['^@', '^'],

                        // Относительные импорты (избегайте этого, используйте алиасы: '@/src/config' или 'src/config'):
                        //   import config from './config'
                        //   import styles from './styles.less'
                        //   import { helper } from '../utils'
                        ['^\\./'],

                        // Сторонние импорты с побочными эффектами:
                        //   import 'polyfills' (без присваивания)
                        ['^\\u0000'],
                    ],
                },
            ],
            'simple-import-sort/exports': 'off',
        },
    },
    {
        ignores: ['build/**', 'dist/**', 'tools/**', '**/*.cjs', 'package-lock.json'],
    }
);
