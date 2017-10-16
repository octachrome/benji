const child_process = require('child_process');
const fs = require('fs');
const tmp = require('tmp');

const cache = new Map();

function getKey(text, voice) {
    return text + ':' + voice;
}

function getSpeechFile(text, voice) {
    let fileInfo = cache.get(getKey(text, voice));
    if (fileInfo) {
        fileInfo.refs++;
    }
    else {
        fileInfo = {
            refs: 1,
            pathPromise: generateSpeechFile(text, voice)
        };
        cache.set(getKey(text, voice), fileInfo);
    }
    return fileInfo.pathPromise;
}

function releaseSpeechFile(text, voice) {
    if (cache.has(getKey(text, voice))) {
        const fileInfo = cache.get(getKey(text, voice));
        if (--fileInfo.refs <= 0) {
            fileInfo.pathPromise.then(path => fs.unlink(path));
            cache.delete(getKey(text, voice));
        }
    }
}

function generateSpeechFile(text, voice) {
    return new Promise((resolve, reject) => {
        tmp.tmpName({prefix: 'speech-', postfix: '.wav'}, (err, path) => {
            if (err) {
                reject(err);
            }
            else {
                child_process.execFile('flite', [
                    '-o', path,
                    '-t', text,
                    '-voice', voice
                    ], (err, stdout, stderr) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            fs.exists(path, exists => {
                                if (exists) {
                                    resolve(path);
                                }
                                else {
                                    reject(new Error(stderr));
                                }
                            });
                        }
                });
            }
        });
    });
}

module.exports = {
    getSpeechFile: getSpeechFile,
    releaseSpeechFile: releaseSpeechFile
};
