#!/usr/bin/env node
const ELM_VER = '0.18.0';

const fs = require('fs');
const path = require('path');
const compiler = require('node-elm-compiler')
const elmiParser = require('node-elm-repl/src/parser.js');
const meow = require('meow');

const cli = meow(`
    Usage
      $ terramake [OPTIONS]

    Options
      --help                    Print this page
      --version                 Print Terramake version
      --outputFolder, -o        Path of the generated tfvars files. Default is '.'
      --singleFilePerFolder, -s Generate each tfvars file in its own folder. Default is false

    Examples
      $ terramake -o iac -s
`, {
    flags: {
        outputFolder: {
            type: 'string',
            alias: 'o',
            default: '.'
        },
        singleFilePerFolder: {
            type: 'boolean',
            alias: 's',
            default: false
        }
    }
});

const iacOutput = cli.flags.outputFolder;

if (!fs.existsSync('./elm-package.json')) {
  fail('This command needs to be executed from the root of the elm project.')
}

var elmPackageJson = JSON.parse(fs.readFileSync('./elm-package.json', 'utf8'));

const repoRegExp = /https?:\/\/github\.com\/([-\w]*)\/([-\w]*)\.git/;
var repoMatches = repoRegExp.exec(elmPackageJson.repository);
if (repoMatches == null) {
  fail('The elm-package.json contains an invalid value for the repository field.')
}
elmPackageJson.user = repoMatches[1];
elmPackageJson.package = repoMatches[2];

const elmFilePaths = elmPackageJson['source-directories'].reduce((acc, srcDir) => acc.concat(walkSync(srcDir)), []);

var targetPath = path.join(process.cwd(), iacOutput, elmPackageJson.package + '.js');
var compileOptions = { output: targetPath, yes: true, verbose: true, warn: true, processOpts: { stdio: 'pipe' } };

compiler.compile(elmFilePaths.map(pathParts => pathParts.join(path.sep)), compileOptions)
.on('close', function(exitCode) {
  if (exitCode != 0) {
    console.log();
    fail(" Ooops, something went wrong. Please be sure before using Terramake to fetch the dependencies by using elm-github-install");
  } else {
    console.log();
    success("Successfully compiled.");
    console.log();
    var Elm = require(targetPath);
    var foundMain = false
    elmFilePaths.forEach(pathParts => {
      const elmPathParts = pathParts.slice(1);
      const moduleElmiPath = getModuleElmiPath(elmPackageJson, elmPathParts);
      const buffer = fs.readFileSync(moduleElmiPath);
      var parsedModule = elmiParser.parse(buffer);

      if (isTerramakeMainModule(parsedModule)) {
        foundMain = true;
        var elmModules = elmPathParts.map(x => x.replace(/.elm/, ''));

        var iacPath = [iacOutput].concat(elmModules).concat(cli.flags.singleFilePerFolder ? ["terraform"] : []);
        var iacDirs = iacPath.slice(0, iacPath.length - 1); //cut the last one, which is the file

        iacDirs.reduce((currentPath, folder) => {
           var newPath = path.join(currentPath, folder);
           if (!fs.existsSync(newPath)){
             fs.mkdirSync(newPath);
           }
           return newPath;
         }, '');

        var elmModule = elmModules.reduce((acc, cur) => acc[cur], Elm);
        var filePath = iacPath.join(path.sep);
        elmModule.worker({ "filePath" : filePath});
        success("Generated " + green(filePath + ".tfvars"));
      }
    });
    if (!foundMain) {
      warning("No Terramake compatible main function found in any modules.");
    }
    fs.unlinkSync(targetPath);
 }
});

function isTerramakeMainModule(parsedModule) {
  return parsedModule.types.some(f =>
           f.name == 'main'
        && f.value.type =='app'

        && f.value.subject.type == 'type'
        && f.value.subject.def.name == 'Program'
        && f.value.subject.def.user == 'elm-lang'
        && f.value.subject.def.package == 'core'
        && f.value.subject.def.path[0] == 'Platform'

        && f.value.object.length == 3

        && f.value.object[0].type == 'aliased'
        && f.value.object[0].def.name == 'Flags'
        && f.value.object[0].def.user == 'karandit'
        && f.value.object[0].def.package == 'elm-terramake'
        && f.value.object[0].def.path[0] == 'Terramake'

        && f.value.object[1].type == 'type'
        && f.value.object[1].def.name == '_Tuple0'

        && f.value.object[2].type == 'type'
        && f.value.object[2].def.name == '_Tuple0');
}

function getModuleElmiPath(options, moduleNameParts) {
    return path.join('elm-stuff', 'build-artifacts', ELM_VER,
            options.user, options.package, options.version, moduleNameParts.join('-') + 'i');
}

function walkSync(dir) {
  return _walkSync([dir], []);
}

function _walkSync(dirArr, result) {
  const dir = dirArr.join(path.sep);

  fs.readdirSync(dir).forEach(file => {
    const dirFileArr = dirArr.concat([file]);

    result = fs.statSync(path.join(dir, file)).isDirectory()
      ? _walkSync(dirFileArr, result)
      : (file.endsWith('.elm') ? result.concat([dirFileArr]) : result);
  });
  return result;
}

function red(msg)     {  return "\x1b[31m" + msg + "\x1b[0m"; }
function green(msg)   {  return "\x1b[32m" + msg + "\x1b[0m"; }
function yellow(msg)  {  return "\x1b[33m" + msg + "\x1b[0m"; }

function fail(msg) {
  process.stderr.write("  " + red("❌") + "Error: " + msg)
  process.exit(1)
}
function warning(msg) {  console.log("  " + yellow("❗") + " Warning: " + msg); }
function success(msg) {  console.log("  " + green("✔︎") + " " + msg); }
