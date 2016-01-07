module.exports = function (grunt) {
    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-exec');

    grunt.initConfig({
        FTP_PWD: process.env.FTP_PWD,

        copy: {
            lib: {
                expand: true,
                flatten: true,
                cwd: 'node_modules',
                src: [
                    'jquery/dist/jquery.js',
                    'knockout/build/output/knockout-latest.js',
                    'bodymovin/build/player/bodymovin.js',
                    'long/dist/long.js',
                    'chance/chance.js'
                ],
                dest: 'lib'
            }
        },
        exec: {
            ftp: {
                cmd: 'ncftpput -u chrisbro -p "<%=FTP_PWD%>" -R thebrown.net public_html/benji index.html lib images js anim'
            }
        }
    });

    grunt.registerTask('deploy', ['copy:lib', 'exec:ftp']);
    grunt.registerTask('default', ['copy:lib']);
};
