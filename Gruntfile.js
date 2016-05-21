module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.initConfig({
        copy: {
            lib: {
                files: {
                    'lib/jquery.js': 'node_modules/jquery/dist/jquery.min.js',
                    'lib/knockout.js': 'node_modules/knockout/build/output/knockout-latest.js',
                    'lib/lodash.js': 'node_modules/lodash/lodash.js',
                    'lib/long.js': 'node_modules/long/dist/long.js',
                    'lib/chance.js': 'node_modules/chance/chance.js',
                    'lib/pixi.js': 'node_modules/pixi.js/bin/pixi.min.js'
                }
            }
        }
    });

    grunt.registerTask('default', 'copy');
};
