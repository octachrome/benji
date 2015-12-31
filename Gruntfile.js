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
                    'bodymovin/build/player/bodymovin.js',
                    'long/dist/long.js'
                ],
                dest: 'lib'
            }
        },
        exec: {
            ftp: {
                cmd: 'ncftpput -u chrisbro -p "<%=FTP_PWD%>" -R thebrown.net public_html/anim-test index.html lib images js anim'
            }
        }
    });

    grunt.registerTask('deploy', ['copy:lib', 'exec:ftp']);
    grunt.registerTask('default', ['copy:lib']);
};
