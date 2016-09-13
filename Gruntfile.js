module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-contrib-copy');

    grunt.initConfig({
        copy: {
            static: {
                files: [
                    {
                        'static/lib/jquery.js': 'node_modules/jquery/dist/jquery.min.js',
                        'static/lib/knockout.js': 'node_modules/knockout/build/output/knockout-latest.js',
                        'static/lib/lodash.js': 'node_modules/lodash/lodash.js',
                        'static/lib/long.js': 'node_modules/long/dist/long.js',
                        'static/lib/chance.js': 'node_modules/chance/chance.js',
                        'static/lib/pixi.js': 'node_modules/pixi.js/bin/pixi.min.js',
                    },
                    {
                        expand: true,
                        dest: 'static/',
                        src: ['lib/**', 'js/**']
                    },
                    {
                        expand: true,
                        cwd: 'www',
                        dest: 'static/',
                        src: '**'
                    }
                ]
            },
            static_ms: {
                options: {
                    process: function (content) {
                        return content.replace(/module\.exports/g, 'window.ms');
                    }
                },
                files: {
                    'static/lib/ms.js': 'node_modules/ms/index.js'
                }
            },
            data: {
                files: [
                    {
                        expand: true,
                        cwd: '../benji-data',
                        dest: 'static/',
                        src: 'anim/**'
                    },
                    {
                        'static/script.benji': '../benji-data/scripts/test.benji'
                    }
                ]
            }
        }
    });

    grunt.registerTask('static', ['copy:static', 'copy:static_ms']);
    grunt.registerTask('site', ['static', 'copy:data']);
    grunt.registerTask('default', 'static');
};
