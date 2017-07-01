'use strict';

const env = require('node-env-file');
const config = env(__dirname + '/.env');

//----------------------------------------
const Promise = require('bluebird');
const _ = require('lodash');
const mkdirp = Promise.promisify(require('mkdirp'));
const writeFile = Promise.promisify(require('fs').writeFile);
const Withings = require('withings-lib');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const exec = require('child_process').exec;

class WithingsClient {
  
  constructor(config) {
    this.config = _.assign({}, config, {
      CREDENTIAL_PATH: './tmp/credential.json'
    });
  }
  
  async prepare() {
    
    const accessToken = await this.saveAccessTokenIfNotExist();

    return new Promise((resolve, reject) => {
      
      var options = {
        consumerKey: this.config.CONSUMER_KEY,
        consumerSecret: this.config.CONSUMER_SECRET,
        accessToken: accessToken.token,
        accessTokenSecret: accessToken.secret,
        userID: accessToken.userid
      };
      var client = new Withings(options);

      client.getDailySteps(new Date(), function(err, data) {
        console.log(err, data);
      });
      
    })
    
  }
  
  saveAccessTokenIfNotExist() {
    
    return Promise.resolve()
      
      .then(() => {
        return require(this.config.CREDENTIAL_PATH)
      })
    
      .catch(() => {
      
        return Promise.resolve()
          
          .then(() => {
            return mkdirp(path.dirname(this.config.CREDENTIAL_PATH));
          })
        
          .then(() => {
            return this.getRequestToken().then((token) => {

              console.log('Go ' + token.authorizeUrl);
              let cmd = 'open -a "Google Chrome" "' + token.authorizeUrl + '"';
              exec(cmd);

              var app = express();
              app.use(cookieParser());
              app.listen(this.config.SERVER_PORT);

              return new Promise((resolve, reject) => {
                app.get('/oauth_callback', (req, res) => {
                  var verifier = req.query.oauth_verifier;
                  var options = {
                    consumerKey: this.config.CONSUMER_KEY,
                    consumerSecret: this.config.CONSUMER_SECRET,
                    callbackUrl: this.config.CALLBACK_URL,
                    userID: req.query.userid
                  };
                  var client = new Withings(options);

                  // Request an access token
                  client.getAccessToken(token.token, token.secret, verifier, (err, token, secret) => {
                    if (err) return reject(err);
                    resolve({
                      token: token,
                      secret: secret,
                      userid: req.query.userid
                    })
                  });

                });
              });

            });
          })
          .then((accessToken) => {
            return writeFile(this.config.CREDENTIAL_PATH, JSON.stringify(accessToken));
          })
      });
  }
  getRequestToken() {
    var options = {
      consumerKey: this.config.CONSUMER_KEY,
      consumerSecret: this.config.CONSUMER_SECRET,
      callbackUrl: this.config.CALLBACK_URL
    };
    var client = new Withings(options);

    return new Promise((resolve, reject) => {
      client.getRequestToken(function (err, token, tokenSecret) {
        if (err) return reject(err);
        resolve({
          token: token,
          secret: tokenSecret,
          authorizeUrl: client.authorizeUrl(token, tokenSecret)
        });
      });
    })
  }
  
}

const w = new WithingsClient(config);
w.prepare().then((res) => {
  console.log(res);
})
  .catch((err) => {
    console.error(err, err.stack);
  })
