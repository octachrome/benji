module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-bower-task');

    grunt.initConfig({
        bower: {
            static: {
                options: {
                    targetDir: 'bower_lib'
                }
            }
        },
        copy: {
            static: {
                files: [
                    {
                        'static/lib/jquery.js': 'node_modules/jquery/dist/jquery.min.js',
                        'static/lib/knockout.js': 'node_modules/knockout/build/output/knockout-latest.js',
                        'static/lib/lodash.js': 'node_modules/lodash/lodash.js',
                        'static/lib/long.js': 'node_modules/long/dist/long.js',
                        'static/lib/chance.js': 'node_modules/chance/chance.js',
                        'static/lib/pixi.js': 'bower_lib/pixi.js/pixi.min.js'
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
                        return content.replace(/module\.exports/g, 'ms');
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
                        expand: true,
                        cwd: '../benji-data/scripts',
                        dest: 'static/',
                        src: '*.benji'
                    }
                ]
            }
        },
        watch: {
            static: {
                files: ['js/*.js'],
                tasks: ['static'],
                options: {
                    spawn: false
                }
            }
        }
    });

    grunt.registerTask('static', ['bower:static', 'copy:static', 'copy:static_ms']);
    grunt.registerTask('site', ['static', 'copy:data']);
    grunt.registerTask('default', 'static');
};
