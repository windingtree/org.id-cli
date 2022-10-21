/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const path = require('path');
const webpack = require('webpack');

module.exports = {
  target: 'node',
  mode: 'development',
  entry: './src/index.ts',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
                configFile: 'tsconfig-build.json'
            }
          }
        ],
        exclude: /node_modules/
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      type: 'commonjs'
    }
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: '#!/usr/bin/env -S node --no-deprecation',
      raw: true
    }),
    new webpack.ProvidePlugin({
      fetch: ['node-fetch', 'default'],
    }),
  ],
};
