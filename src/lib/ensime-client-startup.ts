import fs = require('fs');
import path = require('path');
import loglevel = require('loglevel');
import chokidar = require('chokidar');
import {DotEnsime, ServerStarter} from './types';
import * as Promise from 'bluebird';
import {ensureExists} from './file-utils'

const log = loglevel.getLogger('ensime.startup');
import {createConnection, ServerConnection} from './server-api/server-connection';

function removeTrailingNewline(str: string) {
  return str.replace(/^\s+|\s+$/g, '');
} 
  
//  Start an ensime client given path to .ensime. If server already running, just use, else startup that too.
export default function(serverStarter: ServerStarter) {
  log.debug('creating client starter function from ServerStarter')
  return function(parsedDotEnsime: DotEnsime, generalHandler: (msg: string) => any) : PromiseLike<ServerConnection> {

    log.debug('trying to start client')
    return new Promise<ServerConnection>((resolve, reject) => {

      ensureExists(parsedDotEnsime.cacheDir).then(() => {

        const httpPortFilePath = parsedDotEnsime.cacheDir + path.sep + "http";

        if(fs.existsSync(httpPortFilePath)) {
          // server running, no need to start
          log.debug("port file already there, starting client");
          const httpPort = removeTrailingNewline(fs.readFileSync(httpPortFilePath).toString())
          const connectionPromise = createConnection(httpPort, generalHandler)
          connectionPromise.then((connection) => {
            log.debug("got a connection")
            resolve(connection);
          });
        } else {
          let serverPid = undefined
          
          function whenAdded(file: string) {
            return new Promise((resolve, reject) => {
              log.debug('starting watching for : '+file)
            
              const watcher = chokidar.watch(file, {
                persistent: true
              }).on('all', (event, path) => {
                log.debug('Seen: ', path);
                watcher.close();
                resolve();
              });

              log.debug("watching…")
            });
          }

          whenAdded(httpPortFilePath).then( () => {
            log.debug("got a port file");
            const httpPort = removeTrailingNewline(fs.readFileSync(httpPortFilePath).toString());
            const connectionPromise = createConnection(httpPort, generalHandler, serverPid)
            connectionPromise.then((connection) => {
              log.debug("got a connection");
              resolve(connection);
            });
          });

          log.debug('no server running, start that first…')
          serverStarter(parsedDotEnsime).then((pid) => serverPid = pid)
        }

      }, (failToCreateCacheDir) => {
        reject(failToCreateCacheDir)
      });
    }); 
  };
};

