const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    popup: './popup.js',
    background: './background.js',
    // content: './content.js',
    // customSelect: './custom-select.js',
    // load: './load-scripts.js',
    // handlers: './add-select-handlers.js',
    // gpt4_api: './gpt4_api.js'
  },
  devtool: 'source-map',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  optimization: {
    minimize: false,
    splitChunks: {
      chunks(chunk) {
        // exclude `my-excluded-chunk`
        return false;
      }
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
};
