const path = require('path')

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'main.js',
    },
    devServer: {
        host: 'demo2.kible.io',
        port: 80,
    },
    module: {
        rules: [
            {
                test: /\.worker\.js$/,
                use: {loader: 'worker-loader'}
            },
            {
                test: /\.(asset)$/i,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: '[contenthash].wasm'
                        }
                    },
                ],
            }
        ]
    }
}
