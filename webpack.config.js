const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const InlineChunkHtmlPlugin = require("react-dev-utils/InlineChunkHtmlPlugin");

const IS_PRODUCTION = process.env.NODE_ENV === "production";

module.exports = {
  entry: ["./src/render/index.tsx"],
  mode: IS_PRODUCTION ? "production" : "development",
  devtool: IS_PRODUCTION ? false : "eval-cheap-module-source-map",
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
  stats: IS_PRODUCTION ? true : "minimal",
  output: {
    // usually true for 'development' build, we unconditionally turn it off for faster dev builds
    pathinfo: false,
    path: path.resolve(__dirname, "./dist"),
  },
  module: {
    rules: [
      {
        // Include ts and tsx files
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: {
              presets: [
                [
                  "@babel/preset-env",
                  {
                    targets: "firefox >= 94, chrome >= 95",
                    useBuiltIns: "usage", // only polyfill what we actually use
                    modules: false, // preserve es2015 module imports for webpack to tree shake
                    corejs: 3, // use the latest and greatest core-js features
                  },
                ],
                "@babel/preset-typescript",
                ["@babel/preset-react", { runtime: "automatic", development: !IS_PRODUCTION }],
              ],
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        use: [
          { loader: "style-loader" },
          { loader: "css-loader" },
        ],
      },
      {
        test: /\.(eot|ttf|woff|woff2|svg|png|gif|jpe?g|ico)$/,
        exclude: /\.inline\.svg$/,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      inject: true,
      template: "./index.template.html",
      templateParameters: {
        includeTestData: !IS_PRODUCTION,
      },
    }),
    ...(IS_PRODUCTION ? [new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/\.js$/])] : []),
  ],
};
