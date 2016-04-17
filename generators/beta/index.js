'use strict';
const fs = require('fs');
const path = require('path');
const url = require('url');
const yeoman = require('yeoman-generator');
const inquirer = require('inquirer');
const chalk = require('chalk');
const yosay = require('yosay');
const changeCase = require('change-case');
const rc = require('rc');
const extend = require('extend');

const simpleGit = require('simple-git');

// const GitHubApi = require('github');

// const github = new GitHubApi({
//   version: "3.0.0",
//   protocol: "https",
//   host: "api.github.com",
//   timeout: 5000,
//   header: {
//     "user-agent": "generator-typings"
//   }
// });

const collectingSourceInfo = [];
const collectingLocalInfo = [];

const TEMPLATEVERSION = 0;
const globalConfigPath = path.join(process.env.HOME, '.generator-typingsrc');


module.exports = yeoman.Base.extend({
  constructor: function () {
    yeoman.Base.apply(this, arguments);
    this.option('skipPrompt', { hide: true });
    this.option('updateTemplate', { desc: 'Update template.' });
    this.props = {};
    this.updateConfigTemplate = function () {
      const questions = [
        {
          type: 'input',
          name: 'username',
          message: `Your username on GitHub`,
          default: this.configTemplate.username,
        },
        {
          type: 'input',
          name: 'repositoryOrganization',
          message: (props) => `https://github.com/${chalk.green('<organization>')}/${this.configTemplate.repositoryNamePrefix}*`,
          default: (props) => this.configTemplate.repositoryOrganization || props.username,
        },
        {
          type: 'input',
          name: 'repositoryNamePrefix',
          message: (props) => {
            return `https://github.com/${props.repositoryOrganization}/${chalk.green(this.configTemplate.repositoryNamePrefix)}*`
          },
          default: this.configTemplate.repositoryNamePrefix,
        },
        {
          type: 'list',
          name: 'testFrameworkInNode',
          message: `Testing framework in node`,
          choices: ['blue-tape'],
          default: this.configTemplate.testFrameworkInNode,
        },
        {
          type: 'list',
          name: 'testFrameworkInBrowser',
          message: `Testing framework in browser`,
          choices: ['blue-tape'],
          default: this.configTemplate.testFrameworkInBrowser,
        },
        {
          type: 'list',
          name: 'license',
          message: `Which license do you want to use?`,
          choices: [
            { name: 'Apache 2.0', value: 'Apache-2.0' },
            { name: 'MIT', value: 'MIT' },
            { name: 'Unlicense', value: 'unlicense' },
            { name: 'FreeBSD', value: 'BSD-2-Clause-FreeBSD' },
            { name: 'NewBSD', value: 'BSD-3-Clause' },
            { name: 'Internet Systems Consortium (ISC)', value: 'ISC' },
            { name: 'No License (Copyrighted)', value: 'nolicense' }
          ],
          default: this.configTemplate.license,
        },
        {
          type: 'input',
          name: 'licenseSignature',
          message: `Your signature in the license: Copyright (c) ${new Date().getFullYear()} ${chalk.green('<signature>')}`,
          default: (props) => this.configTemplate.licenseSignature || props.username,
        },
      ];

      const done = this.async();
      this.prompt(questions, (props) => {
        props.version = TEMPLATEVERSION;
        this.configTemplate = props;
        this.configTemplate.default = false;
        fs.writeFileSync(globalConfigPath, JSON.stringify(this.configTemplate));
        this.log('Got it! The template is saved.')
        done();
      });
    };
    this.applyConfigTemplate = function () {
      this.props.username = this.configTemplate.username;
      this.props.repositoryName = this.props.repositoryName || this.configTemplate.repositoryNamePrefix + this.props.sourceDeliveryPackageName;
      this.props.repositoryOrganization = this.props.repositoryOrganization || this.configTemplate.repositoryOrganization;
      this.props.repositoryRemoteUrl = this.props.repositoryRemoteUrl || `https://github.com/${this.props.repositoryOrganization}/${this.props.repositoryName}.git`;

      this.props.license = this.configTemplate.license;
      this.props.licenseSignature = this.configTemplate.licenseSignature;

      if (~this.props.sourcePlatforms.indexOf('node')) {
        this.props.testFrameworkInNode = this.configTemplate.testFrameworkInNode;
      }

      if (~this.props.sourcePlatforms.indexOf('browser')) {
        this.props.testFrameworkInBrowser = this.configTemplate.testFrameworkInBrowser;
      }
    };

    this.readGitConfig = function readGitConfig(name) {
      return new Promise((resolve, reject) => {
        var result;
        const child = this.spawnCommand('git', ['config', name], { stdio: [0, 'pipe'] });
        child.on('close', (code) => {
          resolve(result);
        });

        child.stdout.on('data', (data) => {
          result = data.toString().trim();
        });
      });
    };

    this.loadGitConfig = function loadGitConfig(repositoryPath) {
      return Promise.all([
        new Promise((resolve, reject) => {
          repositoryPath = path.resolve(repositoryPath);
          var result = {
            repositoryName: path.basename(repositoryPath),
            repositoryOrganization: path.basename(path.join(repositoryPath, '..'))
          };

          if (fs.existsSync(path.join(repositoryPath, '.git'))) {
            var git = simpleGit(repositoryPath);
            result.git = git;
            git.getRemotes(true, (err, out) => {
              const origins = out.filter((entry) => {
                return entry.name === 'origin';
              });

              if (origins.length === 1) {
                result.repositoryRemoteUrl = origins[0].refs.fetch;
                const u = url.parse(result.repositoryRemoteUrl);

                const parts = u.pathname.substring(1).split('/', 2);
                result.repositoryName = parts[1].substr(0, parts[1].length - 4);
                result.repositoryOrganization = parts[0];
              }

              resolve(result);
            });
          }
          else {
            resolve(result);
          }
        }),
        this.readGitConfig('user.username'),
        this.readGitConfig('user.name'),
        this.readGitConfig('user.email'),
      ]).then((results) => {
        var result = results[0];
        result.username = results[1];
        result.name = results[2];
        result.email = results[3];
        return result;
      });
    };
  },
  initializing: {
    loadRepo() {
      collectingLocalInfo.push(
        this.loadGitConfig('.').then((value) => {
          extend(this.props, value);
        })
      );
    }
  },
  prompting: {
    betaGreeting() {
      this.log('Welcome to the beta! Let me know if my questions make sense to you.');
      this.log('Now, let\'s get started...');
      this.log('');
    },
    greeting() {
      this.log(yosay(`Welcome to the sensational ${chalk.yellow('typings')} generator!`));
    },
    waitForLocalInfo() {
      const done = this.async();
      Promise.all(collectingLocalInfo).then(
        () => done(),
        (err) => {
          this.log(err);
          process.exit(1);
        });
    },
    loadConfigTemplate() {
      // Missing `version` indicate it is the default config.
      const defaultConfigTemplate = {
        username: this.props.username,
        repositoryNamePrefix: 'typed-',
        repositoryOrganization: undefined,
        license: 'MIT',
        testFrameworkInNode: 'blue-tape',
        testFrameworkInBrowser: 'blue-tape'
      };

      this.configTemplate = rc('generator-typings', defaultConfigTemplate);

      if (this.options.updateTemplate) {
        this.updateConfigTemplate();
      }
      else if (typeof this.configTemplate.version === 'undefined') {
        if (this.options.skipPrompt) return;

        this.log('Seems like this is the first time you use this generator.');
        this.log('Let\'s quickly setup the template...');

        this.updateConfigTemplate();
      }
      else if (this.configTemplate.version !== TEMPLATEVERSION) {
        if (this.options.skipPrompt) return;

        this.log('Seems like you updated this generator. The template has changed.');
        this.log('Let\'s quickly update the template...');

        this.updateConfigTemplate();
      }
    },
    enterSourceSection() {
      this.log('');
      this.log(`To begin, I need to know a little bit about the ${chalk.green('source')} you are typings for.`);
    },
    askDelivery() {
      if (this.options.skipPrompt) return;

      const questions = [
        {
          type: 'list',
          name: 'sourceDeliveryType',
          message: `Where can I get it ${chalk.green('from')}?`,
          choices: [
            { name: 'Bower', value: 'bower' },
            { name: 'CDN or http(s)', value: 'http' },
            // { name: 'Duo', value: 'duo', disabled: 'coming not so soon...' },
            // { name: 'Jam', value: 'jam', disabled: 'coming not so soon...' },
            // { name: 'JSPM', value: 'jspm', disabled: 'coming not so soon...' },
            { name: 'NPM', value: 'npm' },
            // { name: 'volo', value: 'volo', disabled: 'coming not so soon...' },
            { name: 'cannot be downloaded', value: 'none' },
          ],
          default: 'npm'
        },
        {
          type: 'input',
          name: 'sourceDeliveryPackageName',
          message: (props) => {
            switch (props.sourceDeliveryType) {
              case 'http':
              case 'none':
                return `What is the ${chalk.green('name')} of the package?`;
              default:
                return `${chalk.cyan(props.sourceDeliveryType)} install ${chalk.green('<package name>')}?`;
            }
          },
          validate: (value) => value.length > 0,
        },
        {
          type: 'input',
          name: 'sourceDeliveryPackageUrl',
          message: `What is the ${chalk.green('url')} of the package?`,
          validate: (value) => value.length > 0,
          when: (props) => props.sourceDeliveryType === 'http',
        },
      ];

      const done = this.async();
      this.prompt(questions, (props) => {
        extend(this.props, props);
        done();
      });
    },
    getInfoFromDelivery() {
      if (this.options.skipPrompt) return;

      if (this.props.sourceDeliveryType !== 'none') {
        this.log(`gathering info from ${chalk.cyan(this.props.sourceDeliveryType)}...`);
      }

      switch (this.props.sourceDeliveryType) {
        case 'http':
        case 'none':
          this.props.sourceMain = 'index';

          const done = this.async();
          this.prompt([
            {
              type: 'input',
              name: 'sourceVersion',
              message: `What is the ${chalk.green('version')} of the package?`,
              validate: (value) => value.length > 0,
              when: (props) => ['http', 'none'].indexOf(props.type) !== -1,
            },
            {
              type: 'input',
              name: 'sourceHomepage',
              message: `Enter the ${chalk.green('homepage')} of the package (if any)`,
            },
          ], (props) => {
            this.props.sourceVersion = props.sourceVersion;
            this.props.sourceHomepage = props.sourceHomepage;
            done();
          });
          break;
        case 'bower':
          collectingSourceInfo.push(new Promise((resolve, reject) => {
            const child = this.spawnCommand('bower', ['info', this.props.sourceDeliveryPackageName, '--json'], { stdio: [0, 'pipe'] });
            child.on('close', (code) => {
              if (code !== 0) {
                reject(`${chalk.red('Oops')}, could not find ${chalk.cyan(this.props.sourceDeliveryPackageName)}.`);
              }
            });

            child.stderr.on('data', (data) => {
              try {
                const result = JSON.parse(data.toString());
                if (result.id === 'validate') {
                  this.props.sourceRepository = result.data.pkgMeta._source;
                }
              }
              catch (err) { }
            });
            child.stdout.on('data', (data) => {
              const result = JSON.parse(data.toString());
              this.props.sourceMain = result.latest.main ? path.parse(result.latest.main).name : 'index';
              this.props.sourceVersion = result.latest.version;
              this.props.sourceHomepage = result.latest.homepage;
              resolve();
            });
          }));
          break;
        case 'npm':
          collectingSourceInfo.push(new Promise((resolve, reject) => {
            const child = this.spawnCommand('npm', ['info', this.props.sourceDeliveryPackageName, '--json'], { stdio: [0, 'pipe'] });
            child.on('close', (code) => {
              if (code !== 0) {
                reject(`${chalk.red('Oops')}, could not find ${chalk.cyan(this.props.sourceDeliveryPackageName)}.`);
              }
            });

            child.stdout.on('data', (data) => {
              const pjson = JSON.parse(data.toString());
              this.props.sourceMain = path.parse(pjson.main).name;
              this.props.sourceVersion = pjson.version;
              this.props.sourceHomepage = pjson.homepage;
              this.props.sourceRepository = pjson.repository && pjson.repository.url ?
                pjson.repository.url : pjson.repository;
              resolve();
            });
          }));
          break;
      }
    },
    askUsage() {
      if (this.options.skipPrompt) return;

      const done = this.async();
      this.prompt(
        {
          type: 'checkbox',
          name: 'sourceUsages',
          message: `${chalk.green('How')} can the package be used?`,
          choices: [
            { name: 'AMD Module', value: 'amd' },
            { name: 'CommonJS Module', value: 'commonjs', checked: true },
            { name: 'ES2015 Module', value: 'esm' },
            { name: 'Script Tag', value: 'script' },
            { name: 'part of environment', value: 'env' }
          ],
          validate: (values) => values.length > 0,
        },
        (props) => {
          this.props.sourceUsages = props.sourceUsages;
          done();
        });
    },
    askPlatform() {
      if (this.options.skipPrompt) return;

      const done = this.async();
      this.prompt(
        {
          type: 'checkbox',
          name: 'sourcePlatforms',
          message: `${chalk.green('Where')} can the package be used?`,
          choices: [
            { name: 'Browser', value: 'browser' },
            { name: 'Native NodeJS', value: 'node', checked: true },
            { name: 'others (e.g. atom)', value: 'others' },
          ],
          validate: (values) => values.length > 0,
        },
        (props) => {
          this.props.sourcePlatforms = props.sourcePlatforms;
          done();
        });
    },
    askTestHarness() {
      // Source-test is still in early stage. No automation.
    },
    enterTypingsSection() {
      this.log('');
      this.log(`Good, now about the ${chalk.yellow('typings')} itself...`);
    },
    confirmExistingRepository() {
      if (this.props.git) {
        const done = this.async();
        this.prompt([
          {
            type: 'confirm',
            name: 'useExistingRepository',
            message: 'I notice you are in a git repository. Is this the typings repository you created?',
            default: true
          },
        ], (props) => {
          extend(this.props, props);
          done();
        });
      }
    },
    askRepositoryInfo() {
        const done = this.async();
        this.prompt([
          {
            type: 'input',
            name: 'repositoryOrganization',
            message: `https://github.com/${chalk.green('<organization>')}/...`,
            default: () => this.props.useExistingRepository ?
              this.props.repositoryOrganization :
              this.configTemplate.repositoryOrganization,
            validate: (value) => value.length > 0
          },
          {
            type: 'input',
            name: 'repositoryName',
            message: (props) => `https://github.com/${chalk.cyan(props.repositoryOrganization)}/${chalk.green('<name>')}`,
            default: () => this.props.useExistingRepository ?
              this.props.repositoryName :
              this.configTemplate.repositoryNamePrefix + this.props.sourceDeliveryPackageName,
            validate: (value) => value.length > 0
          },
        ], (props) => {
          extend(this.props, props);
          if (!this.props.repositoryRemoteUrl) {
            this.props.repositoryRemoteUrlToAdd = `https://github.com/${props.repositoryOrganization}/${props.repositoryName}.git`;
          }
          done();
        });
    },
    // askTemplateInfo() {
    //   this.configTemplate = this.config.get('configTemplate');
    //   this.isFirstTime = !this.configTemplate;
    //   if (isFirstTime) {
    //     this.log('Seems like this is the first time you use this generator.');
    //     this.log('Let\'s quickly setup the template...');

    //     this.configTemplate = {
    //       repository: {
    //         namePrefix: 'typed-',
    //         organization: 'typed-typings',
    //         hosting: 'github'
    //       },
    //       license: {
    //         type: 'MIT',
    //         username: undefined,
    //         fullName: undefined,
    //         email: undefined,
    //         homepage: undefined,
    //       },
    //       testing: {
    //         node: 'blue-tape',
    //         browser: 'blue-tape',
    //         browserRunner: 'tape-run'
    //       },
    //       auth: {
    //         username: undefined,
    //       }
    //     };

    //     updateConfigTemplate();
    //   }

    //   applyConfigTemplate();

    //   // print config;

    //   this.prompt([
    //     {
    //       type: 'confirm',
    //       name: 'noChange',
    //       message: `Do you want to make any changes?`,
    //       default: false
    //     }
    //   ]);
    // },
    // askSource() {
    //   const hostQuestions = [
    //     {
    //       type: 'input',
    //       name: 'author',
    //       message: (props) => {
    //         switch (props.host) {
    //           case 'github':
    //             return `http://github.com/${chalk.green('<author>')}/repository?`;
    //           case 'private':
    //             return `Who is the ${chalk.green('author')}?`;
    //         }
    //       },
    //       validate: (value) => value.length > 0,
    //     },
    //   ];

    //   // this.prompt(questions, (props) => {
    //   //   this.source = props;
    //   //   console.log(props);
    //   //   done();
    //   // });
    // },
  },
  install: {
    waitForSourceInfo() {
      const done = this.async();
      Promise.all(collectingSourceInfo).then(() => {
        done();
      }, (err) => {
        this.log(err);
        process.exit(1);
      });
    },
    printProps() {
      this.log('');
      this.log('');
      this.log('');
      if (this.options.dryrun) {
        this.log('dryrun testing');
      }

      this.log(this.props);
      this.log(this.configTemplate);
    }
  },
  end: {
    sayGoodbye() {
      this.log('');
      this.log('That\'s it for the Beta right now. Thanks for trying it out!');
      this.log('');
      this.log('If you have any suggestion, please create an issue at:');
      this.log('  https://github.com/typings/generator-typings/issues');
      this.log('');
      this.log(`Hope you like the current version ${chalk.green('(until 1.0 is out)!')} :)`);
    }
  }
});
